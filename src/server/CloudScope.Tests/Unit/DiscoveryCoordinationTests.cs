using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Core.Interfaces;
using CloudScope.Infrastructure.Configuration;
using CloudScope.Infrastructure.Repositories;
using CloudScope.Infrastructure.Runtime;
using CloudScope.Infrastructure.Services.Discovery;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;

namespace CloudScope.Tests.Unit;

public class DiscoveryCoordinationTests
{
    [Fact]
    public async Task SeparateServiceScopesShareTheDiscoveryGate()
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var provider = new Mock<ICloudProviderService>();
        provider.SetupGet(p => p.IsConfigured).Returns(true);
        provider.SetupGet(p => p.Provider).Returns(CloudProvider.Azure);
        provider.Setup(p => p.DiscoverResourcesAsync(It.IsAny<CancellationToken>()))
            .Returns(async () =>
            {
                entered.TrySetResult();
                await release.Task;
                return Enumerable.Empty<CloudResource>();
            });
        var store = new InMemoryCloudStore();
        var runtime = new RuntimeState();
        var notifications = new Mock<INotificationService>();
        var options = Options.Create(new PlatformOptions());
        CloudDiscoveryService Create() => new(new[] { provider.Object }, store, store,
            notifications.Object, runtime, options, NullLogger<CloudDiscoveryService>.Instance);

