using CloudScope.Core.Domain.Enums;

namespace CloudScope.Core.Domain.Models;

/// <summary>
/// A right-sizing / waste-elimination recommendation produced by the cost analyzer.
/// </summary>
public class CostRecommendation
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ResourceId { get; set; } = string.Empty;
    public string ResourceName { get; set; } = string.Empty;
    public ResourceType ResourceType { get; set; }
    public CloudProvider Provider { get; set; }
    public string Region { get; set; } = string.Empty;

    /// <summary>
    /// Category such as Rightsizing, IdleResource, UnattachedStorage or Governance.
    /// </summary>
    public string Category { get; set; } = string.Empty;

    /// <summary>
    /// Short title shown in the UI.
    /// </summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// Explanation of why the recommendation was produced.
    /// </summary>
    public string Description { get; set; } = string.Empty;

    /// <summary>
    /// Estimated monthly saving in USD.
    /// </summary>
    public decimal EstimatedMonthlySavings { get; set; }

    /// <summary>
    /// Low / Medium / High confidence.
    /// </summary>
    public string Confidence { get; set; } = "Medium";
}

/// <summary>
/// Result of a discovery run across all connected cloud providers.
/// </summary>
public class DiscoveryResult
{
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime CompletedAt { get; set; } = DateTime.UtcNow;
    public TimeSpan Duration => CompletedAt - StartedAt;
    public int ResourcesDiscovered { get; set; }
    public int RelationshipsDiscovered { get; set; }
    public bool DemoMode { get; set; }
    public List<ProviderDiscoveryResult> Providers { get; set; } = new();
}

/// <summary>
/// Per-provider discovery outcome.
/// </summary>
public class ProviderDiscoveryResult
{
    public CloudProvider Provider { get; set; }
    public bool Configured { get; set; }
    public int ResourcesDiscovered { get; set; }
    public int RelationshipsDiscovered { get; set; }
    public string? Error { get; set; }
}

/// <summary>
/// Runtime status of the CloudScope deployment, surfaced on the dashboard.
/// </summary>
public class PlatformStatus
{
    public string Version { get; set; } = "1.0.0";
    public bool DemoMode { get; set; }
    /// <summary>Whether this server exposes the SignalR notifications hub.</summary>
    public bool RealtimeAvailable { get; set; } = true;
    public string StorageProvider { get; set; } = "InMemory";
    public string AiMode { get; set; } = "Local";
    public List<string> ConfiguredProviders { get; set; } = new();
    public int ResourceCount { get; set; }
    public int RelationshipCount { get; set; }
    public DateTime? LastDiscoveryAt { get; set; }
    public DateTime ServerTimeUtc { get; set; } = DateTime.UtcNow;
}
