using CloudScope.Core.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace CloudScope.Api.Controllers;

/// <summary>
/// API endpoints for multi-cloud cost intelligence.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class CostsController : ControllerBase
{
    private readonly ICostService _costService;
    private readonly ILogger<CostsController> _logger;

    public CostsController(ICostService costService, ILogger<CostsController> logger)
    {
        _costService = costService;
        _logger = logger;
    }

    /// <summary>
    /// Get aggregated cost summary across Azure and AWS.
    /// </summary>
    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary(
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        CancellationToken ct = default)
    {
        var start = startDate ?? DateTime.UtcNow.AddDays(-30);
        var end = endDate ?? DateTime.UtcNow;

        var summary = await _costService.GetCostSummaryAsync(start, end, ct);
        return Ok(summary);
    }

    /// <summary>
    /// Get cost trends over time.
    /// </summary>
    [HttpGet("trends")]
    public async Task<IActionResult> GetTrends(
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        CancellationToken ct = default)
    {
        var start = startDate ?? DateTime.UtcNow.AddDays(-90);
        var end = endDate ?? DateTime.UtcNow;

        var trends = await _costService.GetCostTrendsAsync(start, end, ct);
        return Ok(trends);
    }

    /// <summary>
    /// Get cost forecast predictions.
    /// </summary>
    [HttpGet("forecast")]
    public async Task<IActionResult> GetForecast(
        [FromQuery] int daysAhead = 30,
        CancellationToken ct = default)
    {
        var forecast = await _costService.GetForecastAsync(daysAhead, ct);
        return Ok(forecast);
    }

    /// <summary>
    /// Get detected cost anomalies.
    /// </summary>
    [HttpGet("anomalies")]
    public async Task<IActionResult> GetAnomalies(CancellationToken ct)
    {
        var anomalies = await _costService.DetectAnomaliesAsync(ct);
        return Ok(anomalies);
    }

    /// <summary>
    /// Get right-sizing and waste-elimination recommendations.
    /// </summary>
    [HttpGet("recommendations")]
    public async Task<IActionResult> GetRecommendations(CancellationToken ct)
    {
        var recommendations = await _costService.GetRecommendationsAsync(ct);
        return Ok(recommendations);
    }

    /// <summary>
    /// Get top N most expensive resources.
    /// </summary>
    [HttpGet("top-resources")]
    public async Task<IActionResult> GetTopResources(
        [FromQuery] int count = 10,
        CancellationToken ct = default)
    {
        var resources = await _costService.GetTopResourcesAsync(count, ct);
        return Ok(resources);
    }
}