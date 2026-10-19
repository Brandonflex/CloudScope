using CloudScope.Core.Domain.Enums;

namespace CloudScope.Core.Domain.Models;

/// <summary>
/// Represents a discovered cloud resource from Azure or AWS.
/// </summary>
public class CloudResource
{
    /// <summary>
    /// Unique identifier (composite of cloud provider + resource ID).
    /// </summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// The cloud provider this resource belongs to.
    /// </summary>
    public CloudProvider Provider { get; set; }

    /// <summary>
    /// Provider-specific resource ID (ARM resource ID or AWS ARN).
    /// </summary>
    public string NativeId { get; set; } = string.Empty;

    /// <summary>
    /// Human-readable resource name.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// The type/category of this resource.
    /// </summary>
    public ResourceType ResourceType { get; set; }

    /// <summary>
    /// Provider-specific resource type string (e.g., "Microsoft.Compute/virtualMachines").
    /// </summary>
    public string NativeResourceType { get; set; } = string.Empty;

    /// <summary>
    /// Azure resource group or AWS stack/project name.
    /// </summary>
    public string ResourceGroup { get; set; } = string.Empty;

    /// <summary>
    /// Cloud region/location.
    /// </summary>
    public string Region { get; set; } = string.Empty;

    /// <summary>
    /// Current status of the resource.
    /// </summary>
    public ResourceStatus Status { get; set; } = ResourceStatus.Unknown;

    /// <summary>
    /// User-defined tags/labels.
    /// </summary>
    public Dictionary<string, string> Tags { get; set; } = new();

    /// <summary>
    /// Provider-specific metadata (SKU, size, configuration, etc.).
    /// </summary>
    public Dictionary<string, object> Properties { get; set; } = new();

    /// <summary>
    /// Monthly estimated cost in USD.
    /// </summary>
    public decimal EstimatedMonthlyCost { get; set; }

    /// <summary>
    /// CPU utilization percentage (0-100), null if not applicable.
    /// </summary>
    public double? CpuUtilization { get; set; }

    /// <summary>
    /// Memory utilization percentage (0-100), null if not applicable.
    /// </summary>
    public double? MemoryUtilization { get; set; }

    /// <summary>
    /// When this resource was first discovered.
    /// </summary>
    public DateTime DiscoveredAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// When this resource was last synced/updated.
    /// </summary>
    public DateTime LastSyncedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Whether this resource was created/managed by IaC (Terraform, Bicep, etc.).
    /// </summary>
    public bool IsManagedByIaC { get; set; }

    /// <summary>
    /// Compliance status across all applicable policies.
    /// </summary>
    public ComplianceStatus ComplianceStatus { get; set; } = ComplianceStatus.Unknown;

    /// <summary>
    /// Direct relationships to other resources.
    /// </summary>
    public List<ResourceRelationship> Relationships { get; set; } = new();
}

/// <summary>
/// Represents a directional relationship between two cloud resources.
/// </summary>
public class ResourceRelationship
{
    /// <summary>
    /// Unique identifier for this relationship.
    /// </summary>
    public string Id { get; set; } = Guid.NewGuid().ToString();

    /// <summary>
    /// The source resource ID.
    /// </summary>
    public string SourceResourceId { get; set; } = string.Empty;

    /// <summary>
    /// The target resource ID.
    /// </summary>
    public string TargetResourceId { get; set; } = string.Empty;

    /// <summary>
    /// The type of relationship.
    /// </summary>
    public RelationshipType RelationshipType { get; set; }

    /// <summary>
    /// Human-readable description of the relationship.
    /// </summary>
    public string? Description { get; set; }

    /// <summary>
    /// Additional metadata about the relationship.
    /// </summary>
    public Dictionary<string, string> Properties { get; set; } = new();
}