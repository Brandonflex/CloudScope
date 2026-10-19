using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;

namespace CloudScope.Infrastructure.Services.Cost;

/// <summary>
/// Pure, deterministic cost math used by <c>AzureCostService</c>. Everything here
/// works on the discovered inventory so the platform produces useful numbers even
/// before billing exports are connected, and is fully unit-testable.
/// </summary>
public static class CostAnalytics
{
    /// <summary>
    /// Deterministic pseudo-random noise in the range [-5%, +5%] derived from a
    /// stable FNV-1a hash (HashCode is per-process randomised and therefore unusable).
    /// </summary>
    public static double Noise(string key, DateTime date)
    {
        unchecked
        {
            var hash = 2166136261u;
            foreach (var ch in $"{key}|{date:yyyyMMdd}")
            {
                hash ^= ch;
                hash *= 16777619u;
            }

            return (hash % 1000) / 1000.0 * 0.10 - 0.05;
        }
    }

    /// <summary>
    /// Estimated cost of a single resource for a single day.
    /// </summary>
    public static decimal DailyCost(CloudResource resource, DateTime date, DateTime? today = null)
    {
        if (resource.EstimatedMonthlyCost <= 0) return 0m;

        var reference = (today ?? DateTime.UtcNow).Date;
        var daysInMonth = DateTime.DaysInMonth(date.Year, date.Month);
        var baseCost = resource.EstimatedMonthlyCost / daysInMonth;

        // Gentle growth curve across the last 90 days (0.90 → 1.10).
        var daysFromReference = (date.Date - reference.AddDays(-90)).TotalDays;
        var trend = 0.90 + 0.20 * Math.Clamp(daysFromReference / 90.0, 0.0, 1.0);

        var noise = 1.0 + Noise(resource.Id, date);
        var multiplier = trend * noise;

        // Two scripted spikes so anomaly detection has something meaningful to find
        // in the demo estate. They follow "today" so the story stays current.
        if (resource.Name == "cosmos-prod-orders" && date.Date >= reference.AddDays(-2))
        {
            multiplier *= 1.55;
        }
        else if (resource.Name == "s3-prod-backups" && date.Date >= reference.AddDays(-5) && date.Date < reference.AddDays(-2))
        {
            multiplier *= 1.90;
        }

        return Math.Round((decimal)(baseCost * multiplier), 4);
    }

    public static Dictionary<DateTime, (decimal Azure, decimal Aws)> BuildDailySeries(
        IEnumerable<CloudResource> resources,
        DateTime start,
        DateTime end,
        DateTime? today = null)
    {
        var series = new Dictionary<DateTime, (decimal Azure, decimal Aws)>();
        var resourceList = resources.ToList();

        for (var date = start.Date; date <= end.Date; date = date.AddDays(1))
        {
            decimal azure = 0m;
            decimal aws = 0m;

            foreach (var resource in resourceList)
            {
                var cost = DailyCost(resource, date, today);
                if (resource.Provider == CloudProvider.Azure) azure += cost;
                else aws += cost;
            }

            series[date] = (Math.Round(azure, 2), Math.Round(aws, 2));
        }

        return series;
    }

    public static IEnumerable<CostTrend> BuildTrends(
        IEnumerable<CloudResource> resources,
        DateTime start,
        DateTime end,
        DateTime? today = null)
    {
        return BuildDailySeries(resources, start, end, today)
            .Select(kvp => new CostTrend
            {
                Date = kvp.Key,
                AzureCost = kvp.Value.Azure,
                AwsCost = kvp.Value.Aws,
                TotalCost = kvp.Value.Azure + kvp.Value.Aws
            })
            .ToList();
    }

    public static CostSummary BuildSummary(
        IEnumerable<CloudResource> resources,
        DateTime start,
        DateTime end,
        DateTime? today = null)
    {
        var resourceList = resources.ToList();
        var series = BuildDailySeries(resourceList, start, end, today);

        var azure = series.Values.Sum(v => v.Azure);
        var aws = series.Values.Sum(v => v.Aws);
        var total = azure + aws;

        var days = Math.Max(1, (end.Date - start.Date).Days + 1);
        var periodCost = resourceList.ToDictionary(
            r => r.Id,
            r => Enumerable.Range(0, days)
                .Select(offset => DailyCost(r, start.Date.AddDays(offset), today))
                .Sum());

        var summary = new CostSummary
        {
            TotalCost = Math.Round(total, 2),
            AzureCost = Math.Round(azure, 2),
            AwsCost = Math.Round(aws, 2),
            PeriodStart = start.Date,
            PeriodEnd = end.Date,
            ByResourceType = GroupBy(resourceList, periodCost, r => r.ResourceType.ToString(), total),
            ByRegion = GroupBy(resourceList, periodCost, r => r.Region, total),
            ByResourceGroup = GroupBy(resourceList, periodCost, r => r.ResourceGroup, total),
            MonthOverMonthChange = MonthOverMonthChange(resourceList, today)
        };

        return summary;
    }

    /// <summary>
    /// Compares the trailing 30 days with the 30 days before that.
    /// </summary>
    public static decimal MonthOverMonthChange(
        IEnumerable<CloudResource> resources,
        DateTime? today = null)
    {
        var reference = (today ?? DateTime.UtcNow).Date;
        var resourceList = resources.ToList();

        decimal Sum(DateTime from, DateTime to) =>
            resourceList.Sum(r =>
            {
                var total = 0m;
                for (var date = from; date <= to; date = date.AddDays(1))
                {
                    total += DailyCost(r, date, reference);
                }
                return total;
            });

        var current = Sum(reference.AddDays(-29), reference);
        var previous = Sum(reference.AddDays(-59), reference.AddDays(-30));

        if (previous <= 0) return 0m;
        return Math.Round((current - previous) / previous * 100m, 2);
    }

