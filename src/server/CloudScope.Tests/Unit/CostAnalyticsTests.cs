using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Infrastructure.Demo;
using CloudScope.Infrastructure.Services.Cost;
using FluentAssertions;

namespace CloudScope.Tests.Unit;

public class CostAnalyticsTests
{
    private static readonly DateTime Today = new(2026, 10, 19, 0, 0, 0, DateTimeKind.Utc);

    private static List<CloudResource> DemoResources() => DemoInventoryLoader.Load().Resources;

    [Fact]
    public void DailyCost_IsDeterministicAndProportionalToMonthlyCost()
    {
        var resource = new CloudResource
        {
            Id = "az:vm",
            Name = "vm",
            EstimatedMonthlyCost = 300m,
            Region = "eastus"
        };

        var first = CostAnalytics.DailyCost(resource, Today, Today);
        var second = CostAnalytics.DailyCost(resource, Today, Today);

        first.Should().Be(second);
        first.Should().BeGreaterThan(0);
        first.Should().BeLessThan(20); // 300 / 31 with trend + noise stays well under 20
    }

    [Fact]
    public void BuildSummary_ComponentsAddUpAndCategoriesArePercentages()
    {
        var summary = CostAnalytics.BuildSummary(DemoResources(), Today.AddDays(-29), Today, Today);

        summary.TotalCost.Should().BeApproximately(summary.AzureCost + summary.AwsCost, 0.05m);
        summary.AzureCost.Should().BeGreaterThan(0);
        summary.AwsCost.Should().BeGreaterThan(0);
        summary.ByResourceType.Should().NotBeEmpty();
        summary.ByResourceType.Sum(c => c.Amount).Should().BeApproximately(summary.TotalCost, 1m);
        summary.ByResourceType.Sum(c => c.Percentage).Should().BeApproximately(100, 1);
        summary.ByRegion.Should().NotBeEmpty();
        summary.ByResourceGroup.Should().NotBeEmpty();
    }

    [Fact]
    public void BuildTrends_ReturnsOnePointPerDay()
    {
        var trends = CostAnalytics.BuildTrends(DemoResources(), Today.AddDays(-29), Today, Today).ToList();

        trends.Should().HaveCount(30);
        trends.Should().OnlyContain(t => t.TotalCost == t.AzureCost + t.AwsCost);
        trends.Select(t => t.Date).Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public void Forecast_ProjectsTheLinearTrend()
    {
        var history = Enumerable.Range(0, 30).Select(i => 100m + i).ToList();

        var forecast = CostAnalytics.Forecast(history, Today, 7).ToList();

        forecast.Should().HaveCount(7);
        forecast[0].PredictedCost.Should().BeGreaterThan(history.Last());
        forecast[0].ForecastDate.Should().Be(Today.AddDays(1));
        forecast.Should().OnlyContain(f => f.LowerBound <= f.PredictedCost && f.PredictedCost <= f.UpperBound);
        forecast.Should().OnlyContain(f => f.ConfidenceLevel == 0.9);
    }

    [Fact]
    public void DetectAnomalies_FindsTheScriptedSpike()
    {
        var anomalies = CostAnalytics.DetectAnomalies(DemoResources(), Today).ToList();

        anomalies.Should().NotBeEmpty();
        anomalies.Should().Contain(a => a.ResourceName == "cosmos-prod-orders");
        anomalies.Should().OnlyContain(a => a.ActualCost > a.ExpectedCost);
    }

    [Fact]
    public void MonthOverMonthChange_IsFiniteAndReasonable()
    {
        var change = CostAnalytics.MonthOverMonthChange(DemoResources(), Today);

        change.Should().BeGreaterThan(-100);
        change.Should().BeLessThan(100);
    }

    [Fact]
    public void BuildResourceCosts_CoversPeriod()
    {
        var resources = DemoResources().Where(r => r.EstimatedMonthlyCost > 0).Take(3).ToList();

        var costs = CostAnalytics.BuildResourceCosts(resources, Today.AddDays(-29), Today, Today).ToList();

        costs.Should().HaveCount(3);
        costs.Should().OnlyContain(c => c.Amount > 0);
        costs.Should().OnlyContain(c => c.PeriodEnd == Today);
    }
}
