using CloudScope.Core.Domain.Enums;

namespace CloudScope.Core.Domain.Models;

/// <summary>
/// Cost information for a specific resource over a time period.
/// </summary>
public class ResourceCost
{
    public string ResourceId { get; set; } = string.Empty;
    public string ResourceName { get; set; } = string.Empty;
    public CloudProvider Provider { get; set; }
    public string ResourceGroup { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "USD";
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
}

/// <summary>
/// Aggregated cost summary across clouds.
/// </summary>
public class CostSummary
{
    public decimal TotalCost { get; set; }
    public decimal AzureCost { get; set; }
    public decimal AwsCost { get; set; }
    public string Currency { get; set; } = "USD";
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public List<CostByCategory> ByResourceType { get; set; } = new();
    public List<CostByCategory> ByRegion { get; set; } = new();
    public List<CostByCategory> ByResourceGroup { get; set; } = new();
    public decimal MonthOverMonthChange { get; set; }
}

/// <summary>
/// Cost broken down by a category (type, region, resource group, etc.).
/// </summary>
public class CostByCategory
{
    public string Category { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public decimal Percentage { get; set; }
}

/// <summary>
/// Cost trend data point for charting.
/// </summary>
public class CostTrend
{
    public DateTime Date { get; set; }
    public decimal AzureCost { get; set; }
    public decimal AwsCost { get; set; }
    public decimal TotalCost { get; set; }
}

/// <summary>
/// Cost forecast prediction.
/// </summary>
public class CostForecast
{
    public DateTime ForecastDate { get; set; }
    public decimal PredictedCost { get; set; }
    public decimal LowerBound { get; set; }
    public decimal UpperBound { get; set; }
    public double ConfidenceLevel { get; set; }
}

/// <summary>
/// A detected cost anomaly.
/// </summary>
public class CostAnomaly
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ResourceId { get; set; } = string.Empty;
    public string ResourceName { get; set; } = string.Empty;
    public decimal ExpectedCost { get; set; }
    public decimal ActualCost { get; set; }
    public decimal DeviationPercentage { get; set; }
    public DateTime DetectedAt { get; set; }
    public string Description { get; set; } = string.Empty;
}