using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Core.Interfaces;
using CloudScope.Infrastructure.Helpers;
using CloudScope.Infrastructure.Persistence;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;

namespace CloudScope.Infrastructure.Repositories;

/// <summary>
/// Graph repository backed by Cosmos DB documents. Edges are stored in a dedicated
/// container partitioned by <c>sourceResourceId</c>; traversals load the edge set
/// (bounded) and run in-process so the platform does not require the Gremlin API.
/// </summary>
public class CosmosGraphRepository : IGraphRepository
{
    private const int MaxGraphItems = 5000;

    private readonly CosmosDatabase _database;
    private readonly ILogger<CosmosGraphRepository> _logger;

    public CosmosGraphRepository(CosmosDatabase database, ILogger<CosmosGraphRepository> logger)
    {
        _database = database;
        _logger = logger;
    }

    public async Task UpsertVertexAsync(CloudResource resource, CancellationToken ct = default)
    {
        var container = await _database.GetResourcesContainerAsync(ct);
        await container.UpsertItemAsync(resource, new PartitionKey((int)resource.Provider), cancellationToken: ct);
    }

    public async Task UpsertEdgeAsync(ResourceRelationship relationship, CancellationToken ct = default)
    {
        RelationshipIdentity.EnsureId(relationship);

        var container = await _database.GetEdgesContainerAsync(ct);
        await container.UpsertItemAsync(
            relationship,
            new PartitionKey(relationship.SourceResourceId),
            cancellationToken: ct);
    }

    public async Task<IEnumerable<ResourceRelationship>> GetNeighborsAsync(
        string resourceId,
        RelationshipType? relationshipType = null,
        CancellationToken ct = default)
    {
        var container = await _database.GetEdgesContainerAsync(ct);

        var query = new QueryDefinition(
                "SELECT * FROM c WHERE c.sourceResourceId = @id OR c.targetResourceId = @id")
            .WithParameter("@id", resourceId);

        var edges = await ReadAllAsync<ResourceRelationship>(container, query, ct);

        return relationshipType.HasValue
            ? edges.Where(e => e.RelationshipType == relationshipType.Value)
            : edges;
    }

