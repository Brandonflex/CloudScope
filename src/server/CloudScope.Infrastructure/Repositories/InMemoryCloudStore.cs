using CloudScope.Core.Common;
using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Core.Interfaces;

namespace CloudScope.Infrastructure.Repositories;

/// <summary>
/// Thread-safe, in-process implementation of both repositories. It powers the
/// zero-configuration demo experience and is also used by the integration tests.
/// </summary>
public sealed class InMemoryCloudStore : IResourceRepository, IGraphRepository
{
    private readonly object _sync = new();
    private readonly Dictionary<string, CloudResource> _resources = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, ResourceRelationship> _edges = new(StringComparer.OrdinalIgnoreCase);

    public DateTime? LastSyncAt { get; private set; }

    // ── Seeding ────────────────────────────────────────────────────────────
    public void Seed(IEnumerable<CloudResource> resources, IEnumerable<ResourceRelationship> relationships)
    {
        lock (_sync)
        {
            _resources.Clear();
            _edges.Clear();

            foreach (var resource in resources)
            {
                _resources[resource.Id] = resource;
            }

            foreach (var relationship in relationships)
            {
                if (string.IsNullOrWhiteSpace(relationship.Id))
                {
                    relationship.Id = Guid.NewGuid().ToString();
                }

                _edges[relationship.Id] = relationship;
            }

            LastSyncAt = DateTime.UtcNow;
        }
    }

    public void Clear()
    {
        lock (_sync)
        {
            _resources.Clear();
            _edges.Clear();
            LastSyncAt = null;
        }
    }

    // ── IResourceRepository ───────────────────────────────────────────────
    public Task<CloudResource?> GetByIdAsync(string id, CancellationToken ct = default)
    {
        lock (_sync)
        {
            _resources.TryGetValue(id, out var resource);
            return Task.FromResult(resource);
        }
    }

