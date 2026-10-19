using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;

namespace CloudScope.Core.Interfaces;

/// <summary>
/// Repository for graph-based resource relationship operations.
/// </summary>
public interface IGraphRepository
{
    /// <summary>
    /// Add or update a resource node in the graph.
    /// </summary>
    Task UpsertVertexAsync(CloudResource resource, CancellationToken ct = default);

    /// <summary>
    /// Add or update a relationship edge in the graph.
    /// </summary>
    Task UpsertEdgeAsync(ResourceRelationship relationship, CancellationToken ct = default);

    /// <summary>
    /// Get all direct neighbors of a resource (1 hop).
    /// </summary>
    Task<IEnumerable<ResourceRelationship>> GetNeighborsAsync(
        string resourceId,
        RelationshipType? relationshipType = null,
        CancellationToken ct = default);

    /// <summary>
    /// Get all transitive dependencies (multi-hop BFS/DFS).
    /// </summary>
    Task<IEnumerable<BlastRadiusNode>> GetTransitiveDependenciesAsync(
        string resourceId,
        int maxDepth = 5,
        CancellationToken ct = default);

    /// <summary>
    /// Get the subgraph around a resource (N hops in all directions).
    /// </summary>
    Task<GraphData> GetSubgraphAsync(
        string resourceId,
        int depth = 2,
        CancellationToken ct = default);

    /// <summary>
    /// Get the full graph (for visualization, with optional filters).
    /// </summary>
    Task<GraphData> GetFullGraphAsync(
        CloudProvider? provider = null,
        ResourceType? resourceType = null,
        string? region = null,
        CancellationToken ct = default);

    /// <summary>
    /// Find shortest path between two resources.
    /// </summary>
    Task<IEnumerable<ResourceRelationship>> FindPathAsync(
        string sourceId,
        string targetId,
        CancellationToken ct = default);

    /// <summary>
    /// Delete a vertex and all its edges.
    /// </summary>
    Task DeleteVertexAsync(string resourceId, CancellationToken ct = default);

    /// <summary>
    /// Total number of relationship edges stored in the graph.
    /// </summary>
    Task<int> GetEdgeCountAsync(CancellationToken ct = default);
}

/// <summary>
/// Graph data structure for visualization.
/// </summary>
public class GraphData
{
    public List<GraphNode> Nodes { get; set; } = new();
    public List<GraphEdge> Edges { get; set; } = new();
}

/// <summary>
/// A node in the visualization graph.
/// </summary>
public class GraphNode
{
    public string Id { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public CloudProvider Provider { get; set; }
    public string Region { get; set; } = string.Empty;
    public ResourceStatus Status { get; set; }
    public decimal MonthlyCost { get; set; }
    public Dictionary<string, string> Metadata { get; set; } = new();
}

/// <summary>
/// An edge in the visualization graph.
/// </summary>
public class GraphEdge
{
    public string Id { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public string Target { get; set; } = string.Empty;
    public string RelationshipType { get; set; } = string.Empty;
    public string? Label { get; set; }
}