    public async Task<IEnumerable<BlastRadiusNode>> GetTransitiveDependenciesAsync(
        string resourceId,
        int maxDepth = 5,
        CancellationToken ct = default)
    {
        maxDepth = Math.Clamp(maxDepth, 1, 20);

        var (resources, edges) = await LoadGraphAsync(ct);
        var dependents = edges
            .GroupBy(e => e.TargetResourceId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { resourceId };
        var result = new List<BlastRadiusNode>();
        var queue = new Queue<(string NodeId, int Depth)>();
        queue.Enqueue((resourceId, 0));

        while (queue.Count > 0)
        {
            var (current, depth) = queue.Dequeue();
            if (depth >= maxDepth) continue;
            if (!dependents.TryGetValue(current, out var incoming)) continue;

            foreach (var edge in incoming)
            {
                var dependentId = edge.SourceResourceId;
                if (!visited.Add(dependentId)) continue;

                resources.TryGetValue(dependentId, out var resource);

                result.Add(new BlastRadiusNode
                {
                    ResourceId = dependentId,
                    ResourceName = resource?.Name ?? dependentId,
                    ResourceType = resource?.ResourceType ?? ResourceType.Other,
                    Provider = resource?.Provider ?? CloudProvider.Azure,
                    RelationshipType = edge.RelationshipType,
                    HopCount = depth + 1,
                    ImpactRisk = depth == 0 ? RiskLevel.High : RiskLevel.Medium
                });

                queue.Enqueue((dependentId, depth + 1));
            }
        }

        return result;
    }

    public async Task<GraphData> GetSubgraphAsync(string resourceId, int depth = 2, CancellationToken ct = default)
    {
        depth = Math.Clamp(depth, 1, 5);
        var (resources, edges) = await LoadGraphAsync(ct);

        var nodeIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { resourceId };
        var frontier = new List<string> { resourceId };

        for (var hop = 0; hop < depth; hop++)
        {
            var next = new List<string>();
            foreach (var edge in edges)
            {
                if (!frontier.Any(id => IsIncident(edge, id))) continue;

                if (nodeIds.Add(edge.SourceResourceId)) next.Add(edge.SourceResourceId);
                if (nodeIds.Add(edge.TargetResourceId)) next.Add(edge.TargetResourceId);
            }

            frontier = next;
            if (frontier.Count == 0) break;
        }

        return BuildGraph(resources, edges, nodeIds);
    }

    public async Task<GraphData> GetFullGraphAsync(
        CloudProvider? provider = null,
        ResourceType? resourceType = null,
        string? region = null,
        CancellationToken ct = default)
    {
        var (resources, edges) = await LoadGraphAsync(ct);

        var nodeIds = resources.Values
            .Where(r => !provider.HasValue || r.Provider == provider.Value)
            .Where(r => !resourceType.HasValue || r.ResourceType == resourceType.Value)
            .Where(r => string.IsNullOrWhiteSpace(region) ||
                        string.Equals(r.Region, region, StringComparison.OrdinalIgnoreCase))
            .Select(r => r.Id)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        return BuildGraph(resources, edges, nodeIds);
    }

    public async Task<IEnumerable<ResourceRelationship>> FindPathAsync(
        string sourceId,
        string targetId,
        CancellationToken ct = default)
    {
        if (string.Equals(sourceId, targetId, StringComparison.OrdinalIgnoreCase))
            return Array.Empty<ResourceRelationship>();

        var (_, edges) = await LoadGraphAsync(ct);
        var adjacency = new Dictionary<string, List<(string Neighbour, ResourceRelationship Edge)>>(
            StringComparer.OrdinalIgnoreCase);

        foreach (var edge in edges)
        {
            AddAdjacent(adjacency, edge.SourceResourceId, edge.TargetResourceId, edge);
            AddAdjacent(adjacency, edge.TargetResourceId, edge.SourceResourceId, edge);
        }

        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { sourceId };
        var parents = new Dictionary<string, (string Parent, ResourceRelationship Edge)>(StringComparer.OrdinalIgnoreCase);
        var queue = new Queue<string>();
        queue.Enqueue(sourceId);

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            if (string.Equals(current, targetId, StringComparison.OrdinalIgnoreCase)) break;
            if (!adjacency.TryGetValue(current, out var neighbours)) continue;

            foreach (var (neighbour, edge) in neighbours)
            {
                if (!visited.Add(neighbour)) continue;
                parents[neighbour] = (current, edge);
                queue.Enqueue(neighbour);
            }
        }

        if (!parents.ContainsKey(targetId)) return Array.Empty<ResourceRelationship>();

        var path = new List<ResourceRelationship>();
        var node = targetId;
        while (!string.Equals(node, sourceId, StringComparison.OrdinalIgnoreCase) &&
               parents.TryGetValue(node, out var parent))
        {
            path.Add(parent.Edge);
            node = parent.Parent;
        }

        path.Reverse();
        return path;
    }

    public async Task DeleteVertexAsync(string resourceId, CancellationToken ct = default)
    {
        var resourceContainer = await _database.GetResourcesContainerAsync(ct);
        var edgeContainer = await _database.GetEdgesContainerAsync(ct);
        var edges = (await GetNeighborsAsync(resourceId, ct: ct)).ToList();

        foreach (var edge in edges)
        {
            try
            {
                await edgeContainer.DeleteItemAsync<ResourceRelationship>(
                    edge.Id, new PartitionKey(edge.SourceResourceId), cancellationToken: ct);
            }
            catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                // Already gone.
            }
        }

