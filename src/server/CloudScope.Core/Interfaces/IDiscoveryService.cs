using CloudScope.Core.Domain.Models;

namespace CloudScope.Core.Interfaces;

/// <summary>
/// Orchestrates resource discovery across every connected cloud provider and
/// persists the results (resources + relationships) into the configured store.
/// </summary>
public interface IDiscoveryService
{
    /// <summary>
    /// Run a full discovery across all providers.
    /// </summary>
    Task<DiscoveryResult> DiscoverAsync(CancellationToken ct = default);

    /// <summary>
    /// Seed the store with the bundled demo estate (used when no cloud is connected).
    /// </summary>
    Task<DiscoveryResult> SeedDemoAsync(CancellationToken ct = default);
}