    /// <summary>
    /// Ordinary least squares forecast with 90% prediction bounds.
    /// </summary>
    public static IEnumerable<CostForecast> Forecast(
        IReadOnlyList<decimal> history,
        DateTime lastDate,
        int daysAhead,
        double confidenceLevel = 0.90)
    {
        if (history.Count == 0 || daysAhead <= 0) return Array.Empty<CostForecast>();

        var n = history.Count;
        var sumX = 0.0;
        var sumY = 0.0;
        var sumXy = 0.0;
        var sumXx = 0.0;

        for (var i = 0; i < n; i++)
        {
            var x = i;
            var y = (double)history[i];
            sumX += x;
            sumY += y;
            sumXy += x * y;
            sumXx += x * x;
        }

        var denominator = n * sumXx - sumX * sumX;
        var slope = Math.Abs(denominator) < 1e-9 ? 0 : (n * sumXy - sumX * sumY) / denominator;
        var intercept = (sumY - slope * sumX) / n;

        // Residual standard deviation.
        var residualSum = 0.0;
        for (var i = 0; i < n; i++)
        {
            var predicted = intercept + slope * i;
            var diff = (double)history[i] - predicted;
            residualSum += diff * diff;
        }

        var sigma = n > 2 ? Math.Sqrt(residualSum / (n - 2)) : 0;
        var z = confidenceLevel >= 0.95 ? 1.96 : confidenceLevel >= 0.90 ? 1.645 : 1.28;
        var forecasts = new List<CostForecast>();

        for (var day = 1; day <= daysAhead; day++)
        {
            var predicted = intercept + slope * (n - 1 + day);
            predicted = Math.Max(0, predicted);
            var margin = z * sigma;

            forecasts.Add(new CostForecast
            {
                ForecastDate = lastDate.Date.AddDays(day),
                PredictedCost = Math.Round((decimal)predicted, 2),
                LowerBound = Math.Round((decimal)Math.Max(0, predicted - margin), 2),
                UpperBound = Math.Round((decimal)(predicted + margin), 2),
                ConfidenceLevel = confidenceLevel
            });
        }

        return forecasts;
    }

    /// <summary>
    /// Flags resources whose recent daily cost deviates more than 2.5 standard
    /// deviations from their own 30-day baseline.
    /// </summary>
    public static IEnumerable<CostAnomaly> DetectAnomalies(
        IEnumerable<CloudResource> resources,
        DateTime? today = null)
    {
        var reference = (today ?? DateTime.UtcNow).Date;
        var anomalies = new List<CostAnomaly>();

        foreach (var resource in resources.Where(r => r.EstimatedMonthlyCost > 0))
        {
            var history = Enumerable.Range(0, 30)
                .Select(offset => (Date: reference.AddDays(-29 + offset), Cost: DailyCost(resource, reference.AddDays(-29 + offset), reference)))
                .ToList();

            var mean = (double)history.Average(h => h.Cost);
            if (mean <= 0) continue;

            var variance = history.Average(h => Math.Pow((double)h.Cost - mean, 2));
            var sigma = Math.Sqrt(variance);
            if (sigma <= 0) continue;

            var latest = history.Last();
            var zScore = ((double)latest.Cost - mean) / sigma;

            if (Math.Abs(zScore) < 2.5) continue;
            if (Math.Abs((double)latest.Cost - mean) / mean < 0.15) continue;

            var deviation = (decimal)Math.Round(((double)latest.Cost - mean) / mean * 100, 1);

            anomalies.Add(new CostAnomaly
            {
                ResourceId = resource.Id,
                ResourceName = resource.Name,
                ExpectedCost = Math.Round((decimal)mean, 2),
                ActualCost = Math.Round(latest.Cost, 2),
                DeviationPercentage = deviation,
                DetectedAt = DateTime.UtcNow,
                Description = $"Daily cost is {deviation:+0.0;-0.0}% versus the 30-day average " +
                              $"(${mean:0.00}/day). Likely driver: unexpected usage or a configuration change."
            });
        }

        return anomalies
            .OrderByDescending(a => Math.Abs(a.DeviationPercentage))
            .Take(10)
            .ToList();
    }

    public static IEnumerable<ResourceCost> BuildResourceCosts(
        IEnumerable<CloudResource> resources,
        DateTime start,
        DateTime end,
        DateTime? today = null)
    {
        var days = Math.Max(1, (end.Date - start.Date).Days + 1);

        return resources.Select(r => new ResourceCost
        {
            ResourceId = r.Id,
            ResourceName = r.Name,
            Provider = r.Provider,
            ResourceGroup = r.ResourceGroup,
            PeriodStart = start.Date,
            PeriodEnd = end.Date,
            Amount = Math.Round(Enumerable.Range(0, days)
                .Select(offset => DailyCost(r, start.Date.AddDays(offset), today))
                .Sum(), 2)
        }).ToList();
    }

    private static List<CostByCategory> GroupBy(
        IReadOnlyCollection<CloudResource> resources,
        IReadOnlyDictionary<string, decimal> periodCost,
        Func<CloudResource, string> selector,
        decimal total)
    {
        return resources
            .GroupBy(selector)
            .Select(group => new CostByCategory
            {
                Category = string.IsNullOrWhiteSpace(group.Key) ? "unknown" : group.Key,
                Amount = Math.Round(group.Sum(r => periodCost.TryGetValue(r.Id, out var cost) ? cost : 0m), 2),
                Percentage = total <= 0
                    ? 0
                    : Math.Round((double)group.Sum(r => periodCost.TryGetValue(r.Id, out var cost) ? cost : 0m) / (double)total * 100, 1)
            })
            .OrderByDescending(c => c.Amount)
            .ToList();
    }
}
