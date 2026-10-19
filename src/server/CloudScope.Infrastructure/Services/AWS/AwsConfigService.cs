using System.Text.Json;
using Amazon;
using Amazon.ConfigService;
using Amazon.ConfigService.Model;
using Amazon.Runtime;
using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Core.Exceptions;
using CloudScope.Core.Interfaces;
using CloudScope.Infrastructure.Configuration;
using ResourceType = CloudScope.Core.Domain.Enums.ResourceType;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CloudScope.Infrastructure.Services.AWS;

/// <summary>
/// Discovers AWS resources with AWS Config advanced queries
/// (SELECT … FROM AWS::Config::ResourceCompliance style queries are not used; the
/// aggregate resource inventory is queried instead) and derives relationships from
/// the configuration payload.
/// </summary>
public class AwsConfigService : ICloudProviderService
{
    private const string SelectExpression =
        "SELECT resourceType, resourceId, resourceName, awsRegion, tags, configuration, supplementaryConfiguration";

    private readonly AwsOptions _options;
    private readonly ILogger<AwsConfigService> _logger;

    public CloudProvider Provider => CloudProvider.AWS;

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_options.AccessKeyId) &&
        !string.IsNullOrWhiteSpace(_options.SecretAccessKey);

    public AwsConfigService(IOptions<AwsOptions> options, ILogger<AwsConfigService> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<CloudResource>> DiscoverResourcesAsync(CancellationToken ct = default)
    {
        if (!IsConfigured)
        {
            _logger.LogWarning("AWS discovery skipped: no access keys configured.");
            return Array.Empty<CloudResource>();
        }

        var resources = new List<CloudResource>();

        try
        {
            using var client = CreateClient();
            string? nextToken = null;

            do
            {
                var response = await client.SelectResourceConfigAsync(new SelectResourceConfigRequest
                {
                    Expression = SelectExpression,
                    Limit = 100,
                    NextToken = nextToken
                }, ct);

                foreach (var item in response.Results)
                {
                    var resource = MapResource(item);
                    if (resource is not null) resources.Add(resource);
                }

                nextToken = response.NextToken;
            }
            while (!string.IsNullOrEmpty(nextToken));
        }
        catch (AmazonServiceException ex)
        {
            throw new CloudProviderException("AWS", $"AWS Config query failed: {ex.Message}", ex);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            throw new CloudProviderException("AWS", "AWS Config query failed.", ex);
        }

        _logger.LogInformation("AWS Config returned {Count} resources.", resources.Count);
        return resources;
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<CloudResource>> DiscoverChangedResourcesAsync(
        DateTime since,
        CancellationToken ct = default)
    {
        // AWS Config advanced queries do not expose a reliable last-modified filter,
        // so changed-resource detection falls back to a full inventory refresh.
        var all = await DiscoverResourcesAsync(ct);
        return all.Where(r => r.LastSyncedAt >= since || r.DiscoveredAt >= since).ToList();
    }

    /// <inheritdoc/>
    public Task<CloudResource?> GetResourceDetailsAsync(
        string nativeResourceId,
        CancellationToken ct = default)
    {
        // The resource inventory already carries the full configuration payload.
        return Task.FromResult<CloudResource?>(null);
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<ResourceRelationship>> DiscoverRelationshipsAsync(
        string nativeResourceId,
        CancellationToken ct = default)
    {
        var resource = await FindResourceAsync(nativeResourceId, ct);
        return resource?.Relationships ?? new List<ResourceRelationship>();
    }

    /// <summary>
    /// Maps an AWS resource type string to the CloudScope ResourceType enum.
    /// </summary>
    public static ResourceType MapResourceType(string awsResourceType)
    {
        return awsResourceType?.ToLowerInvariant() switch
        {
            "aws::ec2::instance" => ResourceType.VirtualMachine,
            "aws::lambda::function" => ResourceType.Function,
            "aws::eks::cluster" => ResourceType.KubernetesCluster,
            "aws::ecs::cluster" => ResourceType.ContainerInstance,
            "aws::ec2::vpc" => ResourceType.VirtualNetwork,
            "aws::ec2::subnet" => ResourceType.Subnet,
            "aws::ec2::networkinterface" => ResourceType.NetworkInterface,
            "aws::ec2::eip" => ResourceType.PublicIpAddress,
            "aws::ec2::securitygroup" => ResourceType.SecurityGroup,
            "aws::elasticloadbalancingv2::loadbalancer" => ResourceType.LoadBalancer,
            "aws::s3::bucket" => ResourceType.StorageAccount,
            "aws::rds::dbinstance" => ResourceType.SqlDatabase,
            "aws::dynamodb::table" => ResourceType.DynamoDbTable,
            "aws::elasticache::cluster" => ResourceType.RedisCache,
            "aws::kms::key" => ResourceType.KeyVault,
            "aws::sqs::queue" => ResourceType.Queue,
            "aws::sns::topic" => ResourceType.ServiceBus,
            "aws::cloudwatch::alarm" => ResourceType.ApplicationInsights,
            _ => ResourceType.Other
        };
    }

    // ── Internals ────────────────────────────────────────────────────────
    private AmazonConfigServiceClient CreateClient()
    {
        var credentials = new BasicAWSCredentials(_options.AccessKeyId, _options.SecretAccessKey);

        if (!string.IsNullOrWhiteSpace(_options.ServiceUrl))
        {
            var config = new AmazonConfigServiceConfig
            {
                ServiceURL = _options.ServiceUrl,
                AuthenticationRegion = _options.Region
            };
            return new AmazonConfigServiceClient(credentials, config);
        }

        return new AmazonConfigServiceClient(credentials, RegionEndpoint.GetBySystemName(_options.Region));
    }

    private CloudResource? MapResource(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;

            var resourceType = GetString(root, "resourceType") ?? string.Empty;
            var resourceId = GetString(root, "resourceId") ?? string.Empty;
            if (string.IsNullOrWhiteSpace(resourceId)) return null;

            var name = GetString(root, "resourceName") ?? resourceId.Split('/').Last();
            var region = GetString(root, "awsRegion") ?? _options.Region;
            var nativeId = resourceId.StartsWith("arn:", StringComparison.OrdinalIgnoreCase)
                ? resourceId
                : BuildArn(resourceType, resourceId, region);

            var tags = new Dictionary<string, string>();
            if (root.TryGetProperty("tags", out var tagArray) && tagArray.ValueKind == JsonValueKind.Array)
            {
                foreach (var tag in tagArray.EnumerateArray())
                {
                    var key = GetString(tag, "key");
                    if (!string.IsNullOrWhiteSpace(key))
                    {
                        tags[key] = GetString(tag, "value") ?? string.Empty;
                    }
                }
            }

            var properties = new Dictionary<string, object>();
            if (root.TryGetProperty("configuration", out var configuration))
            {
                FlattenConfiguration(configuration, properties);
            }

            var configurationItemStatus = GetString(root, "configurationItemStatus");
            var status = configurationItemStatus?.ToLowerInvariant() switch
            {
                "resourcediscovered" or "resourceincompliance" => ResourceStatus.Healthy,
                "resourcenotincompliance" => ResourceStatus.Warning,
                "resourcedeleted" or "resourcediscoverednotapplicable" => ResourceStatus.Stopped,
                _ => ResourceStatus.Unknown
            };

            var resource = new CloudResource
            {
                Id = $"aws:{nativeId.ToLowerInvariant()}",
                Provider = CloudProvider.AWS,
                NativeId = nativeId,
                Name = name,
                ResourceType = MapResourceType(resourceType),
                NativeResourceType = resourceType,
                ResourceGroup = tags.TryGetValue("aws:cloudformation:stack-name", out var stack) ? stack : "aws",
                Region = region,
                Status = status,
                Tags = tags,
                Properties = properties,
                IsManagedByIaC = tags.ContainsKey("aws:cloudformation:stack-name") ||
                                 tags.ContainsKey("terraform"),
                DiscoveredAt = DateTime.UtcNow,
                LastSyncedAt = DateTime.UtcNow
            };

            resource.Relationships = BuildRelationships(resource);
            return resource;
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Skipping unparseable AWS Config result.");
            return null;
        }
    }

    private async Task<CloudResource?> FindResourceAsync(string nativeResourceId, CancellationToken ct)
    {
        var resources = await DiscoverResourcesAsync(ct);
        return resources.FirstOrDefault(r =>
            string.Equals(r.NativeId, nativeResourceId, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(r.Id, nativeResourceId, StringComparison.OrdinalIgnoreCase));
    }

    private List<ResourceRelationship> BuildRelationships(CloudResource resource)
    {
        var relationships = new List<ResourceRelationship>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var account = ExtractAccountId(resource.NativeId) ?? _options.AccountId;

        void Link(string? targetArn, RelationshipType type)
        {
            if (string.IsNullOrWhiteSpace(targetArn) || string.IsNullOrWhiteSpace(account)) return;

            var targetId = $"aws:{targetArn.ToLowerInvariant()}";
            if (string.Equals(targetId, resource.Id, StringComparison.OrdinalIgnoreCase)) return;
            if (!seen.Add(targetId)) return;

            relationships.Add(new ResourceRelationship
            {
                SourceResourceId = resource.Id,
                TargetResourceId = targetId,
                RelationshipType = type,
                Description = $"Detected reference to {targetArn}"
            });
        }

        void LinkAws(string? id, string service, string resourceType, RelationshipType type)
        {
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(account)) return;
            Link($"arn:aws:{service}:{resource.Region}:{account}:{resourceType}/{id}", type);
        }

        if (resource.Properties.TryGetValue("subnetId", out var subnetId))
            LinkAws(subnetId?.ToString(), "ec2", "subnet", RelationshipType.DependsOn);

        if (resource.Properties.TryGetValue("vpcId", out var vpcId))
            LinkAws(vpcId?.ToString(), "ec2", "vpc", RelationshipType.DependsOn);

        if (resource.Properties.TryGetValue("securityGroups", out var groups) && groups is string groupJson)
        {
            try
            {
                using var document = JsonDocument.Parse(groupJson);
                if (document.RootElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var group in document.RootElement.EnumerateArray())
                    {
                        if (group.TryGetProperty("groupId", out var groupId) &&
                            groupId.ValueKind == JsonValueKind.String)
                        {
                            LinkAws(groupId.GetString(), "ec2", "security-group", RelationshipType.SecuredBy);
                        }
                    }
                }
            }
            catch (JsonException)
            {
                // Ignore malformed supplementary configuration.
            }
        }

        return relationships;
    }

    private static void FlattenConfiguration(JsonElement configuration, IDictionary<string, object> target)
    {
        if (configuration.ValueKind != JsonValueKind.Object) return;

        foreach (var property in configuration.EnumerateObject())
        {
            target[property.Name] = property.Value.ValueKind switch
            {
                JsonValueKind.String => property.Value.GetString() ?? string.Empty,
                JsonValueKind.Number => property.Value.GetRawText(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                JsonValueKind.Null or JsonValueKind.Undefined => string.Empty,
                _ => property.Value.GetRawText()
            };
        }
    }

    private static string BuildArn(string resourceType, string resourceId, string region)
    {
        // Best effort: AWS Config ids are frequently already ARNs. Otherwise use a
        // deterministic pseudo-ARN so the resource id remains stable across syncs.
        var account = ExtractAccountId(resourceId) ?? "unknown";
        var service = resourceType.ToLowerInvariant() switch
        {
            "aws::ec2::instance" => "ec2",
            "aws::ec2::vpc" => "ec2",
            "aws::ec2::subnet" => "ec2",
            "aws::s3::bucket" => "s3",
            "aws::rds::dbinstance" => "rds",
            "aws::lambda::function" => "lambda",
            "aws::dynamodb::table" => "dynamodb",
            "aws::sqs::queue" => "sqs",
            "aws::sns::topic" => "sns",
            "aws::eks::cluster" => "eks",
            "aws::kms::key" => "kms",
            _ => "config"
        };

        var typePart = resourceType.Split("::").Last().ToLowerInvariant();
        return $"arn:aws:{service}:{region}:{account}:{typePart}/{resourceId}";
    }

    private static string? ExtractAccountId(string? arn)
    {
        if (string.IsNullOrWhiteSpace(arn) || !arn.StartsWith("arn:", StringComparison.OrdinalIgnoreCase))
            return null;

        var segments = arn.Split(':');
        return segments.Length > 4 && segments[4].Length == 12 ? segments[4] : null;
    }

    private static string? GetString(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}
