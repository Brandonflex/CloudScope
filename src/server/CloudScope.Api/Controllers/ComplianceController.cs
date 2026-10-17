using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace CloudScope.Api.Controllers;

/// <summary>
/// API endpoints for compliance scanning and reporting.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class ComplianceController : ControllerBase
{
    private readonly IComplianceService _complianceService;
    private readonly ILogger<ComplianceController> _logger;

    public ComplianceController(IComplianceService complianceService, ILogger<ComplianceController> logger)
    {
        _complianceService = complianceService;
        _logger = logger;
    }

    /// <summary>
    /// Get overall compliance posture across all frameworks.
    /// </summary>
    [HttpGet("status")]
    public async Task<IActionResult> GetPosture(CancellationToken ct)
    {
        var posture = await _complianceService.GetPostureAsync(ct);
        return Ok(posture);
    }

    /// <summary>
    /// Generate a compliance report for a specific framework.
    /// </summary>
    [HttpGet("reports/{framework}")]
    public async Task<IActionResult> GetReport(ComplianceFramework framework, CancellationToken ct)
    {
        var report = await _complianceService.GenerateReportAsync(framework, ct);
        return Ok(report);
    }

    /// <summary>
    /// Trigger a compliance scan.
    /// </summary>
    [HttpPost("scan")]
    public async Task<IActionResult> RunScan(
        [FromQuery] ComplianceFramework? framework = null,
        CancellationToken ct = default)
    {
        _logger.LogInformation("Compliance scan triggered for {Framework}", framework?.ToString() ?? "ALL");

        var results = await _complianceService.RunScanAsync(framework, ct);
        var resultList = results.ToList();

        return Ok(new
        {
            message = "Compliance scan completed",
            framework = framework?.ToString() ?? "ALL",
            totalEvaluated = resultList.Count,
            compliant = resultList.Count(r => r.Status == ComplianceStatus.Compliant),
            nonCompliant = resultList.Count(r => r.Status == ComplianceStatus.NonCompliant),
            results = resultList
        });
    }

    /// <summary>
    /// Get all compliance policies, optionally filtered by framework.
    /// </summary>
    [HttpGet("policies")]
    public async Task<IActionResult> GetPolicies(
        [FromQuery] ComplianceFramework? framework = null,
        CancellationToken ct = default)
    {
        var policies = await _complianceService.GetPoliciesAsync(framework, ct);
        return Ok(policies);
    }
}