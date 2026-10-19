using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Core.Interfaces;
using CloudScope.Infrastructure.Compliance;
using Microsoft.Extensions.Logging;

namespace CloudScope.Infrastructure.Services.Azure;

/// <summary>
/// Evaluates the built-in policy-as-code catalog against the live resource
/// inventory and produces posture scores, reports and remediation guidance.
/// </summary>
public class AzureComplianceService : IComplianceService
{
    private readonly IResourceRepository _resourceRepository;
    private readonly ILogger<AzureComplianceService> _logger;
    private readonly object _scanLock = new();

    private List<ComplianceResult> _lastScan = new();
    private DateTime _lastScanAt = DateTime.MinValue;

    public AzureComplianceService(
        IResourceRepository resourceRepository,
        ILogger<AzureComplianceService> logger)
    {
        _resourceRepository = resourceRepository;
        _logger = logger;
    }

    /// <inheritdoc/>
    public async Task<CompliancePosture> GetPostureAsync(CancellationToken ct = default)
    {
        var resources = await LoadAllResourcesAsync(ct);
        var results = Evaluate(CompliancePolicyCatalog.All, resources);
        var policies = CompliancePolicyCatalog.All.Select(p => p.Policy).ToList();

        var posture = new CompliancePosture
        {
            LastScanAt = DateTime.UtcNow,
            TotalViolations = results.Count(r => r.Status == ComplianceStatus.NonCompliant)
        };

        var violations = BuildViolations(results, policies);
        posture.CriticalViolations = violations.Count(v => v.Severity.Equals("Critical", StringComparison.OrdinalIgnoreCase));
        posture.HighViolations = violations.Count(v => v.Severity.Equals("High", StringComparison.OrdinalIgnoreCase));

        foreach (var framework in Enum.GetValues<ComplianceFramework>())
        {
            var frameworkPolicies = CompliancePolicyCatalog.ForFramework(framework).ToList();
            if (frameworkPolicies.Count == 0) continue;

            var frameworkResults = results
                .Where(r => r.Framework == framework)
                .ToList();

            posture.FrameworkScores[framework] = Score(frameworkPolicies.Select(p => p.Policy.Id).Distinct(), frameworkResults);
        }

        return posture;
    }

