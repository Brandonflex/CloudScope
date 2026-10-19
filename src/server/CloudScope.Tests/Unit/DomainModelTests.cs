using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using FluentAssertions;

namespace CloudScope.Tests.Unit;

public class DomainModelTests
{
    [Fact]
    public void CloudResource_DefaultValues_AreCorrect()
    {
        var resource = new CloudResource();

        resource.Id.Should().BeEmpty();
        resource.Provider.Should().Be(CloudProvider.Azure);
        resource.Status.Should().Be(ResourceStatus.Unknown);
        resource.Tags.Should().BeEmpty();
        resource.Properties.Should().BeEmpty();
        resource.Relationships.Should().BeEmpty();
        resource.IsManagedByIaC.Should().BeFalse();
        resource.ComplianceStatus.Should().Be(ComplianceStatus.Unknown);
        resource.EstimatedMonthlyCost.Should().Be(0);
    }

    [Fact]
    public void ComplianceReport_CompliancePercentage_CalculatesCorrectly()
    {
        var report = new ComplianceReport
        {
            CompliantCount = 7,
            NonCompliantCount = 3,
            TotalPolicies = 10
        };

        report.CompliancePercentage.Should().Be(70.0);
    }

    [Fact]
    public void ComplianceReport_ZeroNonCompliant_Returns100Percent()
    {
        var report = new ComplianceReport
        {
            CompliantCount = 10,
            NonCompliantCount = 0,
            TotalPolicies = 10
        };

        report.CompliancePercentage.Should().Be(100.0);
    }

    [Fact]
    public void ComplianceReport_ZeroTotal_ReturnsZeroPercent()
    {
        var report = new ComplianceReport
        {
            CompliantCount = 0,
            NonCompliantCount = 0,
            TotalPolicies = 0
        };

        report.CompliancePercentage.Should().Be(0);
    }

    [Fact]
    public void PagedResult_PaginationCalculatedCorrectly()
    {
        var paged = new PagedResult<CloudResource>
        {
            TotalCount = 95,
            PageNumber = 2,
            PageSize = 20
        };

        paged.TotalPages.Should().Be(5);
        paged.HasPreviousPage.Should().BeTrue();
        paged.HasNextPage.Should().BeTrue();
    }

    [Fact]
    public void PagedResult_FirstPage_HasNoPrevious()
    {
        var paged = new PagedResult<CloudResource>
        {
            TotalCount = 100,
            PageNumber = 1,
            PageSize = 10
        };

        paged.HasPreviousPage.Should().BeFalse();
        paged.HasNextPage.Should().BeTrue();
    }

    [Fact]
    public void PagedResult_LastPage_HasNoNext()
    {
        var paged = new PagedResult<CloudResource>
        {
            TotalCount = 100,
            PageNumber = 10,
            PageSize = 10
        };

        paged.HasPreviousPage.Should().BeTrue();
        paged.HasNextPage.Should().BeFalse();
    }

    [Fact]
    public void Result_Success_CreatesSuccessResult()
    {
        var result = Result.Success();

        result.IsSuccess.Should().BeTrue();
        result.Error.Should().BeNull();
    }

    [Fact]
    public void Result_Failure_CreatesFailureResult()
    {
        var result = Result.Failure("Something went wrong");

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Be("Something went wrong");
    }

    [Fact]
    public void ResultT_Success_CreatesSuccessWithValue()
    {
        var result = Result<int>.Success(42);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().Be(42);
        result.Error.Should().BeNull();
    }

    [Fact]
    public void ResultT_Failure_CreatesFailureWithoutValue()
    {
        var result = Result<string>.Failure("Not found");

        result.IsSuccess.Should().BeFalse();
        result.Value.Should().BeNull();
        result.Error.Should().Be("Not found");
    }

    [Fact]
    public void ResourceRelationship_GeneratesUniqueId()
    {
        var rel1 = new ResourceRelationship
        {
            SourceResourceId = "a",
            TargetResourceId = "b",
            RelationshipType = RelationshipType.DependsOn
        };
        var rel2 = new ResourceRelationship
        {
            SourceResourceId = "a",
            TargetResourceId = "b",
            RelationshipType = RelationshipType.DependsOn
        };

        rel1.Id.Should().NotBe(rel2.Id);
    }
}