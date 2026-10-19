using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Amazon;
using Amazon.CostExplorer;
using Amazon.CostExplorer.Model;
using Amazon.Runtime;
using Azure.Core;
using Azure.Identity;
using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Core.Interfaces;
using CloudScope.Infrastructure.Configuration;
using CloudScope.Infrastructure.Helpers;
using CloudScope.Infrastructure.Services.Cost;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CloudScope.Infrastructure.Services.Azure;

/// <summary>
/// Multi-cloud cost intelligence. Daily totals are pulled live from Azure Cost
/// Management and AWS Cost Explorer when credentials are configured; per-resource
/// attribution and recommendations are derived from the discovered inventory so the
/// feature set works in every environment (including the zero-config demo).
/// </summary>
public class AzureCostService : ICostService
{
    private const string ArmScope = "https://management.azure.com/.default";

    private readonly AzureOptions _azureOptions;
    private readonly AwsOptions _awsOptions;
    private readonly IResourceRepository _resourceRepository;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<AzureCostService> _logger;
    private readonly Lazy<TokenCredential> _credential;

    public AzureCostService(
        IOptions<AzureOptions> azureOptions,
        IOptions<AwsOptions> awsOptions,
        IResourceRepository resourceRepository,
        IHttpClientFactory httpClientFactory,
        ILogger<AzureCostService> logger)
    {
        _azureOptions = azureOptions.Value;
        _awsOptions = awsOptions.Value;
        _resourceRepository = resourceRepository;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _credential = new Lazy<TokenCredential>(() =>
            !string.IsNullOrWhiteSpace(_azureOptions.ClientSecret)
                ? new ClientSecretCredential(_azureOptions.TenantId, _azureOptions.ClientId, _azureOptions.ClientSecret)
                : new DefaultAzureCredential());
    }

    private bool AzureConfigured => !string.IsNullOrWhiteSpace(_azureOptions.SubscriptionId);
    private bool AwsConfigured =>
        !string.IsNullOrWhiteSpace(_awsOptions.AccessKeyId) &&
        !string.IsNullOrWhiteSpace(_awsOptions.SecretAccessKey);

