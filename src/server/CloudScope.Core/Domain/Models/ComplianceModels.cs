using CloudScope.Core.Domain.Enums;

namespace CloudScope.Core.Domain.Models;

/// <summary>
/// A compliance policy rule to evaluate against resources.
/// </summary>
public class CompliancePolicy
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public ComplianceFramework Framework { get; set; }
    public string Category { get; set; } = string.Empty;
    public string Severity { get; set; } = "Medium"; // Low, Medium, High, Critical
    public ResourceType[] ApplicableResourceTypes { get; set; } = Array.Empty<ResourceType>();
    public string RuleExpression { get; set; } = string.Empty; // JSONPath or custom expression
    public string Remediation { get; set; } = string.Empty;
    public bool Enabled { get; set; } = true;
}

/// <summary>
/// Result of evaluating a compliance policy against a resource.
/// </summary>
public class ComplianceResult
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string PolicyId { get; set; } = string.Empty;
    public string PolicyName { get; set; } = string.Empty;
    public string ResourceId { get; set; } = string.Empty;
    public string ResourceName { get; set; } = string.Empty;
    public ComplianceFramework Framework { get; set; }
    public ComplianceStatus Status { get; set; }
    public string? Details { get; set; }
    public DateTime EvaluatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// A compliance report aggregating results across a framework.
/// </summary>
public class ComplianceReport
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public ComplianceFramework Framework { get; set; }
    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    public int TotalPolicies { get; set; }
    public int CompliantCount { get; set; }
    public int NonCompliantCount { get; set; }
    public int NotApplicableCount { get; set; }
    public double CompliancePercentage => TotalPolicies > 0
        ? Math.Round((double)CompliantCount / (CompliantCount + NonCompliantCount) * 100, 1)
        : 0;
    public List<ComplianceResult> Results { get; set; } = new();
    public List<ComplianceViolation> TopViolations { get; set; } = new();
}

/// <summary>
/// A specific compliance violation with remediation guidance.
/// </summary>
public class ComplianceViolation
{
    public string PolicyName { get; set; } = string.Empty;
    public string ResourceName { get; set; } = string.Empty;
    public string ResourceId { get; set; } = string.Empty;
    public string Severity { get; set; } = string.Empty;
    public string Details { get; set; } = string.Empty;
    public string Remediation { get; set; } = string.Empty;
}

/// <summary>
/// Overall compliance posture across all frameworks.
/// </summary>
public class CompliancePosture
{
    public Dictionary<ComplianceFramework, double> FrameworkScores { get; set; } = new();
    public int TotalViolations { get; set; }
    public int CriticalViolations { get; set; }
    public int HighViolations { get; set; }
    public DateTime LastScanAt { get; set; }
}