        var first = Create().DiscoverAsync();
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        using var cancellation = new CancellationTokenSource();
        var second = Create().DiscoverAsync(cancellation.Token);
        cancellation.Cancel();
        try
        {
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => second);
            provider.Verify(p => p.DiscoverResourcesAsync(It.IsAny<CancellationToken>()), Times.Once);
        }
        finally
        {
            release.TrySetResult();
            await first;
        }
    }

    [Fact]
    public async Task DemoSeedingIsRejectedWhenDisabledOrAProviderIsConfigured()
    {
        var store = new InMemoryCloudStore();
        var notifications = new Mock<INotificationService>();
        var provider = new Mock<ICloudProviderService>();
        provider.SetupGet(p => p.IsConfigured).Returns(true);
        var service = new CloudDiscoveryService(new[] { provider.Object }, store, store,
            notifications.Object, new RuntimeState(), Options.Create(new PlatformOptions { SeedDemoData = true }),
            NullLogger<CloudDiscoveryService>.Instance);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.SeedDemoAsync());

        var disabled = new CloudDiscoveryService(Array.Empty<ICloudProviderService>(), store, store,
            notifications.Object, new RuntimeState(), Options.Create(new PlatformOptions { SeedDemoData = false }),
            NullLogger<CloudDiscoveryService>.Instance);
        await Assert.ThrowsAsync<InvalidOperationException>(() => disabled.DiscoverAsync());
        Assert.Equal(0, await store.GetCountAsync());
    }
    [Fact]
    public async Task EmptySuccessfulDiscoveryIsNotReportedAsFailure()
    {
        var provider = new Mock<ICloudProviderService>();
        provider.SetupGet(p => p.IsConfigured).Returns(true);
        provider.SetupGet(p => p.Provider).Returns(CloudProvider.Azure);
        provider.Setup(p => p.DiscoverResourcesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<CloudResource>());
        var store = new InMemoryCloudStore();
        var runtime = new RuntimeState();
        var notifications = new Mock<INotificationService>();
        var service = new CloudDiscoveryService(new[] { provider.Object }, store, store,
            notifications.Object, runtime, Options.Create(new PlatformOptions()),
            NullLogger<CloudDiscoveryService>.Instance);

        var result = await service.DiscoverAsync();
        Assert.Equal(0, result.ResourcesDiscovered);
        Assert.Null(result.Providers.Single().Error);
        Assert.Equal("Succeeded", runtime.DiscoveryStatus);
        Assert.NotNull(runtime.LastDiscoveryAt);
        Assert.False(runtime.DemoMode);
    }

    [Fact]
    public async Task ProviderFailureIsNotReportedAsAnEmptySuccessfulDiscovery()
    {
        var provider = new Mock<ICloudProviderService>();
        provider.SetupGet(p => p.IsConfigured).Returns(true);
        provider.SetupGet(p => p.Provider).Returns(CloudProvider.Azure);
        provider.Setup(p => p.DiscoverResourcesAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("private diagnostic"));
        var store = new InMemoryCloudStore();
        var runtime = new RuntimeState();
        var notifications = new Mock<INotificationService>();
        var service = new CloudDiscoveryService(new[] { provider.Object }, store, store,
            notifications.Object, runtime, Options.Create(new PlatformOptions()),
            NullLogger<CloudDiscoveryService>.Instance);

        var result = await service.DiscoverAsync();
        Assert.Equal("Failed", runtime.DiscoveryStatus);
        Assert.Null(runtime.LastDiscoveryAt);
        Assert.Equal("Discovery failed. See server logs for details.", result.Providers.Single().Error);
        notifications.Verify(n => n.NotifyDiscoveryCompleted(It.IsAny<int>(), It.IsAny<TimeSpan>()), Times.Never);
    }

    [Fact]
    public async Task PlatformStatusExposesDiscoveryOutcomeWithoutPrivateErrors()
    {
        var store = new InMemoryCloudStore();
        var runtime = new RuntimeState { DiscoveryStatus = "Failed", LastDiscoveryError = "private diagnostic" };
        var status = new PlatformStatusService(store, store, Array.Empty<ICloudProviderService>(), runtime,
            Options.Create(new AzureOpenAIOptions()));
        var result = await status.GetStatusAsync();
        Assert.Equal("Failed", result.DiscoveryStatus);
        Assert.Null(result.LastDiscoveryAt);
        Assert.Equal(0, result.ResourceCount);
    }

    [Fact]
    public async Task PartialProviderFailureDoesNotMarkTheEstateConnected()
    {
        var azure = new Mock<ICloudProviderService>();
        azure.SetupGet(p => p.IsConfigured).Returns(true);
        azure.SetupGet(p => p.Provider).Returns(CloudProvider.Azure);
        azure.Setup(p => p.DiscoverResourcesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<CloudResource>());
        var aws = new Mock<ICloudProviderService>();
        aws.SetupGet(p => p.IsConfigured).Returns(true);
        aws.SetupGet(p => p.Provider).Returns(CloudProvider.AWS);
        aws.Setup(p => p.DiscoverResourcesAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException());
        var store = new InMemoryCloudStore();
        var runtime = new RuntimeState();
        var service = new CloudDiscoveryService(new[] { azure.Object, aws.Object }, store, store,
            new Mock<INotificationService>().Object, runtime, Options.Create(new PlatformOptions()),
            NullLogger<CloudDiscoveryService>.Instance);

        await service.DiscoverAsync();
        Assert.Equal("PartialFailure", runtime.DiscoveryStatus);
        Assert.Null(runtime.LastDiscoveryAt);
    }

    [Fact]
    public async Task AStoreSeededWithDemoDataCannotBeSwitchedToLive()
    {
        var configured = false;
        var provider = new Mock<ICloudProviderService>();
        provider.SetupGet(p => p.IsConfigured).Returns(() => configured);
        provider.SetupGet(p => p.Provider).Returns(CloudProvider.Azure);
        var store = new InMemoryCloudStore();
        var runtime = new RuntimeState();
        var service = new CloudDiscoveryService(new[] { provider.Object }, store, store,
            new Mock<INotificationService>().Object, runtime, Options.Create(new PlatformOptions()),
            NullLogger<CloudDiscoveryService>.Instance);

        await service.SeedDemoAsync();
        var originalCount = await store.GetCountAsync();
        configured = true;
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.DiscoverAsync());
        Assert.Equal("Failed", runtime.DiscoveryStatus);
        Assert.True(runtime.DemoMode);
        Assert.Equal(originalCount, await store.GetCountAsync());
        provider.Verify(p => p.DiscoverResourcesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public void LiveStorageAndExternalAiAreRejectedUntilTheyHaveSafeProvenanceAndConsent()
    {
        var azure = new AzureOptions { SubscriptionId = "test-subscription" };
        var aws = new AwsOptions();
        var ai = new AzureOpenAIOptions();
        LiveDataSafety.Validate(false, azure, aws, ai);
        Assert.Throws<InvalidOperationException>(() => LiveDataSafety.Validate(true, azure, aws, ai));
        ai.Endpoint = "https://example.invalid";
        Assert.Throws<InvalidOperationException>(() => LiveDataSafety.Validate(false, azure, aws, ai));
        LiveDataSafety.Validate(true, new AzureOptions(), aws, ai); // demo behavior unchanged
    }
}