    /// <inheritdoc/>
    public async Task<CostSummary> GetCostSummaryAsync(
        DateTime startDate,
        DateTime endDate,
        CancellationToken ct = default)
    {
        var resources = await LoadResourcesAsync(ct);
        var summary = CostAnalytics.BuildSummary(resources, startDate, endDate);

        // Prefer real billing totals when the APIs are reachable.
        var live = await TryGetLiveTotalsAsync(startDate, endDate, ct);
        if (live.HasValue)
        {
            var (azure, aws) = live.Value;
            var total = azure + aws;

            if (total > 0)
            {
                var scale = summary.TotalCost > 0 ? total / summary.TotalCost : 1m;
                summary.AzureCost = Math.Round(azure, 2);
                summary.AwsCost = Math.Round(aws, 2);
                summary.TotalCost = Math.Round(total, 2);
                summary.ByResourceType = Scale(summary.ByResourceType, scale);
                summary.ByRegion = Scale(summary.ByRegion, scale);
                summary.ByResourceGroup = Scale(summary.ByResourceGroup, scale);
            }
        }

        return summary;
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<CostTrend>> GetCostTrendsAsync(
        DateTime startDate,
        DateTime endDate,
        CancellationToken ct = default)
    {
        var azureDaily = await TryGetAzureDailyAsync(startDate, endDate, ct);
        var awsDaily = await TryGetAwsDailyAsync(startDate, endDate, ct);

        if (azureDaily is null && awsDaily is null)
        {
            var resources = await LoadResourcesAsync(ct);
            return CostAnalytics.BuildTrends(resources, startDate, endDate);
        }

        var trends = new List<CostTrend>();
        for (var date = startDate.Date; date <= endDate.Date; date = date.AddDays(1))
        {
            var azure = azureDaily is not null && azureDaily.TryGetValue(date, out var a) ? a : 0m;
            var aws = awsDaily is not null && awsDaily.TryGetValue(date, out var w) ? w : 0m;

            trends.Add(new CostTrend
            {
                Date = date,
                AzureCost = Math.Round(azure, 2),
                AwsCost = Math.Round(aws, 2),
                TotalCost = Math.Round(azure + aws, 2)
            });
        }

        return trends;
    }

    /// <inheritdoc/>
    public async Task<ResourceCost?> GetResourceCostAsync(
        string resourceId,
        DateTime startDate,
        DateTime endDate,
        CancellationToken ct = default)
    {
        var resources = await LoadResourcesAsync(ct);
        var resource = resources.FirstOrDefault(r =>
            string.Equals(r.Id, resourceId, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(r.NativeId, resourceId, StringComparison.OrdinalIgnoreCase));

        if (resource is null) return null;

        return CostAnalytics.BuildResourceCosts(new[] { resource }, startDate, endDate).First();
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<CostForecast>> GetForecastAsync(
        int daysAhead = 30,
        CancellationToken ct = default)
    {
        var today = DateTime.UtcNow.Date;
        var start = today.AddDays(-29);

        var trends = (await GetCostTrendsAsync(start, today, ct)).ToList();
        var history = trends.Select(t => t.TotalCost).ToList();

        if (history.Count == 0)
        {
            var resources = await LoadResourcesAsync(ct);
            history = CostAnalytics.BuildTrends(resources, start, today).Select(t => t.TotalCost).ToList();
        }

        return CostAnalytics.Forecast(history, today, Math.Clamp(daysAhead, 1, 365));
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<CostAnomaly>> DetectAnomaliesAsync(CancellationToken ct = default)
    {
        var resources = await LoadResourcesAsync(ct);
        return CostAnalytics.DetectAnomalies(resources);
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<ResourceCost>> GetTopResourcesAsync(
        int count = 10,
        CancellationToken ct = default)
    {
        var today = DateTime.UtcNow.Date;
        var resources = await LoadResourcesAsync(ct);

        return CostAnalytics.BuildResourceCosts(resources, today.AddDays(-29), today)
            .OrderByDescending(c => c.Amount)
            .Take(Math.Clamp(count, 1, 100));
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<CostRecommendation>> GetRecommendationsAsync(CancellationToken ct = default)
    {
        var resources = await LoadResourcesAsync(ct);
        var recommendations = new List<CostRecommendation>();

        foreach (var resource in resources)
        {
            var cpu = resource.CpuUtilization;

            if (resource.ResourceType == ResourceType.VirtualMachine && cpu.HasValue)
            {
                if (cpu.Value < 10)
                {
                    recommendations.Add(new CostRecommendation
                    {
                        ResourceId = resource.Id,
                        ResourceName = resource.Name,
                        ResourceType = resource.ResourceType,
                        Provider = resource.Provider,
                        Region = resource.Region,
                        Category = "Rightsizing",
                        Title = "Downsize under-utilised virtual machine",
                        Description = $"Average CPU utilisation is {cpu.Value:0}%. Downsize one SKU to cut spend by ~50%.",
                        EstimatedMonthlySavings = Math.Round(resource.EstimatedMonthlyCost * 0.5m, 2),
                        Confidence = "Medium"
                    });
                }
                else if (cpu.Value < 20)
                {
                    recommendations.Add(new CostRecommendation
                    {
                        ResourceId = resource.Id,
                        ResourceName = resource.Name,
                        ResourceType = resource.ResourceType,
                        Provider = resource.Provider,
                        Region = resource.Region,
                        Category = "Rightsizing",
                        Title = "Review virtual machine size",
                        Description = $"Average CPU utilisation is {cpu.Value:0}%. Consider a smaller SKU or autoscaling.",
                        EstimatedMonthlySavings = Math.Round(resource.EstimatedMonthlyCost * 0.3m, 2),
                        Confidence = "Medium"
                    });
                }
            }

            if (resource.ResourceType == ResourceType.PublicIpAddress)
            {
                var associated = ResourceProperties.GetString(resource, "associated");
                if (string.Equals(associated, "none", StringComparison.OrdinalIgnoreCase) ||
                    string.IsNullOrWhiteSpace(associated))
                {
                    recommendations.Add(new CostRecommendation
                    {
                        ResourceId = resource.Id,
                        ResourceName = resource.Name,
                        ResourceType = resource.ResourceType,
                        Provider = resource.Provider,
                        Region = resource.Region,
                        Category = "IdleResource",
                        Title = "Delete unattached public IP address",
                        Description = "The public IP is not associated with a resource and is billed while idle.",
                        EstimatedMonthlySavings = resource.EstimatedMonthlyCost,
                        Confidence = "High"
                    });
                }
            }

            if (resource.ResourceType == ResourceType.Disk)
            {
                var attached = ResourceProperties.GetBool(resource, "attached");
                if (attached == false)
                {
                    recommendations.Add(new CostRecommendation
                    {
                        ResourceId = resource.Id,
                        ResourceName = resource.Name,
                        ResourceType = resource.ResourceType,
                        Provider = resource.Provider,
                        Region = resource.Region,
                        Category = "UnattachedStorage",
                        Title = "Delete unattached managed disk",
                        Description = "The disk is not attached to a virtual machine and continues to accrue charges.",
                        EstimatedMonthlySavings = resource.EstimatedMonthlyCost,
                        Confidence = "High"
                    });
                }
            }

            if (!resource.IsManagedByIaC && resource.EstimatedMonthlyCost > 0)
            {
                recommendations.Add(new CostRecommendation
                {
                    ResourceId = resource.Id,
                    ResourceName = resource.Name,
                    ResourceType = resource.ResourceType,
                    Provider = resource.Provider,
                    Region = resource.Region,
                    Category = "Governance",
                    Title = "Bring resource under Infrastructure as Code",
                    Description = "The resource was created outside of IaC, so it cannot be reproduced or cleaned up automatically.",
                    EstimatedMonthlySavings = 0m,
                    Confidence = "High"
                });
            }
        }

        return recommendations
            .OrderByDescending(r => r.EstimatedMonthlySavings)
            .ThenBy(r => r.ResourceName)
            .ToList();
    }

    // ── Live billing APIs ────────────────────────────────────────────────
    private async Task<(decimal Azure, decimal Aws)?> TryGetLiveTotalsAsync(
        DateTime start,
        DateTime end,
        CancellationToken ct)
    {
        var azure = await TryGetAzureDailyAsync(start, end, ct);
        var aws = await TryGetAwsDailyAsync(start, end, ct);

        if (azure is null && aws is null) return null;

        return (azure?.Values.Sum() ?? 0m, aws?.Values.Sum() ?? 0m);
    }

    private async Task<Dictionary<DateTime, decimal>?> TryGetAzureDailyAsync(
        DateTime start,
        DateTime end,
        CancellationToken ct)
    {
        if (!AzureConfigured) return null;

        try
        {
            var client = _httpClientFactory.CreateClient("AzureManagement");
            var token = await _credential.Value.GetTokenAsync(new TokenRequestContext(new[] { ArmScope }), ct);

            var payload = new
            {
                type = "ActualCost",
                timeframe = "Custom",
                timePeriod = new
                {
                    from = start.ToString("yyyy-MM-dd'T'00:00:00'Z'", CultureInfo.InvariantCulture),
                    to = end.ToString("yyyy-MM-dd'T'23:59:59'Z'", CultureInfo.InvariantCulture)
                },
                dataset = new
                {
                    granularity = "Daily",
                    aggregation = new
                    {
                        totalCost = new { name = "Cost", function = "Sum" }
                    }
                }
            };

            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                $"subscriptions/{_azureOptions.SubscriptionId}/providers/Microsoft.CostManagement/query?api-version=2023-11-01")
            {
                Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);

            using var response = await client.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Azure Cost Management returned {Status}; falling back to inventory estimates.",
                    (int)response.StatusCode);
                return null;
            }

            var body = await response.Content.ReadAsStringAsync(ct);
            using var document = JsonDocument.Parse(body);

            if (!document.RootElement.TryGetProperty("properties", out var properties) ||
                !properties.TryGetProperty("rows", out var rows) ||
                rows.ValueKind != JsonValueKind.Array)
            {
                return null;
            }

            var columns = properties.TryGetProperty("columns", out var columnElement)
                ? columnElement.EnumerateArray()
                    .Select(c => c.TryGetProperty("name", out var name) ? name.GetString() ?? string.Empty : string.Empty)
                    .ToList()
                : new List<string>();

            var costIndex = IndexOf(columns, "Cost", 0);
            var dateIndex = IndexOf(columns, "UsageDate", 1);

            var daily = new Dictionary<DateTime, decimal>();

            foreach (var row in rows.EnumerateArray())
            {
                if (row.ValueKind != JsonValueKind.Array) continue;

                var values = row.EnumerateArray().ToList();
                if (values.Count <= Math.Max(costIndex, dateIndex)) continue;

                if (!TryReadDecimal(values[costIndex], out var cost)) continue;
                if (!TryReadDate(values[dateIndex], out var date)) continue;

                daily[date] = daily.TryGetValue(date, out var existing) ? existing + cost : cost;
            }

            return daily.Count > 0 ? daily : null;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Azure Cost Management query failed; using inventory estimates.");
            return null;
        }
    }

    private async Task<Dictionary<DateTime, decimal>?> TryGetAwsDailyAsync(
        DateTime start,
        DateTime end,
        CancellationToken ct)
    {
        if (!AwsConfigured) return null;

        try
        {
            using var client = new AmazonCostExplorerClient(
                new BasicAWSCredentials(_awsOptions.AccessKeyId, _awsOptions.SecretAccessKey),
                RegionEndpoint.GetBySystemName(_awsOptions.Region));

            var response = await client.GetCostAndUsageAsync(new GetCostAndUsageRequest
            {
                TimePeriod = new DateInterval
                {
                    Start = start.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    End = end.AddDays(1).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
                },
                Granularity = Granularity.DAILY,
                Metrics = new List<string> { "UnblendedCost" }
            }, ct);

            var daily = new Dictionary<DateTime, decimal>();

            foreach (var result in response.ResultsByTime)
            {
                if (result.TimePeriod?.Start is null) continue;
                if (!DateTime.TryParse(result.TimePeriod.Start, CultureInfo.InvariantCulture,
                        DateTimeStyles.AssumeUniversal, out var date)) continue;

                if (!result.Total.TryGetValue("UnblendedCost", out var metric)) continue;
                if (!decimal.TryParse(metric.Amount, NumberStyles.Any, CultureInfo.InvariantCulture, out var amount))
                    continue;

                date = date.Date;
                daily[date] = daily.TryGetValue(date, out var existing) ? existing + amount : amount;
            }

            return daily.Count > 0 ? daily : null;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "AWS Cost Explorer query failed; using inventory estimates.");
            return null;
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    private async Task<List<CloudResource>> LoadResourcesAsync(CancellationToken ct)
    {
        var resources = new List<CloudResource>();
        var page = 1;
        const int pageSize = 500;

        while (true)
        {
            var batch = await _resourceRepository.GetAllAsync(page, pageSize, ct: ct);
            resources.AddRange(batch.Items);

            if (batch.Items.Count < pageSize || resources.Count >= batch.TotalCount) break;
            page++;
        }

        return resources;
    }

    private static List<CostByCategory> Scale(IEnumerable<CostByCategory> categories, decimal scale)
    {
        var list = categories.ToList();
        var sum = list.Sum(c => c.Amount);

        return list.Select(c => new CostByCategory
        {
            Category = c.Category,
            Amount = Math.Round(c.Amount * scale, 2),
            Percentage = sum <= 0 ? 0 : Math.Round((double)(c.Amount / sum) * 100, 1)
        }).ToList();
    }

    private static int IndexOf(IReadOnlyList<string> columns, string name, int fallback)
    {
        for (var i = 0; i < columns.Count; i++)
        {
            if (string.Equals(columns[i], name, StringComparison.OrdinalIgnoreCase)) return i;
        }
        return fallback;
    }

    private static bool TryReadDecimal(JsonElement element, out decimal value)
    {
        value = 0m;
        return element.ValueKind switch
        {
            JsonValueKind.Number => element.TryGetDecimal(out value),
            JsonValueKind.String => decimal.TryParse(element.GetString(), NumberStyles.Any,
                CultureInfo.InvariantCulture, out value),
            _ => false
        };
    }

    private static bool TryReadDate(JsonElement element, out DateTime value)
    {
        value = default;

        if (element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out var number))
        {
            var text = number.ToString(CultureInfo.InvariantCulture);
            return DateTime.TryParseExact(text, "yyyyMMdd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out value);
        }

        if (element.ValueKind == JsonValueKind.String)
        {
            var text = element.GetString();
            if (DateTime.TryParseExact(text, "yyyyMMdd", CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out value)) return true;
            if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out value))
            {
                value = value.Date;
                return true;
            }
        }

        return false;
    }
}
