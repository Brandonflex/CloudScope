using CloudScope.Core.Interfaces;
using CloudScope.Infrastructure.Configuration;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.Mvc;

namespace CloudScope.Api.Controllers;

/// <summary>
/// Deployment/runtime metadata used by the SPA (demo-mode banner, version, counts).
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class MetaController : ControllerBase
{
    private readonly IPlatformStatusService _statusService;
    private readonly IDiscoveryService _discoveryService;
    private readonly ILogger<MetaController> _logger;
    private readonly PlatformOptions _platform;

    public MetaController(
        IPlatformStatusService statusService,
        IDiscoveryService discoveryService,
        IOptions<PlatformOptions> platform,
        ILogger<MetaController> logger)
    {
        _statusService = statusService;
        _discoveryService = discoveryService;
        _logger = logger;
        _platform = platform.Value;
    }

    /// <summary>
    /// Current platform status: demo mode, storage backend, AI mode and inventory counts.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var status = await _statusService.GetStatusAsync(ct);
        return Ok(status);
    }

    /// <summary>
    /// Reload the bundled demo estate (useful for demos and local development).
    /// </summary>
    [HttpPost("demo")]
    public async Task<IActionResult> LoadDemo(CancellationToken ct)
    {
        if (!_platform.SeedDemoData)
            return NotFound();

        var status = await _statusService.GetStatusAsync(ct);
        if (status.ConfiguredProviders.Count > 0)
            return Conflict(new { message = "Demo seeding is unavailable while cloud providers are configured." });

        _logger.LogInformation("Demo estate reload requested via API.");

        var result = await _discoveryService.SeedDemoAsync(ct);
        return Ok(new
        {
            message = "Demo estate loaded",
            result.ResourcesDiscovered,
            result.RelationshipsDiscovered,
            completedAt = result.CompletedAt
        });
    }
}
