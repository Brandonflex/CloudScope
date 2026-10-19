using CloudScope.Core.Common;
using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Core.Interfaces;
using CloudScope.Infrastructure.Persistence;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;

namespace CloudScope.Infrastructure.Repositories;

/// <summary>
/// Cosmos DB (SQL API) implementation of the resource repository.
/// Selected with Platform:StorageProvider = "Cosmos".
/// </summary>
public class CosmosResourceRepository : IResourceRepository
{
    private const int MaxPageSize = 500;

    private readonly CosmosDatabase _database;
    private readonly ILogger<CosmosResourceRepository> _logger;

    public CosmosResourceRepository(CosmosDatabase database, ILogger<CosmosResourceRepository> logger)
    {
        _database = database;
        _logger = logger;
    }

    public async Task<CloudResource?> GetByIdAsync(string id, CancellationToken ct = default)
    {
        var container = await _database.GetResourcesContainerAsync(ct);
        var query = new QueryDefinition("SELECT * FROM c WHERE c.id = @id")
            .WithParameter("@id", id);

        var iterator = container.GetItemQueryIterator<CloudResource>(
            query, requestOptions: new QueryRequestOptions { MaxItemCount = 1 });

        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync(ct);
            var item = page.FirstOrDefault();
            if (item is not null) return item;
        }

