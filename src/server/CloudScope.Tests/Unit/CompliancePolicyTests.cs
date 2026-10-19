using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Infrastructure.Compliance;
using CloudScope.Infrastructure.Demo;
using CloudScope.Infrastructure.Repositories;
using CloudScope.Infrastructure.Services.Azure;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;

namespace CloudScope.Tests.Unit;

public class CompliancePolicyTests
{
    private static PolicyDefinition Policy(string id) =>
        CompliancePolicyCatalog.All.Single(p => p.Policy.Id == id);

    private static CloudResource StorageAccount(bool publicAccess) => new()
    {
        Id = "az:storage",
        Name = "stgtest",
        Provider = CloudProvider.Azure,
        ResourceType = ResourceType.StorageAccount,
        Region = "eastus",
        Tags = new Dictionary<string, string> { ["owner"] = "platform", ["environment"] = "prod" },
        Properties = new Dictionary<string, object>
        {
            ["allowBlobPublicAccess"] = publicAccess,
            ["minTlsVersion"] = "TLS1_2"
        }
    };

    [Fact]
    public void StoragePublicAccess_FlagsEnabledAnonymousAccess()
    {
        var policy = Policy("CIS-AZ-2.1");

        policy.Evaluate(StorageAccount(true)).Status.Should().Be(ComplianceStatus.NonCompliant);
        policy.Evaluate(StorageAccount(false)).Status.Should().Be(ComplianceStatus.Compliant);
    }

    [Fact]
    public void StorageTls_FlagsLegacyVersions()
    {
        var policy = Policy("CIS-AZ-2.2");
        var resource = StorageAccount(false);
        resource.Properties["minTlsVersion"] = "TLS1_0";

        policy.Evaluate(resource).Status.Should().Be(ComplianceStatus.NonCompliant);
        policy.Evaluate(StorageAccount(false)).Status.Should().Be(ComplianceStatus.Compliant);
    }

    [Fact]
    public void NetworkSecurityGroup_FlagsInternetFacingAdminPorts()
    {
        var policy = Policy("CIS-AWS-5.2");

        var exposed = new CloudResource
        {
            Id = "az:nsg",
            ResourceType = ResourceType.NetworkSecurityGroup,
            NativeResourceType = "Microsoft.Network/networkSecurityGroups",
            Properties = new Dictionary<string, object>
            {
                ["source"] = "Internet",
                ["openPorts"] = "22,3389"
            }
        };

        var restricted = new CloudResource
        {
            Id = "az:nsg2",
            ResourceType = ResourceType.NetworkSecurityGroup,
            Properties = new Dictionary<string, object>
            {
                ["source"] = "VirtualNetwork",
                ["openPorts"] = "22,3389"
            }
        };

        policy.Evaluate(exposed).Status.Should().Be(ComplianceStatus.NonCompliant);
        policy.Evaluate(restricted).Status.Should().Be(ComplianceStatus.Compliant);
    }

    [Fact]
    public void TaggingPolicy_FlagsResourcesWithoutOwnerAndEnvironment()
    {
        var policy = Policy("GDPR-5.1");

        var untagged = new CloudResource { Id = "az:untagged", Tags = new Dictionary<string, string>() };
        var tagged = new CloudResource
        {
            Id = "az:tagged",
            Tags = new Dictionary<string, string> { ["owner"] = "app-team", ["environment"] = "prod" }
        };

        policy.Evaluate(untagged).Status.Should().Be(ComplianceStatus.NonCompliant);
        policy.Evaluate(tagged).Status.Should().Be(ComplianceStatus.Compliant);
    }

    [Fact]
    public void EncryptionPolicy_FlagsUnencryptedDatabases()
    {
        var policy = Policy("HIPAA-164.312(a)(2)(iv)");

        var unencrypted = new CloudResource
        {
            Id = "aws:db",
            ResourceType = ResourceType.SqlDatabase,
            Properties = new Dictionary<string, object> { ["storageEncrypted"] = "false" }
        };

        var encrypted = new CloudResource
        {
            Id = "aws:db2",
            ResourceType = ResourceType.SqlDatabase,
            Properties = new Dictionary<string, object> { ["storageEncrypted"] = "true" }
        };

        policy.Evaluate(unencrypted).Status.Should().Be(ComplianceStatus.NonCompliant);
        policy.Evaluate(encrypted).Status.Should().Be(ComplianceStatus.Compliant);
    }

    [Fact]
    public async Task Service_ProducesPostureAndReportsForEveryFramework()
    {
        var demo = DemoInventoryLoader.Load();
        var store = new InMemoryCloudStore();
        store.Seed(demo.Resources, demo.Relationships);

        var service = new AzureComplianceService(store, NullLogger<AzureComplianceService>.Instance);

        var posture = await service.GetPostureAsync();

        posture.FrameworkScores.Should().ContainKey(ComplianceFramework.CIS);
        posture.FrameworkScores[ComplianceFramework.CIS].Should().BeInRange(0, 100);
        posture.TotalViolations.Should().BeGreaterThan(0);

        var report = await service.GenerateReportAsync(ComplianceFramework.CIS);

        report.TotalPolicies.Should().BeGreaterThan(0);
        report.Results.Should().NotBeEmpty();
        report.TopViolations.Should().NotBeEmpty();
        report.CompliancePercentage.Should().BeInRange(0, 100);
    }

    [Fact]
    public async Task Service_ScanCanBeFilteredByFramework()
    {
        var demo = DemoInventoryLoader.Load();
        var store = new InMemoryCloudStore();
        store.Seed(demo.Resources, demo.Relationships);

        var service = new AzureComplianceService(store, NullLogger<AzureComplianceService>.Instance);
        var results = (await service.RunScanAsync(ComplianceFramework.HIPAA)).ToList();

        results.Should().NotBeEmpty();
        results.Should().OnlyContain(r => r.Framework == ComplianceFramework.HIPAA);
    }

    [Fact]
    public async Task PolicyCatalog_CoversAllFourPhaseOneFrameworks()
    {
        var demo = DemoInventoryLoader.Load();
        var store = new InMemoryCloudStore();
        store.Seed(demo.Resources, demo.Relationships);
        var service = new AzureComplianceService(store, NullLogger<AzureComplianceService>.Instance);

        var policies = (await service.GetPoliciesAsync()).ToList();

        policies.Select(p => p.Framework).Distinct().Should().Contain(new[]
        {
            ComplianceFramework.CIS,
            ComplianceFramework.SOC2,
            ComplianceFramework.HIPAA,
            ComplianceFramework.GDPR
        });
    }
}
