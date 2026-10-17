using CloudScope.Core.Domain.Models;

namespace CloudScope.Core.Interfaces;

/// <summary>
/// Abstraction for cloud provider resource discovery.
/// Implementations: AzureResourceGraphService, AwsConfigService.
/// </summary>
public interface ICloudProviderService
{
    /// <summary>
    /// The cloud provider this service handles.
    /// </summary>
    Domain.Enums.CloudProvider Provider { get; }

    /// <summary>
    /// Discover all resources in the configured scope.
    /// </summary>
    Task<IEnumerable<CloudResource>> DiscoverResourcesAsync(CancellationToken ct = default);

    /// <summary>
    /// Discover resources modified since a given time.
    /// </summary>
    Task<IEnumerable<CloudResource>> DiscoverChangedResourcesAsync(
        DateTime since,
        CancellationToken ct = default);

    /// <summary>
    /// Get detailed information for a specific resource.
    /// </summary>
    Task<CloudResource?> GetResourceDetailsAsync(
        string nativeResourceId,
        CancellationToken ct = default);

    /// <summary>
    /// Discover relationships for a specific resource.
    /// </summary>
    Task<IEnumerable<ResourceRelationship>> DiscoverRelationshipsAsync(
        string nativeResourceId,
        CancellationToken ct = default);
}