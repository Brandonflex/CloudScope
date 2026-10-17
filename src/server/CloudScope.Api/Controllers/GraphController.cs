using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace CloudScope.Api.Controllers;

/// <summary>
/// API endpoints for resource graph visualization.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class GraphController : ControllerBase
{
    private readonly IGraphRepository _graphRepository;
    private readonly ILogger<GraphController> _logger;

    public GraphController(IGraphRepository graphRepository, ILogger<GraphController> logger)
    {
        _graphRepository = graphRepository;
        _logger = logger;
    }

    /// <summary>
    /// Get the full dependency graph with optional filters.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetFullGraph(
        [FromQuery] CloudProvider? provider = null,
        [FromQuery] ResourceType? resourceType = null,
        [FromQuery] string? region = null,
        CancellationToken ct = default)
    {
        var graph = await _graphRepository.GetFullGraphAsync(provider, resourceType, region, ct);
        return Ok(graph);
    }

    /// <summary>
    /// Get the subgraph around a specific resource.
    /// </summary>
    [HttpGet("subgraph/{resourceId}")]
    public async Task<IActionResult> GetSubgraph(
        string resourceId,
        [FromQuery] int depth = 2,
        CancellationToken ct = default)
    {
        var subgraph = await _graphRepository.GetSubgraphAsync(resourceId, depth, ct);
        return Ok(subgraph);
    }

    /// <summary>
    /// Find the shortest path between two resources.
    /// </summary>
    [HttpGet("paths")]
    public async Task<IActionResult> FindPath(
        [FromQuery] string sourceId,
        [FromQuery] string targetId,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(sourceId) || string.IsNullOrWhiteSpace(targetId))
            return BadRequest(new { message = "Both sourceId and targetId are required" });

        var path = await _graphRepository.FindPathAsync(sourceId, targetId, ct);
        return Ok(path);
    }
}