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
}
