using CloudScope.Core.Common;
using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Core.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace CloudScope.Api.Controllers;

/// <summary>
/// API endpoints for cloud resource management and discovery.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class ResourcesController : ControllerBase
{
    private readonly IResourceRepository _resourceRepository;
    private readonly IDiscoveryService _discoveryService;
    private readonly IBlastRadiusService _blastRadiusService;
    private readonly ILogger<ResourcesController> _logger;

    public ResourcesController(
        IResourceRepository resourceRepository,
        IDiscoveryService discoveryService,
        IBlastRadiusService blastRadiusService,
        ILogger<ResourcesController> logger)
    {
        _resourceRepository = resourceRepository;
        _discoveryService = discoveryService;
        _blastRadiusService = blastRadiusService;
        _logger = logger;
    }

    /// <summary>
    /// List all discovered resources with optional filtering and pagination.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<CloudResource>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] CloudProvider? provider = null,
        [FromQuery] ResourceType? resourceType = null,
        [FromQuery] string? region = null,
        [FromQuery] string? resourceGroup = null,
        [FromQuery] string? search = null,
        CancellationToken ct = default)
    {
        var result = await _resourceRepository.GetAllAsync(
            pageNumber, pageSize, provider, resourceType, region, resourceGroup, search, ct);
        return Ok(result);
    }

    /// <summary>
    /// Get a specific resource by ID.
    /// </summary>
    [HttpGet("{id}")]
    [ProducesResponseType(typeof(CloudResource), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(string id, CancellationToken ct)
    {
        var resource = await _resourceRepository.GetByIdAsync(id, ct);
        if (resource is null)
            return NotFound(new { message = $"Resource '{id}' not found" });

        return Ok(resource);
    }

    /// <summary>
    /// Get relationships for a specific resource.
    /// </summary>
    [HttpGet("{id}/relationships")]
    [ProducesResponseType(typeof(IEnumerable<ResourceRelationship>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetRelationships(string id, CancellationToken ct)
    {
        var resource = await _resourceRepository.GetByIdAsync(id, ct);
        if (resource is null)
            return NotFound(new { message = $"Resource '{id}' not found" });

        return Ok(resource.Relationships);
    }

    /// <summary>
    /// Get blast radius analysis for a resource.
    /// </summary>
    [HttpGet("blast-radius/{id}")]
    [ProducesResponseType(typeof(BlastRadiusResult), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetBlastRadius(string id, [FromQuery] int maxDepth = 5, CancellationToken ct = default)
    {
        var result = await _blastRadiusService.AnalyzeAsync(id, maxDepth, ct);
        return Ok(result);
    }

    /// <summary>
    /// Trigger resource discovery across all connected cloud providers.
    /// </summary>
    [HttpPost("discover")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> TriggerDiscovery(CancellationToken ct)
    {
        _logger.LogInformation("Resource discovery triggered via API");

        var result = await _discoveryService.DiscoverAsync(ct);

        return Ok(new
        {
            message = result.DemoMode
                ? "Demo estate loaded (no cloud credentials configured)"
                : "Resource discovery completed",
            demoMode = result.DemoMode,
            resourcesDiscovered = result.ResourcesDiscovered,
            relationshipsDiscovered = result.RelationshipsDiscovered,
            durationSeconds = Math.Round(result.Duration.TotalSeconds, 1),
            providers = result.Providers.Select(p => new
            {
                provider = p.Provider.ToString(),
                configured = p.Configured,
                resources = p.ResourcesDiscovered,
                error = p.Error
            })
        });
    }
}
