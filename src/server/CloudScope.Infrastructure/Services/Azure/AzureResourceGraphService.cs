using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Azure.Core;
using Azure.Identity;
using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Core.Exceptions;
using CloudScope.Core.Interfaces;
using CloudScope.Infrastructure.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CloudScope.Infrastructure.Services.Azure;

/// <summary>
/// Discovers Azure resources with the Azure Resource Graph REST API, authenticated
/// with either a service principal (client secret) or DefaultAzureCredential
/// (managed identity / developer login).
/// </summary>
public class AzureResourceGraphService : ICloudProviderService
{
    private const string ArmScope = "https://management.azure.com/.default";
    private const string ResourceGraphApiVersion = "2022-10-01";

    private static readonly string[] DefaultQueryFields =
    {
        "id", "name", "type", "resourceGroup", "location", "tags",
        "properties", "sku", "kind", "managedBy", "identity", "zones"
    };

    private readonly AzureOptions _options;
    private readonly ILogger<AzureResourceGraphService> _logger;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly Lazy<TokenCredential> _credential;

    public CloudProvider Provider => CloudProvider.Azure;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_options.SubscriptionId);

    public AzureResourceGraphService(
        IOptions<AzureOptions> options,
        IHttpClientFactory httpClientFactory,
        ILogger<AzureResourceGraphService> logger)
    {
        _options = options.Value;
        _httpClientFactory = httpClientFactory;
        _logger = logger;

        _credential = new Lazy<TokenCredential>(CreateCredential);
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<CloudResource>> DiscoverResourcesAsync(CancellationToken ct = default)
    {
        if (!IsConfigured)
        {
            _logger.LogWarning("Azure discovery skipped: no SubscriptionId configured.");
            return Array.Empty<CloudResource>();
        }

        var query = $"Resources | project {string.Join(", ", DefaultQueryFields)} | order by name asc";
        return await QueryResourceGraphAsync(query, ct);
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<CloudResource>> DiscoverChangedResourcesAsync(
        DateTime since,
        CancellationToken ct = default)
    {
        if (!IsConfigured) return Array.Empty<CloudResource>();

        // Not every resource type exposes lastModifiedDateTime, so guard the filter
        // with isnotnull() and fall back to a full query if Resource Graph rejects it.
        var query = $"Resources | where isnotnull(properties.lastModifiedDateTime) " +
                    $"| where todatetime(properties.lastModifiedDateTime) >= datetime({since:yyyy-MM-ddTHH:mm:ssZ}) " +
                    $"| project {string.Join(", ", DefaultQueryFields)}";

        try
        {
            return await QueryResourceGraphAsync(query, ct);
        }
        catch (CloudProviderException ex)
        {
            _logger.LogWarning(ex, "Incremental Azure query failed; falling back to full discovery.");
            return await DiscoverResourcesAsync(ct);
        }
    }

    /// <inheritdoc/>
    public async Task<CloudResource?> GetResourceDetailsAsync(
        string nativeResourceId,
        CancellationToken ct = default)
    {
        if (!IsConfigured) return null;

        var escaped = nativeResourceId.Replace("'", "''");
        var query = $"Resources | where id =~ '{escaped}' | project {string.Join(", ", DefaultQueryFields)}";
        var results = await QueryResourceGraphAsync(query, ct);
        return results.FirstOrDefault();
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<ResourceRelationship>> DiscoverRelationshipsAsync(
        string nativeResourceId,
        CancellationToken ct = default)
    {
        if (!IsConfigured) return Array.Empty<ResourceRelationship>();

        var resource = await GetResourceDetailsAsync(nativeResourceId, ct);
        if (resource is null) return Array.Empty<ResourceRelationship>();

        return resource.Relationships;
    }

    /// <summary>
    /// Maps an Azure resource type string to the CloudScope ResourceType enum.
    /// </summary>
    public static ResourceType MapResourceType(string azureResourceType)
    {
        return azureResourceType?.ToLowerInvariant() switch
        {
            "microsoft.compute/virtualmachines" => ResourceType.VirtualMachine,
            "microsoft.compute/disks" => ResourceType.Disk,
            "microsoft.web/sites" => ResourceType.AppService,
            "microsoft.web/sites/functions" => ResourceType.Function,
            "microsoft.web/serverfarms" => ResourceType.Other,
            "microsoft.containerinstance/containergroups" => ResourceType.ContainerInstance,
            "microsoft.containerservice/managedclusters" => ResourceType.KubernetesCluster,
            "microsoft.containerregistry/registries" => ResourceType.Other,
            "microsoft.network/virtualnetworks" => ResourceType.VirtualNetwork,
            "microsoft.network/virtualnetworks/subnets" => ResourceType.Subnet,
            "microsoft.network/networkinterfaces" => ResourceType.NetworkInterface,
            "microsoft.network/publicipaddresses" => ResourceType.PublicIpAddress,
            "microsoft.network/loadbalancers" => ResourceType.LoadBalancer,
            "microsoft.network/applicationgateways" => ResourceType.ApplicationGateway,
            "microsoft.network/dnszones" => ResourceType.DnsZone,
            "microsoft.network/azurefirewalls" => ResourceType.Firewall,
            "microsoft.network/networksecuritygroups" => ResourceType.NetworkSecurityGroup,
            "microsoft.network/virtualnetworkgateways" => ResourceType.VpnGateway,
            "microsoft.storage/storageaccounts" => ResourceType.StorageAccount,
            "microsoft.storage/storageaccounts/blobservices" => ResourceType.BlobContainer,
            "microsoft.storage/storageaccounts/fileservices" => ResourceType.FileShare,
            "microsoft.sql/servers" => ResourceType.SqlDatabase,
            "microsoft.sql/servers/databases" => ResourceType.SqlDatabase,
            "microsoft.documentdb/databaseaccounts" => ResourceType.CosmosDbAccount,
            "microsoft.cache/redis" => ResourceType.RedisCache,
            "microsoft.dbformysql/flexibleservers" => ResourceType.MySql,
            "microsoft.dbforpostgresql/flexibleservers" => ResourceType.PostgreSql,
            "microsoft.managedidentity/userassignedidentities" => ResourceType.ManagedIdentity,
            "microsoft.keyvault/vaults" => ResourceType.KeyVault,
            "microsoft.authorization/roleassignments" => ResourceType.RoleAssignment,
            "microsoft.servicebus/namespaces" => ResourceType.ServiceBus,
            "microsoft.eventhub/namespaces" => ResourceType.EventHub,
            "microsoft.operationalinsights/workspaces" => ResourceType.LogAnalytics,
            "microsoft.insights/components" => ResourceType.ApplicationInsights,
            "microsoft.resources/resourcegroups" => ResourceType.ResourceGroup,
            "microsoft.resources/subscriptions" => ResourceType.Subscription,
            _ => ResourceType.Other
        };
    }

    // ── Internals ────────────────────────────────────────────────────────
    private TokenCredential CreateCredential()
    {
        if (!string.IsNullOrWhiteSpace(_options.ClientSecret) &&
            !string.IsNullOrWhiteSpace(_options.ClientId) &&
            !string.IsNullOrWhiteSpace(_options.TenantId))
        {
            _logger.LogInformation("Azure: using service principal credentials.");
            return new ClientSecretCredential(_options.TenantId, _options.ClientId, _options.ClientSecret);
        }

        _logger.LogInformation("Azure: using DefaultAzureCredential.");
        return new DefaultAzureCredential();
    }

    private async Task<List<CloudResource>> QueryResourceGraphAsync(string query, CancellationToken ct)
    {
        var client = _httpClientFactory.CreateClient("AzureManagement");
        var resources = new List<CloudResource>();
        string? skipToken = null;

        do
        {
            var payload = new Dictionary<string, object?>
            {
                ["subscriptions"] = new[] { _options.SubscriptionId },
                ["query"] = query,
                ["options"] = new Dictionary<string, object?>
                {
                    ["$top"] = 1000,
                    ["resultFormat"] = "objectArray",
                    ["$skipToken"] = skipToken
                }
            };

            var token = await _credential.Value.GetTokenAsync(new TokenRequestContext(new[] { ArmScope }), ct);

            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                $"providers/Microsoft.ResourceGraph/resources?api-version={ResourceGraphApiVersion}")
            {
                Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);

            try
            {
                using var response = await client.SendAsync(request, ct);
                var body = await response.Content.ReadAsStringAsync(ct);

                if (!response.IsSuccessStatusCode)
                {
                    throw new CloudProviderException(
                        "Azure",
                        $"Resource Graph returned {(int)response.StatusCode}: {Truncate(body, 512)}");
                }

                using var document = JsonDocument.Parse(body);
                var root = document.RootElement;

                if (root.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
                {
                    foreach (var row in data.EnumerateArray())
                    {
                        var resource = MapResource(row);
                        if (resource is not null) resources.Add(resource);
                    }
                }

                skipToken = root.TryGetProperty("$skipToken", out var next) && next.ValueKind == JsonValueKind.String
                    ? next.GetString()
                    : null;
            }
            catch (CloudProviderException)
            {
                throw;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                throw new CloudProviderException("Azure", "Resource Graph query failed.", ex);
            }
        }
        while (!string.IsNullOrEmpty(skipToken));

        _logger.LogInformation("Azure Resource Graph returned {Count} resources.", resources.Count);
        return resources;
    }

    private CloudResource? MapResource(JsonElement row)
    {
        var id = GetString(row, "id");
        if (string.IsNullOrWhiteSpace(id)) return null;

        var type = GetString(row, "type") ?? string.Empty;
        var name = GetString(row, "name") ?? id.Split('/').Last();
        var resourceGroup = GetString(row, "resourceGroup") ?? ExtractResourceGroup(id);

        var properties = new Dictionary<string, object>();
        if (row.TryGetProperty("properties", out var props) && props.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in props.EnumerateObject())
            {
                properties[property.Name] = property.Value.Clone();
            }
        }

        var tags = new Dictionary<string, string>();
        if (row.TryGetProperty("tags", out var tagElement) && tagElement.ValueKind == JsonValueKind.Object)
        {
            foreach (var tag in tagElement.EnumerateObject())
            {
                tags[tag.Name] = tag.Value.ValueKind == JsonValueKind.String
                    ? tag.Value.GetString() ?? string.Empty
                    : tag.Value.ToString();
            }
        }

        var status = ResourceStatus.Unknown;
        if (props.ValueKind == JsonValueKind.Object &&
            props.TryGetProperty("provisioningState", out var state) &&
            state.ValueKind == JsonValueKind.String)
        {
            status = state.GetString()?.ToLowerInvariant() switch
            {
                "succeeded" => ResourceStatus.Healthy,
                "failed" => ResourceStatus.Critical,
                "updating" or "creating" => ResourceStatus.Provisioning,
                "deleting" => ResourceStatus.Deprovisioning,
                _ => ResourceStatus.Unknown
            };
        }

        var resource = new CloudResource
        {
            Id = $"az:{id.ToLowerInvariant()}",
            Provider = CloudProvider.Azure,
            NativeId = id,
            Name = name,
            ResourceType = MapResourceType(type),
            NativeResourceType = type,
            ResourceGroup = resourceGroup,
            Region = GetString(row, "location") ?? string.Empty,
            Status = status,
            Tags = tags,
            Properties = properties,
            IsManagedByIaC = tags.ContainsKey("managedBy") &&
                             !string.Equals(tags["managedBy"], "manual", StringComparison.OrdinalIgnoreCase),
            DiscoveredAt = DateTime.UtcNow,
            LastSyncedAt = DateTime.UtcNow
        };

        // Derive relationships immediately from the resource payload (no extra API call).
        CollectArmReferences(row, string.Empty, resource.Id, resource.Relationships,
            new HashSet<string>(StringComparer.OrdinalIgnoreCase));

        return resource;
    }

    private static void CollectArmReferences(
        JsonElement element,
        string path,
        string selfId,
        ICollection<ResourceRelationship> results,
        ISet<string> seen)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var property in element.EnumerateObject())
                {
                    CollectArmReferences(property.Value, $"{path}.{property.Name}", selfId, results, seen);
                }
                break;

            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                {
                    CollectArmReferences(item, path, selfId, results, seen);
                }
                break;

            case JsonValueKind.String:
                var value = element.GetString();
                if (string.IsNullOrWhiteSpace(value) ||
                    !value.StartsWith("/subscriptions/", StringComparison.OrdinalIgnoreCase))
                {
                    return;
                }

                var targetId = $"az:{value.ToLowerInvariant()}";
                if (string.Equals(targetId, selfId, StringComparison.OrdinalIgnoreCase)) return;
                if (!seen.Add(targetId)) return;

                var relationshipType = ResolveRelationshipType(path);

                results.Add(new ResourceRelationship
                {
                    SourceResourceId = selfId,
                    TargetResourceId = targetId,
                    RelationshipType = relationshipType,
                    Description = $"Detected reference to {value}",
                    Properties = new Dictionary<string, string> { ["path"] = path }
                });
                return;
        }
    }

    private static RelationshipType ResolveRelationshipType(string path)
    {
        var lower = path.ToLowerInvariant();

        if (lower.Contains("securitygroup") || lower.Contains("nsg")) return RelationshipType.SecuredBy;
        if (lower.Contains("subnet")) return RelationshipType.DependsOn;
        if (lower.Contains("publicip")) return RelationshipType.ConnectsTo;
        if (lower.Contains("loadbalancer")) return RelationshipType.RoutesTo;
        if (lower.Contains("workspace")) return RelationshipType.Monitors;
        if (lower.Contains("keyvault") || lower.Contains("vault")) return RelationshipType.ConnectsTo;
        return RelationshipType.DependsOn;
    }

    private static string? GetString(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static string ExtractResourceGroup(string resourceId)
    {
        var segments = resourceId.Split('/', StringSplitOptions.RemoveEmptyEntries);
        var index = Array.FindIndex(segments, s => string.Equals(s, "resourceGroups", StringComparison.OrdinalIgnoreCase));
        return index >= 0 && index + 1 < segments.Length ? segments[index + 1] : string.Empty;
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max] + "…";
}
