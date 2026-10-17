using CloudScope.Core.Common;
using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;

namespace CloudScope.Core.Interfaces;

/// <summary>
/// Repository for cloud resource CRUD operations.
/// </summary>
public interface IResourceRepository
{
    Task<CloudResource?> GetByIdAsync(string id, CancellationToken ct = default);
    Task<PagedResult<CloudResource>> GetAllAsync(
        int pageNumber = 1,
        int pageSize = 50,
        CloudProvider? provider = null,
        ResourceType? resourceType = null,
        string? region = null,
        string? resourceGroup = null,
        string? searchTerm = null,
        CancellationToken ct = default);
    Task UpsertAsync(CloudResource resource, CancellationToken ct = default);
    Task UpsertBatchAsync(IEnumerable<CloudResource> resources, CancellationToken ct = default);
    Task DeleteAsync(string id, CancellationToken ct = default);
    Task<int> GetCountAsync(CloudProvider? provider = null, CancellationToken ct = default);
    Task<IEnumerable<CloudResource>> GetByResourceGroupAsync(string resourceGroup, CancellationToken ct = default);
    Task<IEnumerable<CloudResource>> GetByTagAsync(string key, string value, CancellationToken ct = default);
    Task<IEnumerable<CloudResource>> GetStaleAsync(TimeSpan olderThan, CancellationToken ct = default);
}