using CloudScope.Core.Domain.Models;
using CloudScope.Core.Interfaces;

namespace CloudScope.GraphEngine.Algorithms;

/// <summary>
/// Pure graph algorithms used for infrastructure analysis.
/// </summary>
public static class GraphAlgorithms
{
    /// <summary>
    /// Breadth-First Search to find all nodes reachable from a start node.
    /// </summary>
    public static async Task<List<BlastRadiusNode>> BreadthFirstTraversal(
        IGraphRepository graph,
        string startNodeId,
        int maxDepth,
        CancellationToken ct = default)
    {
        var visited = new HashSet<string>();
        var result = new List<BlastRadiusNode>();
        var queue = new Queue<(string nodeId, int depth)>();

        queue.Enqueue((startNodeId, 0));
        visited.Add(startNodeId);

        while (queue.Count > 0)
        {
            var (currentId, depth) = queue.Dequeue();

            if (depth >= maxDepth) continue;

            var neighbors = await graph.GetNeighborsAsync(currentId, ct: ct);

            foreach (var rel in neighbors)
            {
                var neighborId = rel.SourceResourceId == currentId
                    ? rel.TargetResourceId
                    : rel.SourceResourceId;

                if (visited.Contains(neighborId)) continue;
                visited.Add(neighborId);

                result.Add(new BlastRadiusNode
                {
                    ResourceId = neighborId,
                    RelationshipType = rel.RelationshipType,
                    HopCount = depth + 1
                });

                queue.Enqueue((neighborId, depth + 1));
            }
        }

        return result;
    }

    /// <summary>
    /// Calculate the connectivity score of a node (how central it is in the graph).
    /// Higher score = more connected = higher blast radius risk.
    /// </summary>
    public static double CalculateCentralityScore(int directConnections, int totalTransitive, int totalGraphNodes)
    {
        if (totalGraphNodes <= 1) return 0;
        return (double)(directConnections + totalTransitive) / totalGraphNodes;
    }

    /// <summary>
    /// Detect cycles in the dependency graph starting from a given node.
    /// </summary>
    public static async Task<bool> DetectCycle(
        IGraphRepository graph,
        string startNodeId,
        CancellationToken ct = default)
    {
        var visited = new HashSet<string>();
        var inStack = new HashSet<string>();

        return await HasCycle(graph, startNodeId, visited, inStack, ct);
    }

    private static async Task<bool> HasCycle(
        IGraphRepository graph,
        string nodeId,
        HashSet<string> visited,
        HashSet<string> inStack,
        CancellationToken ct)
    {
        visited.Add(nodeId);
        inStack.Add(nodeId);

        var neighbors = await graph.GetNeighborsAsync(nodeId, ct: ct);

        foreach (var rel in neighbors)
        {
            var neighborId = rel.SourceResourceId == nodeId
                ? rel.TargetResourceId
                : rel.SourceResourceId;

            if (!visited.Contains(neighborId))
            {
                if (await HasCycle(graph, neighborId, visited, inStack, ct))
                    return true;
            }
            else if (inStack.Contains(neighborId))
            {
                return true; // Cycle detected
            }
        }

        inStack.Remove(nodeId);
        return false;
    }
}