        return null;
    }

    public async Task<PagedResult<CloudResource>> GetAllAsync(
        int pageNumber = 1,
        int pageSize = 50,
        CloudProvider? provider = null,
        ResourceType? resourceType = null,
        string? region = null,
        string? resourceGroup = null,
        string? searchTerm = null,
        CancellationToken ct = default)
    {
        pageNumber = Math.Max(1, pageNumber);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var (where, parameters) = BuildFilters(provider, resourceType, region, resourceGroup, searchTerm);

        var container = await _database.GetResourcesContainerAsync(ct);

        var countQuery = BuildQuery($"SELECT VALUE COUNT(1) FROM c {where}", parameters);
        var countIterator = container.GetItemQueryIterator<int>(countQuery);
        var total = 0;
        while (countIterator.HasMoreResults)
        {
            var countPage = await countIterator.ReadNextAsync(ct);
            total += countPage.FirstOrDefault();
        }

        var offset = (pageNumber - 1) * pageSize;
        var query = BuildQuery(
            $"SELECT * FROM c {where} ORDER BY c.name OFFSET {offset} LIMIT {pageSize}", parameters);

        var results = new List<CloudResource>();
        var iterator = container.GetItemQueryIterator<CloudResource>(
            query, requestOptions: new QueryRequestOptions { MaxItemCount = pageSize });

        while (iterator.HasMoreResults && results.Count < pageSize)
        {
            var page = await iterator.ReadNextAsync(ct);
            results.AddRange(page);
        }

        return new PagedResult<CloudResource>
        {
            Items = results.Take(pageSize).ToList(),
            TotalCount = total,
            PageNumber = pageNumber,
            PageSize = pageSize
        };
    }

    public async Task UpsertAsync(CloudResource resource, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(resource.Id))
            resource.Id = $"{resource.Provider.ToString().ToLowerInvariant()}:{resource.NativeId}";

        resource.LastSyncedAt = DateTime.UtcNow;

        var container = await _database.GetResourcesContainerAsync(ct);

        try
        {
            await container.UpsertItemAsync(resource, new PartitionKey((int)resource.Provider), cancellationToken: ct);
        }
        catch (CosmosException ex)
        {
            _logger.LogError(ex, "Failed to upsert resource {ResourceId} (status {Status}).",
                resource.Id, ex.StatusCode);
            throw;
        }
    }

    public async Task UpsertBatchAsync(IEnumerable<CloudResource> resources, CancellationToken ct = default)
    {
        foreach (var resource in resources)
        {
            await UpsertAsync(resource, ct);
        }
    }

    public async Task DeleteAsync(string id, CancellationToken ct = default)
    {
        var resource = await GetByIdAsync(id, ct);
        if (resource is null) return;

        var container = await _database.GetResourcesContainerAsync(ct);
        await container.DeleteItemAsync<CloudResource>(id, new PartitionKey((int)resource.Provider), cancellationToken: ct);
    }

    public async Task<int> GetCountAsync(CloudProvider? provider = null, CancellationToken ct = default)
    {
        var container = await _database.GetResourcesContainerAsync(ct);

        var where = provider.HasValue ? "WHERE c.provider = @provider" : string.Empty;
        var query = new QueryDefinition($"SELECT VALUE COUNT(1) FROM c {where}");

        if (provider.HasValue)
            query = query.WithParameter("@provider", (int)provider.Value);

        var iterator = container.GetItemQueryIterator<int>(query);

        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync(ct);
            return page.FirstOrDefault();
        }

        return 0;
    }

    public async Task<IEnumerable<CloudResource>> GetByResourceGroupAsync(
        string resourceGroup,
        CancellationToken ct = default)
    {
        var container = await _database.GetResourcesContainerAsync(ct);
        var query = new QueryDefinition("SELECT * FROM c WHERE c.resourceGroup = @rg")
            .WithParameter("@rg", resourceGroup);

        return await ReadAllAsync(container, query, ct);
    }

    public async Task<IEnumerable<CloudResource>> GetByTagAsync(
        string key,
        string value,
        CancellationToken ct = default)
    {
        // Tag keys are dynamic, so filtering happens in memory over a bounded result set.
        var container = await _database.GetResourcesContainerAsync(ct);
        var query = new QueryDefinition("SELECT * FROM c OFFSET 0 LIMIT 5000");
        var resources = await ReadAllAsync(container, query, ct);

        return resources.Where(r =>
            r.Tags.TryGetValue(key, out var tag) &&
            string.Equals(tag, value, StringComparison.OrdinalIgnoreCase));
    }

    public async Task<IEnumerable<CloudResource>> GetStaleAsync(TimeSpan olderThan, CancellationToken ct = default)
    {
        var container = await _database.GetResourcesContainerAsync(ct);
        var threshold = DateTime.UtcNow - olderThan;

        var query = new QueryDefinition("SELECT * FROM c WHERE c.lastSyncedAt < @threshold")
            .WithParameter("@threshold", threshold.ToString("o"));

        return await ReadAllAsync(container, query, ct);
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    private static async Task<List<CloudResource>> ReadAllAsync(
        Container container,
        QueryDefinition query,
        CancellationToken ct)
    {
        var results = new List<CloudResource>();
        var iterator = container.GetItemQueryIterator<CloudResource>(query);

        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync(ct);
            results.AddRange(page);
        }

        return results;
    }

    private static QueryDefinition BuildQuery(string sql, IReadOnlyDictionary<string, object> parameters)
    {
        var query = new QueryDefinition(sql);
        foreach (var parameter in parameters)
        {
            query = query.WithParameter(parameter.Key, parameter.Value);
        }
        return query;
    }

    private static (string Where, Dictionary<string, object> Parameters) BuildFilters(
        CloudProvider? provider,
        ResourceType? resourceType,
        string? region,
        string? resourceGroup,
        string? searchTerm)
    {
        var clauses = new List<string>();
        var parameters = new Dictionary<string, object>();

        if (provider.HasValue)
        {
            clauses.Add("c.provider = @provider");
            parameters["@provider"] = (int)provider.Value;
        }

        if (resourceType.HasValue)
        {
            clauses.Add("c.resourceType = @resourceType");
            parameters["@resourceType"] = (int)resourceType.Value;
        }

        if (!string.IsNullOrWhiteSpace(region))
        {
            clauses.Add("c.region = @region");
            parameters["@region"] = region;
        }

        if (!string.IsNullOrWhiteSpace(resourceGroup))
        {
            clauses.Add("c.resourceGroup = @resourceGroup");
            parameters["@resourceGroup"] = resourceGroup;
        }

        if (!string.IsNullOrWhiteSpace(searchTerm))
        {
            clauses.Add("(CONTAINS(LOWER(c.name), @search) OR CONTAINS(LOWER(c.id), @search) " +
                        "OR CONTAINS(LOWER(c.resourceGroup), @search) OR CONTAINS(LOWER(c.region), @search))");
            parameters["@search"] = searchTerm.Trim().ToLowerInvariant();
        }

        var where = clauses.Count == 0 ? string.Empty : "WHERE " + string.Join(" AND ", clauses);
        return (where, parameters);
    }
}