        var resource = await GetByIdAsync(resourceContainer, resourceId, ct);
        if (resource is not null)
        {
            await resourceContainer.DeleteItemAsync<CloudResource>(
                resourceId, new PartitionKey((int)resource.Provider), cancellationToken: ct);
        }

        _logger.LogDebug("Deleted vertex {ResourceId} and {EdgeCount} edges.", resourceId, edges.Count);
    }

    public async Task<int> GetEdgeCountAsync(CancellationToken ct = default)
    {
        var container = await _database.GetEdgesContainerAsync(ct);
        var iterator = container.GetItemQueryIterator<int>("SELECT VALUE COUNT(1) FROM c");

        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync(ct);
            return page.FirstOrDefault();
        }

        return 0;
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    private async Task<(Dictionary<string, CloudResource> Resources, List<ResourceRelationship> Edges)>
        LoadGraphAsync(CancellationToken ct)
    {
        var resourceContainer = await _database.GetResourcesContainerAsync(ct);
        var edgeContainer = await _database.GetEdgesContainerAsync(ct);

        var resources = await ReadAllAsync<CloudResource>(
            resourceContainer,
            new QueryDefinition($"SELECT * FROM c OFFSET 0 LIMIT {MaxGraphItems}"),
            ct);

        var edges = await ReadAllAsync<ResourceRelationship>(
            edgeContainer,
            new QueryDefinition($"SELECT * FROM c OFFSET 0 LIMIT {MaxGraphItems}"),
            ct);

        return (
            resources.ToDictionary(r => r.Id, StringComparer.OrdinalIgnoreCase),
            edges);
    }

    private static async Task<List<T>> ReadAllAsync<T>(
        Container container,
        QueryDefinition query,
        CancellationToken ct)
    {
        var results = new List<T>();
        var iterator = container.GetItemQueryIterator<T>(query);

        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync(ct);
            results.AddRange(page);
        }

        return results;
    }

    private static async Task<CloudResource?> GetByIdAsync(
        Container container,
        string id,
        CancellationToken ct)
    {
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

    private static void AddAdjacent(
        IDictionary<string, List<(string Neighbour, ResourceRelationship Edge)>> adjacency,
        string from,
        string to,
        ResourceRelationship edge)
    {
        if (!adjacency.TryGetValue(from, out var list))
        {
            list = new List<(string, ResourceRelationship)>();
            adjacency[from] = list;
        }

        list.Add((to, edge));
    }

    private static bool IsIncident(ResourceRelationship edge, string resourceId) =>
        string.Equals(edge.SourceResourceId, resourceId, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(edge.TargetResourceId, resourceId, StringComparison.OrdinalIgnoreCase);

    private static GraphData BuildGraph(
        IReadOnlyDictionary<string, CloudResource> resources,
        IEnumerable<ResourceRelationship> edges,
        HashSet<string> nodeIds)
    {
        var graph = new GraphData();

        foreach (var id in nodeIds)
        {
            if (!resources.TryGetValue(id, out var resource)) continue;

            graph.Nodes.Add(new GraphNode
            {
                Id = resource.Id,
                Label = resource.Name,
                Type = resource.ResourceType.ToString(),
                Provider = resource.Provider,
                Region = resource.Region,
                Status = resource.Status,
                MonthlyCost = resource.EstimatedMonthlyCost,
                Metadata = new Dictionary<string, string>(resource.Tags)
                {
                    ["resourceGroup"] = resource.ResourceGroup
                }
            });
        }

        foreach (var edge in edges)
        {
            if (!nodeIds.Contains(edge.SourceResourceId) || !nodeIds.Contains(edge.TargetResourceId)) continue;

            graph.Edges.Add(new GraphEdge
            {
                Id = edge.Id,
                Source = edge.SourceResourceId,
                Target = edge.TargetResourceId,
                RelationshipType = edge.RelationshipType.ToString(),
                Label = edge.RelationshipType.ToString()
            });
        }

        return graph;
    }
}
