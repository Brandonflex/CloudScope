using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Core.Interfaces;
using CloudScope.Infrastructure.Configuration;
using CloudScope.Infrastructure.Services.Ai;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CloudScope.Infrastructure.Services.Azure;

/// <summary>
/// Natural-language query service. When Azure OpenAI is configured the question is
/// answered by GPT-4 grounded in the live resource inventory (RAG); otherwise a
/// deterministic local engine answers using the same graph operations.
/// </summary>
public class AzureAIQueryService : IAIQueryService
{
    private readonly AzureOpenAIOptions _options;
    private readonly IResourceRepository _resourceRepository;
    private readonly IBlastRadiusService _blastRadiusService;
    private readonly IComplianceService _complianceService;
    private readonly ICostService _costService;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<AzureAIQueryService> _logger;

    public AzureAIQueryService(
        IOptions<AzureOpenAIOptions> options,
        IResourceRepository resourceRepository,
        IBlastRadiusService blastRadiusService,
        IComplianceService complianceService,
        ICostService costService,
        IHttpClientFactory httpClientFactory,
        ILogger<AzureAIQueryService> logger)
    {
        _options = options.Value;
        _resourceRepository = resourceRepository;
        _blastRadiusService = blastRadiusService;
        _complianceService = complianceService;
        _costService = costService;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <summary>
    /// True when Azure OpenAI is configured, so answers are LLM-generated.
    /// </summary>
    public bool IsAiEnabled =>
        !string.IsNullOrWhiteSpace(_options.Endpoint) && !string.IsNullOrWhiteSpace(_options.ApiKey);

    /// <inheritdoc/>
    public async Task<AIQueryResult> QueryAsync(string question, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var resources = await LoadResourcesAsync(ct);

        if (!IsAiEnabled)
        {
            var local = await LocalQueryEngine.AnswerAsync(
                question, resources, _blastRadiusService, _complianceService, _costService, ct);

            local.ProcessingTime = sw.Elapsed;
            return local;
        }

        try
        {
            var result = await QueryAzureOpenAIAsync(question, resources, ct);
            result.ProcessingTime = sw.Elapsed;
            return result;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Azure OpenAI query failed; falling back to the local query engine.");

            var fallback = await LocalQueryEngine.AnswerAsync(
                question, resources, _blastRadiusService, _complianceService, _costService, ct);

            fallback.ProcessingTime = sw.Elapsed;
            fallback.Source = "Local (AI unavailable)";
            return fallback;
        }
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<string>> GetSuggestionsAsync(CancellationToken ct = default)
    {
        var resources = await LoadResourcesAsync(ct);
        return LocalQueryEngine.Suggestions(resources);
    }

    // ── Azure OpenAI ─────────────────────────────────────────────────────
    private async Task<AIQueryResult> QueryAzureOpenAIAsync(
        string question,
        IReadOnlyList<CloudResource> resources,
        CancellationToken ct)
    {
        var endpoint = _options.Endpoint.TrimEnd('/');
        var url = $"{endpoint}/openai/deployments/{_options.DeploymentName}/chat/completions" +
                  "?api-version=2024-08-01-preview";

        var payload = new
        {
            messages = new object[]
            {
                new
                {
                    role = "system",
                    content =
                        "You are CloudScope, an assistant for a multi-cloud infrastructure platform. " +
                        "Answer ONLY using the provided inventory context. Respond with a JSON object: " +
                        "{\"answer\": \"concise, specific answer\", \"generatedQuery\": \"pseudo resource-graph query\", " +
                        "\"resourceIds\": [\"ids of resources that support the answer, max 25\"]}. " +
                        "Use dollar amounts with two decimals. If the answer cannot be determined, say so in 'answer' and return []."
                },
                new
                {
                    role = "user",
                    content = $"INVENTORY CONTEXT\n{BuildContext(resources)}\n\nQUESTION\n{question}"
                }
            },
            temperature = _options.Temperature,
            max_tokens = _options.MaxTokens,
            response_format = new { type = "json_object" }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };
        request.Headers.Add("api-key", _options.ApiKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        var client = _httpClientFactory.CreateClient("AzureOpenAI");
        client.Timeout = TimeSpan.FromSeconds(60);

        using var response = await client.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Azure OpenAI returned {(int)response.StatusCode}: {body[..Math.Min(body.Length, 300)]}");
        }

        using var document = JsonDocument.Parse(body);
        var content = document.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString() ?? "{}";

        var parsed = ParseCompletion(content);
        var byId = resources.ToDictionary(r => r.Id, StringComparer.OrdinalIgnoreCase);

        var data = parsed.ResourceIds
            .Select(id => byId.TryGetValue(id, out var resource) ? resource : null)
            .Where(r => r is not null)
            .Select(r => new
            {
                id = r!.Id,
                name = r.Name,
                type = r.ResourceType.ToString(),
                provider = r.Provider.ToString(),
                region = r.Region,
                monthlyCost = r.EstimatedMonthlyCost,
                status = r.Status.ToString()
            })
            .ToList();

        return new AIQueryResult
        {
            Question = question,
            Answer = parsed.Answer,
            GeneratedQuery = parsed.Query,
            Data = data,
            Success = true,
            Source = "AzureOpenAI"
        };
    }

    private static (string Answer, string Query, List<string> ResourceIds) ParseCompletion(string content)
    {
        try
        {
            using var document = JsonDocument.Parse(content);
            var root = document.RootElement;

            var answer = root.TryGetProperty("answer", out var answerElement)
                ? answerElement.GetString() ?? string.Empty
                : content;

            var query = root.TryGetProperty("generatedQuery", out var queryElement)
                ? queryElement.GetString() ?? string.Empty
                : string.Empty;

            var ids = new List<string>();
            if (root.TryGetProperty("resourceIds", out var idsElement) && idsElement.ValueKind == JsonValueKind.Array)
            {
                ids.AddRange(idsElement.EnumerateArray()
                    .Where(e => e.ValueKind == JsonValueKind.String)
                    .Select(e => e.GetString()!)
                    .Where(id => !string.IsNullOrWhiteSpace(id)));
            }

            return (answer, query, ids);
        }
        catch (JsonException)
        {
            return (content, string.Empty, new List<string>());
        }
    }

    private static string BuildContext(IReadOnlyList<CloudResource> resources)
    {
        var builder = new StringBuilder();
        builder.AppendLine($"Total resources: {resources.Count}. " +
                           $"Azure: {resources.Count(r => r.Provider == CloudProvider.Azure)}, " +
                           $"AWS: {resources.Count(r => r.Provider == CloudProvider.AWS)}. " +
                           $"Estimated monthly spend: ${resources.Sum(r => r.EstimatedMonthlyCost):0.00}.");
        builder.AppendLine("id | name | type | provider | region | resourceGroup | status | monthlyCost | cpu% | iac");
        builder.AppendLine(new string('-', 80));

        foreach (var resource in resources
                     .OrderByDescending(r => r.EstimatedMonthlyCost)
                     .ThenBy(r => r.Name)
                     .Take(40))
        {
            builder.AppendLine(string.Join(" | ",
                resource.Id,
                resource.Name,
                resource.ResourceType,
                resource.Provider,
                resource.Region,
                resource.ResourceGroup,
                resource.Status,
                resource.EstimatedMonthlyCost.ToString("0.00"),
                resource.CpuUtilization?.ToString("0") ?? "-",
                resource.IsManagedByIaC ? "yes" : "no"));
        }

        return builder.ToString();
    }

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
}
