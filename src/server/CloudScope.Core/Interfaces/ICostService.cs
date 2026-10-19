using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;

namespace CloudScope.Core.Interfaces;

/// <summary>
/// Abstraction for cost data retrieval across cloud providers.
/// </summary>
public interface ICostService
{
    /// <summary>
    /// Get aggregated cost summary across both clouds.
    /// </summary>
    Task<CostSummary> GetCostSummaryAsync(
        DateTime startDate,
        DateTime endDate,
        CancellationToken ct = default);

    /// <summary>
    /// Get cost trend data for charting.
    /// </summary>
    Task<IEnumerable<CostTrend>> GetCostTrendsAsync(
        DateTime startDate,
        DateTime endDate,
        CancellationToken ct = default);

    /// <summary>
    /// Get cost breakdown for a specific resource.
    /// </summary>
    Task<ResourceCost?> GetResourceCostAsync(
        string resourceId,
        DateTime startDate,
        DateTime endDate,
        CancellationToken ct = default);

    /// <summary>
    /// Get cost forecast predictions.
    /// </summary>
    Task<IEnumerable<CostForecast>> GetForecastAsync(
        int daysAhead = 30,
        CancellationToken ct = default);

    /// <summary>
    /// Detect cost anomalies.
    /// </summary>
    Task<IEnumerable<CostAnomaly>> DetectAnomaliesAsync(
        CancellationToken ct = default);

    /// <summary>
    /// Get top N most expensive resources.
    /// </summary>
    Task<IEnumerable<ResourceCost>> GetTopResourcesAsync(
        int count = 10,
        CancellationToken ct = default);

    /// <summary>
    /// Generate right-sizing and waste-elimination recommendations.
    /// </summary>
    Task<IEnumerable<CostRecommendation>> GetRecommendationsAsync(
        CancellationToken ct = default);
}