    /// <inheritdoc/>
    public async Task<ComplianceReport> GenerateReportAsync(
        ComplianceFramework framework,
        CancellationToken ct = default)
    {
        var resources = await LoadAllResourcesAsync(ct);
        var definitions = CompliancePolicyCatalog.ForFramework(framework).ToList();
        var policies = definitions.Select(d => d.Policy).ToList();
        var results = Evaluate(definitions, resources);

        var report = new ComplianceReport
        {
            Framework = framework,
            GeneratedAt = DateTime.UtcNow,
            TotalPolicies = policies.Count,
            Results = results
        };

        foreach (var policy in policies)
        {
            var policyResults = results.Where(r => r.PolicyId == policy.Id).ToList();

            if (policyResults.Any(r => r.Status == ComplianceStatus.NonCompliant))
                report.NonCompliantCount++;
            else if (policyResults.Any(r => r.Status == ComplianceStatus.Compliant))
                report.CompliantCount++;
            else
                report.NotApplicableCount++;
        }

        report.TopViolations = BuildViolations(results, policies)
            .OrderByDescending(v => SeverityRank(v.Severity))
            .Take(10)
            .ToList();

        _logger.LogInformation(
            "Compliance report for {Framework}: {Compliant}/{Total} policies passing.",
            framework, report.CompliantCount, report.TotalPolicies);

        return report;
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<ComplianceResult>> RunScanAsync(
        ComplianceFramework? framework = null,
        CancellationToken ct = default)
    {
        var resources = await LoadAllResourcesAsync(ct);
        var definitions = framework.HasValue
            ? CompliancePolicyCatalog.ForFramework(framework.Value).ToList()
            : CompliancePolicyCatalog.All.ToList();

        _logger.LogInformation("Running compliance scan for {Count} policies against {Resources} resources.",
            definitions.Count, resources.Count);

        var results = Evaluate(definitions, resources);

        lock (_scanLock)
        {
            _lastScan = results;
            _lastScanAt = DateTime.UtcNow;
        }

        return results;
    }

    /// <inheritdoc/>
    public Task<IEnumerable<CompliancePolicy>> GetPoliciesAsync(
        ComplianceFramework? framework = null,
        CancellationToken ct = default)
    {
        var policies = framework.HasValue
            ? CompliancePolicyCatalog.ForFramework(framework.Value).Select(d => d.Policy)
            : CompliancePolicyCatalog.All.Select(d => d.Policy);

        return Task.FromResult(policies);
    }

    // ── Internals ────────────────────────────────────────────────────────
    private async Task<List<CloudResource>> LoadAllResourcesAsync(CancellationToken ct)
    {
        var all = new List<CloudResource>();
        var page = 1;
        const int pageSize = 500;

        while (true)
        {
            var batch = await _resourceRepository.GetAllAsync(page, pageSize, ct: ct);
            all.AddRange(batch.Items);

            if (batch.Items.Count < pageSize || all.Count >= batch.TotalCount) break;
            page++;
        }

        return all;
    }

    private static List<ComplianceResult> Evaluate(
        IEnumerable<PolicyDefinition> definitions,
        IReadOnlyCollection<CloudResource> resources)
    {
        var results = new List<ComplianceResult>();

        foreach (var definition in definitions)
        {
            var policy = definition.Policy;
            if (!policy.Enabled) continue;

            var applicable = policy.ApplicableResourceTypes.Length == 0
                ? resources
                : resources.Where(r => policy.ApplicableResourceTypes.Contains(r.ResourceType)).ToList();

            var evaluatedAny = false;

            foreach (var resource in applicable)
            {
                PolicyEvaluation evaluation;
                try
                {
                    evaluation = definition.Evaluate(resource);
                }
                catch (Exception)
                {
                    evaluation = PolicyEvaluation.NotApplicable();
                }

                if (evaluation.Status == ComplianceStatus.NotApplicable) continue;

                evaluatedAny = true;
                results.Add(new ComplianceResult
                {
                    PolicyId = policy.Id,
                    PolicyName = policy.Name,
                    ResourceId = resource.Id,
                    ResourceName = resource.Name,
                    Framework = policy.Framework,
                    Status = evaluation.Status,
                    Details = evaluation.Details,
                    EvaluatedAt = DateTime.UtcNow
                });
            }

            if (!evaluatedAny)
            {
                results.Add(new ComplianceResult
                {
                    PolicyId = policy.Id,
                    PolicyName = policy.Name,
                    ResourceId = string.Empty,
                    ResourceName = "(no applicable resources)",
                    Framework = policy.Framework,
                    Status = ComplianceStatus.NotApplicable,
                    Details = "No resources of the applicable types were found.",
                    EvaluatedAt = DateTime.UtcNow
                });
            }
        }

        return results;
    }

    private static double Score(IEnumerable<string> policyIds, IReadOnlyCollection<ComplianceResult> results)
    {
        var compliant = 0;
        var nonCompliant = 0;

        foreach (var policyId in policyIds)
        {
            var policyResults = results.Where(r => r.PolicyId == policyId).ToList();

            if (policyResults.Any(r => r.Status == ComplianceStatus.NonCompliant)) nonCompliant++;
            else if (policyResults.Any(r => r.Status == ComplianceStatus.Compliant)) compliant++;
        }

        var total = compliant + nonCompliant;
        return total == 0 ? 0 : Math.Round((double)compliant / total * 100, 1);
    }

    private static List<ComplianceViolation> BuildViolations(
        IEnumerable<ComplianceResult> results,
        IReadOnlyCollection<CompliancePolicy> policies)
    {
        var byId = policies.ToDictionary(p => p.Id);

        return results
            .Where(r => r.Status == ComplianceStatus.NonCompliant)
            .Select(r =>
            {
                byId.TryGetValue(r.PolicyId, out var policy);
                return new ComplianceViolation
                {
                    PolicyName = r.PolicyName,
                    ResourceName = r.ResourceName,
                    ResourceId = r.ResourceId,
                    Severity = policy?.Severity ?? "Medium",
                    Details = r.Details ?? string.Empty,
                    Remediation = policy?.Remediation ?? string.Empty
                };
            })
            .ToList();
    }

    private static int SeverityRank(string severity) => severity.ToLowerInvariant() switch
    {
        "critical" => 4,
        "high" => 3,
        "medium" => 2,
        _ => 1
    };

    /// <summary>
    /// The results of the most recent scan (used by the SignalR notification loop
    /// and exposed for diagnostics).
    /// </summary>
    public IReadOnlyList<ComplianceResult> LastScan
    {
        get
        {
            lock (_scanLock)
            {
                return _lastScan;
            }
        }
    }

    public DateTime LastScanAt
    {
        get
        {
            lock (_scanLock)
            {
                return _lastScanAt;
            }
        }
    }
}
