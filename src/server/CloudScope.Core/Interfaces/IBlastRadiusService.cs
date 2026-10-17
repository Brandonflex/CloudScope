using CloudScope.Core.Domain.Models;

namespace CloudScope.Core.Interfaces;

/// <summary>
/// Service for blast radius / impact analysis.
/// </summary>
public interface IBlastRadiusService
{
    /// <summary>
    /// Analyze the blast radius of a resource — what would be affected if it fails.
    /// </summary>
    Task<BlastRadiusResult> AnalyzeAsync(string resourceId, int maxDepth = 5, CancellationToken ct = default);
}