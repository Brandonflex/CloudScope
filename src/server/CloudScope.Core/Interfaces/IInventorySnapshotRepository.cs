using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;

namespace CloudScope.Core.Interfaces;

/// <summary>
/// Atomically replaces a complete single-provider inventory and its relationships.
/// Implementations must reject mixed stores and leave the old snapshot intact on
/// validation failure or cancellation. This does not delete cloud resources.
/// </summary>
public interface IInventorySnapshotRepository
{
    Task ReplaceSnapshotAsync(
        CloudProvider provider, IReadOnlyList<CloudResource> resources, CancellationToken ct = default);
}
