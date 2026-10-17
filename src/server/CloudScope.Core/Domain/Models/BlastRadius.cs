using CloudScope.Core.Domain.Enums;

namespace CloudScope.Core.Domain.Models;

/// <summary>
/// Blast radius analysis result for a resource.
/// </summary>
public class BlastRadiusResult
{
    /// <summary>
    /// The resource being analyzed.
    /// </summary>
    public string ResourceId { get; set; } = string.Empty;
    public string ResourceName { get; set; } = string.Empty;

    /// <summary>
    /// Overall risk level if this resource fails.
    /// </summary>
    public RiskLevel RiskLevel { get; set; }

    /// <summary>
    /// Total number of downstream resources that would be affected.
    /// </summary>
    public int AffectedResourceCount { get; set; }

    /// <summary>
    /// Resources directly connected (1 hop).
    /// </summary>
    public List<BlastRadiusNode> DirectDependents { get; set; } = new();

    /// <summary>
    /// All transitive dependents (2+ hops).
    /// </summary>
    public List<BlastRadiusNode> TransitiveDependents { get; set; } = new();

    /// <summary>
    /// Summary of affected resource types and counts.
    /// </summary>
    public Dictionary<ResourceType, int> AffectedByType { get; set; } = new();

    /// <summary>
    /// Summary of affected regions.
    /// </summary>
    public Dictionary<string, int> AffectedByRegion { get; set; } = new();

    /// <summary>
    /// Estimated combined monthly cost of all affected resources.
    /// </summary>
    public decimal AffectedMonthlyCost { get; set; }

    /// <summary>
    /// Human-readable summary of the blast radius.
    /// </summary>
    public string Summary { get; set; } = string.Empty;
}

/// <summary>
/// A node in the blast radius dependency tree.
/// </summary>
public class BlastRadiusNode
{
    public string ResourceId { get; set; } = string.Empty;
    public string ResourceName { get; set; } = string.Empty;
    public ResourceType ResourceType { get; set; }
    public CloudProvider Provider { get; set; }
    public RelationshipType RelationshipType { get; set; }
    public int HopCount { get; set; }
    public RiskLevel ImpactRisk { get; set; }
}