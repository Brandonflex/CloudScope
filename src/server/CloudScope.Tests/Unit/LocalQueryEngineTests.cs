using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Core.Interfaces;
using CloudScope.Infrastructure.Demo;
using CloudScope.Infrastructure.Services.Ai;
using FluentAssertions;
using Moq;

namespace CloudScope.Tests.Unit;

public class LocalQueryEngineTests
{
    private static readonly List<CloudResource> Resources = DemoInventoryLoader.Load().Resources;

    private static (Mock<IBlastRadiusService> Blast, Mock<IComplianceService> Compliance, Mock<ICostService> Cost) Mocks()
    {
        var blast = new Mock<IBlastRadiusService>();
        var compliance = new Mock<IComplianceService>();
        var cost = new Mock<ICostService>();

        blast.Setup(b => b.AnalyzeAsync(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BlastRadiusResult
            {
                ResourceId = "az:snet",
                ResourceName = "snet-app",
                RiskLevel = RiskLevel.High,
                AffectedResourceCount = 7,
                AffectedMonthlyCost = 1200m,
                Summary = "snet-app has 7 dependent resources."
            });

        compliance.Setup(c => c.RunScanAsync(It.IsAny<ComplianceFramework?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[]
            {
                new ComplianceResult
                {
                    PolicyId = "CIS-AZ-2.1",
                    PolicyName = "Storage must not be public",
                    ResourceName = "stgprodapp",
                    Framework = ComplianceFramework.CIS,
                    Status = ComplianceStatus.NonCompliant,
                    Details = "Anonymous blob access is enabled."
                }
            });

        cost.Setup(c => c.DetectAnomaliesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<CostAnomaly>());
        cost.Setup(c => c.GetForecastAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<CostForecast>());
        cost.Setup(c => c.GetRecommendationsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<CostRecommendation>());
        cost.Setup(c => c.GetCostSummaryAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CostSummary { TotalCost = 1000m, ByResourceGroup = new List<CostByCategory>() });

        return (blast, compliance, cost);
    }

    private static async Task<AIQueryResult> Ask(string question)
    {
        var (blast, compliance, cost) = Mocks();
        return await LocalQueryEngine.AnswerAsync(
            question, Resources, blast.Object, compliance.Object, cost.Object);
    }

    [Fact]
    public async Task AnswersCpuUtilisationQuestions()
    {
        var result = await Ask("Which VMs are running under 10% CPU?");

        result.Success.Should().BeTrue();
        result.Answer.Should().Contain("below 10%");
        result.Answer.Should().Contain("vm-app-02");
        result.Data.Should().NotBeNull();
        result.GeneratedQuery.Should().Contain("cpuUtilization");
    }

    [Fact]
    public async Task AnswersCostThresholdQuestions()
    {
        var result = await Ask("Show me all resources costing more than $400/month");

        result.Success.Should().BeTrue();
        result.Answer.Should().Contain("$400");
        result.GeneratedQuery.Should().Contain("estimatedMonthlyCost");
    }

    [Fact]
    public async Task AnswersUnattachedPublicIpQuestions()
    {
        var result = await Ask("List all public IP addresses that are not attached");

        result.Success.Should().BeTrue();
        result.Answer.Should().Contain("pip-orphan-01");
    }

    [Fact]
    public async Task AnswersIaCDriftQuestions()
    {
        var result = await Ask("Which resources are not managed by Infrastructure as Code?");

        result.Success.Should().BeTrue();
        result.Answer.Should().Contain("not managed by IaC");
        result.Data.Should().NotBeNull();
    }

    [Fact]
    public async Task AnswersBlastRadiusQuestionsUsingTheGraph()
    {
        var result = await Ask("What breaks if snet-app goes down?");

        result.Success.Should().BeTrue();
        result.Answer.Should().Contain("snet-app");
        result.Answer.Should().Contain("7 downstream");
        result.GeneratedQuery.Should().Contain("blast-radius");
    }

    [Fact]
    public async Task AnswersComplianceQuestions()
    {
        var result = await Ask("Show me all CIS compliance violations");

        result.Success.Should().BeTrue();
        result.Answer.Should().Contain("1 compliance violation");
        result.Answer.Should().Contain("Storage");
    }

    [Fact]
    public async Task AnswersInventoryOverviewQuestions()
    {
        var result = await Ask("Give me an overview of my cloud inventory");

        result.Success.Should().BeTrue();
        result.Answer.Should().Contain(Resources.Count.ToString());
        result.Answer.Should().Contain("Azure");
    }

    [Fact]
    public async Task AnswersTypeQuestions()
    {
        var result = await Ask("Show me all kubernetes clusters");

        result.Success.Should().BeTrue();
        result.Answer.Should().ContainEquivalentOf("kubernetes");
        result.Answer.Should().Contain("2");
    }

    [Fact]
    public void Suggestions_AreContextAware()
    {
        var suggestions = LocalQueryEngine.Suggestions(Resources).ToList();

        suggestions.Should().NotBeEmpty();
        suggestions.Should().Contain(s => s.Contains("CPU"));
        suggestions.Should().Contain(s => s.Contains("blast") || s.Contains("breaks"));
    }
}
