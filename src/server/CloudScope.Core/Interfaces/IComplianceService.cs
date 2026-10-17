using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;

namespace CloudScope.Core.Interfaces;

/// <summary>
/// Abstraction for compliance scanning and reporting.
/// </summary>
public interface IComplianceService
{
    /// <summary>
    /// Get overall compliance posture across all frameworks.
    /// </summary>
    Task<CompliancePosture> GetPostureAsync(CancellationToken ct = default);

    /// <summary>
    /// Generate a compliance report for a specific framework.
    /// </summary>
    Task<ComplianceReport> GenerateReportAsync(
        ComplianceFramework framework,
        CancellationToken ct = default);

    /// <summary>
    /// Run a compliance scan for all enabled policies.
    /// </summary>
    Task<IEnumerable<ComplianceResult>> RunScanAsync(
        ComplianceFramework? framework = null,
        CancellationToken ct = default);

    /// <summary>
    /// Get all compliance policies (optionally filtered by framework).
    /// </summary>
    Task<IEnumerable<CompliancePolicy>> GetPoliciesAsync(
        ComplianceFramework? framework = null,
        CancellationToken ct = default);
}