    public Task<PagedResult<CloudResource>> GetAllAsync(
        int pageNumber = 1,
        int pageSize = 50,
        CloudProvider? provider = null,
        ResourceType? resourceType = null,
        string? region = null,
        string? resourceGroup = null,
        string? searchTerm = null,
        CancellationToken ct = default)
    {
        lock (_sync)
        {
            IEnumerable<CloudResource> query = _resources.Values;

            if (provider.HasValue)
                query = query.Where(r => r.Provider == provider.Value);

            if (resourceType.HasValue)
                query = query.Where(r => r.ResourceType == resourceType.Value);

            if (!string.IsNullOrWhiteSpace(region))
                query = query.Where(r => string.Equals(r.Region, region, StringComparison.OrdinalIgnoreCase));

            if (!string.IsNullOrWhiteSpace(resourceGroup))
                query = query.Where(r => string.Equals(r.ResourceGroup, resourceGroup, StringComparison.OrdinalIgnoreCase));

            if (!string.IsNullOrWhiteSpace(searchTerm))
            {
                var term = searchTerm.Trim();
                query = query.Where(r => Matches(r, term));
            }

            var ordered = query
                .OrderBy(r => r.Provider)
                .ThenBy(r => r.ResourceType)
                .ThenBy(r => r.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();

            pageNumber = Math.Max(1, pageNumber);
            pageSize = Math.Clamp(pageSize, 1, 500);

            return Task.FromResult(new PagedResult<CloudResource>
            {
                Items = ordered.Skip((pageNumber - 1) * pageSize).Take(pageSize).ToList(),
                TotalCount = ordered.Count,
                PageNumber = pageNumber,
                PageSize = pageSize
            });
        }
    }

    public Task UpsertAsync(CloudResource resource, CancellationToken ct = default)
    {
        lock (_sync)
        {
            if (string.IsNullOrWhiteSpace(resource.Id))
                resource.Id = $"{resource.Provider.ToString().ToLowerInvariant()}:{resource.NativeId}";

            if (_resources.TryGetValue(resource.Id, out var existing))
            {
                resource.DiscoveredAt = existing.DiscoveredAt;
            }

            resource.LastSyncedAt = DateTime.UtcNow;
            _resources[resource.Id] = resource;
            LastSyncAt = DateTime.UtcNow;
        }

        return Task.CompletedTask;
    }

    public async Task UpsertBatchAsync(IEnumerable<CloudResource> resources, CancellationToken ct = default)
    {
        foreach (var resource in resources)
        {
            await UpsertAsync(resource, ct);
        }
    }

    public Task DeleteAsync(string id, CancellationToken ct = default)
    {
        lock (_sync)
        {
            _resources.Remove(id);
        }
        return Task.CompletedTask;
    }

    public Task<int> GetCountAsync(CloudProvider? provider = null, CancellationToken ct = default)
    {
        lock (_sync)
        {
            var count = provider.HasValue
                ? _resources.Values.Count(r => r.Provider == provider.Value)
                : _resources.Count;

            return Task.FromResult(count);
        }
    }

    public Task<IEnumerable<CloudResource>> GetByResourceGroupAsync(string resourceGroup, CancellationToken ct = default)
    {
        lock (_sync)
        {
            var matches = _resources.Values
                .Where(r => string.Equals(r.ResourceGroup, resourceGroup, StringComparison.OrdinalIgnoreCase))
                .ToList();
            return Task.FromResult<IEnumerable<CloudResource>>(matches);
        }
    }

    public Task<IEnumerable<CloudResource>> GetByTagAsync(string key, string value, CancellationToken ct = default)
    {
        lock (_sync)
        {
            var matches = _resources.Values
                .Where(r => r.Tags.TryGetValue(key, out var tag) &&
                            string.Equals(tag, value, StringComparison.OrdinalIgnoreCase))
                .ToList();
            return Task.FromResult<IEnumerable<CloudResource>>(matches);
        }
    }

    public Task<IEnumerable<CloudResource>> GetStaleAsync(TimeSpan olderThan, CancellationToken ct = default)
    {
        var threshold = DateTime.UtcNow - olderThan;
        lock (_sync)
        {
            var matches = _resources.Values.Where(r => r.LastSyncedAt < threshold).ToList();
            return Task.FromResult<IEnumerable<CloudResource>>(matches);
        }
    }

    // ── IGraphRepository ─────────────────────────────────────────────────
    public Task UpsertVertexAsync(CloudResource resource, CancellationToken ct = default) =>
        UpsertAsync(resource, ct);

    public Task UpsertEdgeAsync(ResourceRelationship relationship, CancellationToken ct = default)
    {
        lock (_sync)
        {
            if (string.IsNullOrWhiteSpace(relationship.Id))
                relationship.Id = Guid.NewGuid().ToString();

            _edges[relationship.Id] = relationship;
            LastSyncAt = DateTime.UtcNow;
        }

        return Task.CompletedTask;
    }

    public Task<IEnumerable<ResourceRelationship>> GetNeighborsAsync(
        string resourceId,
        RelationshipType? relationshipType = null,
        CancellationToken ct = default)
    {
        lock (_sync)
        {
            var matches = _edges.Values
                .Where(e => IsIncident(e, resourceId))
                .Where(e => !relationshipType.HasValue || e.RelationshipType == relationshipType.Value)
                .ToList();
            return Task.FromResult<IEnumerable<ResourceRelationship>>(matches);
        }
    }

    /// <summary>
    /// Impact analysis walks edges "upstream": if A depends on B (A -> B), then a
    /// failure of B affects A. So from B we traverse edges whose target is B.
    /// </summary>
    public Task<IEnumerable<BlastRadiusNode>> GetTransitiveDependenciesAsync(
        string resourceId,
        int maxDepth = 5,
        CancellationToken ct = default)
    {
        maxDepth = Math.Clamp(maxDepth, 1, 20);

        lock (_sync)
        {
            var dependents = BuildDependentsMap();
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

                    result.Add(new BlastRadiusNode
                    {
                        ResourceId = dependentId,
                        ResourceName = _resources.TryGetValue(dependentId, out var res) ? res.Name : dependentId,
                        ResourceType = res?.ResourceType ?? ResourceType.Other,
                        Provider = res?.Provider ?? CloudProvider.Azure,
                        RelationshipType = edge.RelationshipType,
                        HopCount = depth + 1,
                        ImpactRisk = depth == 0 ? RiskLevel.High : RiskLevel.Medium
                    });

                    queue.Enqueue((dependentId, depth + 1));
                }
            }

            return Task.FromResult<IEnumerable<BlastRadiusNode>>(result);
        }
    }

    public Task<GraphData> GetSubgraphAsync(string resourceId, int depth = 2, CancellationToken ct = default)
    {
        depth = Math.Clamp(depth, 1, 5);

        lock (_sync)
        {
            var nodeIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { resourceId };
            var frontier = new List<string> { resourceId };

            for (var hop = 0; hop < depth; hop++)
            {
                var next = new List<string>();
                foreach (var edge in _edges.Values)
                {
                    if (frontier.Any(id => IsIncident(edge, id)))
                    {
                        if (nodeIds.Add(edge.SourceResourceId)) next.Add(edge.SourceResourceId);
                        if (nodeIds.Add(edge.TargetResourceId)) next.Add(edge.TargetResourceId);
                    }
                }

                frontier = next;
                if (frontier.Count == 0) break;
            }

            return Task.FromResult(BuildGraph(nodeIds));
        }
    }

    public Task<GraphData> GetFullGraphAsync(
        CloudProvider? provider = null,
        ResourceType? resourceType = null,
        string? region = null,
        CancellationToken ct = default)
    {
        lock (_sync)
        {
            var nodeIds = _resources.Values
                .Where(r => !provider.HasValue || r.Provider == provider.Value)
                .Where(r => !resourceType.HasValue || r.ResourceType == resourceType.Value)
                .Where(r => string.IsNullOrWhiteSpace(region) ||
                            string.Equals(r.Region, region, StringComparison.OrdinalIgnoreCase))
                .Select(r => r.Id)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            return Task.FromResult(BuildGraph(nodeIds));
        }
    }

    public Task<IEnumerable<ResourceRelationship>> FindPathAsync(
        string sourceId,
        string targetId,
        CancellationToken ct = default)
    {
        lock (_sync)
        {
            if (string.Equals(sourceId, targetId, StringComparison.OrdinalIgnoreCase))
                return Task.FromResult(Enumerable.Empty<ResourceRelationship>());

            var adjacency = new Dictionary<string, List<(string Neighbour, ResourceRelationship Edge)>>(StringComparer.OrdinalIgnoreCase);

            foreach (var edge in _edges.Values)
            {
                if (!adjacency.TryGetValue(edge.SourceResourceId, out var fromList))
                {
                    fromList = new List<(string, ResourceRelationship)>();
                    adjacency[edge.SourceResourceId] = fromList;
                }
                fromList.Add((edge.TargetResourceId, edge));

                if (!adjacency.TryGetValue(edge.TargetResourceId, out var toList))
                {
                    toList = new List<(string, ResourceRelationship)>();
                    adjacency[edge.TargetResourceId] = toList;
                }
                toList.Add((edge.SourceResourceId, edge));
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

            if (!parents.ContainsKey(targetId))
                return Task.FromResult(Enumerable.Empty<ResourceRelationship>());

            var path = new List<ResourceRelationship>();
            var node = targetId;
            while (!string.Equals(node, sourceId, StringComparison.OrdinalIgnoreCase) &&
                   parents.TryGetValue(node, out var parent))
            {
                path.Add(parent.Edge);
                node = parent.Parent;
            }

            path.Reverse();
            return Task.FromResult<IEnumerable<ResourceRelationship>>(path);
        }
    }

    public Task DeleteVertexAsync(string resourceId, CancellationToken ct = default)
    {
        lock (_sync)
        {
            _resources.Remove(resourceId);

            var toRemove = _edges.Values.Where(e => IsIncident(e, resourceId)).Select(e => e.Id).ToList();
            foreach (var id in toRemove)
            {
                _edges.Remove(id);
            }
        }

        return Task.CompletedTask;
    }

    public Task<int> GetEdgeCountAsync(CancellationToken ct = default)
    {
        lock (_sync)
        {
            return Task.FromResult(_edges.Count);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    private static bool IsIncident(ResourceRelationship edge, string resourceId) =>
        string.Equals(edge.SourceResourceId, resourceId, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(edge.TargetResourceId, resourceId, StringComparison.OrdinalIgnoreCase);

    private static bool Matches(CloudResource resource, string term) =>
        resource.Name.Contains(term, StringComparison.OrdinalIgnoreCase) ||
        resource.Id.Contains(term, StringComparison.OrdinalIgnoreCase) ||
        resource.NativeId.Contains(term, StringComparison.OrdinalIgnoreCase) ||
        resource.ResourceType.ToString().Contains(term, StringComparison.OrdinalIgnoreCase) ||
        resource.NativeResourceType.Contains(term, StringComparison.OrdinalIgnoreCase) ||
        resource.ResourceGroup.Contains(term, StringComparison.OrdinalIgnoreCase) ||
        resource.Region.Contains(term, StringComparison.OrdinalIgnoreCase) ||
        resource.Tags.Any(t =>
            t.Key.Contains(term, StringComparison.OrdinalIgnoreCase) ||
            t.Value.Contains(term, StringComparison.OrdinalIgnoreCase));

    private Dictionary<string, List<ResourceRelationship>> BuildDependentsMap()
    {
        var map = new Dictionary<string, List<ResourceRelationship>>(StringComparer.OrdinalIgnoreCase);

        foreach (var edge in _edges.Values)
        {
            if (!map.TryGetValue(edge.TargetResourceId, out var list))
            {
                list = new List<ResourceRelationship>();
                map[edge.TargetResourceId] = list;
            }

            list.Add(edge);
        }

        return map;
    }

    private GraphData BuildGraph(HashSet<string> nodeIds)
    {
        var graph = new GraphData();

        foreach (var id in nodeIds)
        {
            if (_resources.TryGetValue(id, out var resource))
            {
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
        }

        foreach (var edge in _edges.Values)
        {
            if (nodeIds.Contains(edge.SourceResourceId) && nodeIds.Contains(edge.TargetResourceId))
            {
                graph.Edges.Add(new GraphEdge
                {
                    Id = edge.Id,
                    Source = edge.SourceResourceId,
                    Target = edge.TargetResourceId,
                    RelationshipType = edge.RelationshipType.ToString(),
                    Label = edge.RelationshipType.ToString()
                });
            }
        }

        return graph;
    }
}
