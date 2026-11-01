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

public class InventorySnapshotTests
{
    private static CloudResource Resource(string id, params string[] targets) => new()
    {
        Id = id,
        Provider = CloudProvider.Azure,
        Name = id,
        Relationships = targets.Select(target => new ResourceRelationship
        {
            SourceResourceId = id,
            TargetResourceId = target,
            RelationshipType = RelationshipType.DependsOn
        }).ToList()
    };

    private static CloudDiscoveryService Service(Mock<ICloudProviderService> provider, InMemoryCloudStore store, RuntimeState state)
    {
        provider.SetupGet(p => p.Provider).Returns(CloudProvider.Azure);
        provider.SetupGet(p => p.IsConfigured).Returns(true);
        return new CloudDiscoveryService(new[] { provider.Object }, store, store,
            new Mock<INotificationService>().Object, state, Options.Create(new PlatformOptions()),
            NullLogger<CloudDiscoveryService>.Instance);
    }

    [Fact]
    public async Task CompleteAzureSnapshotReplacesRemovedResourcesAndRelationships()
    {
        var provider = new Mock<ICloudProviderService>();
        provider.SetupSequence(p => p.DiscoverResourcesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Resource("a", "b"), Resource("b") }.AsEnumerable())
            .ReturnsAsync(new[] { Resource("a", "c"), Resource("c") }.AsEnumerable())
            .ReturnsAsync(Array.Empty<CloudResource>().AsEnumerable());
        var store = new InMemoryCloudStore();
        var state = new RuntimeState();
        var service = Service(provider, store, state);

        await service.DiscoverAsync();
        var firstSeen = (await store.GetByIdAsync("a"))!.DiscoveredAt;
        Assert.Equal(1, await store.GetEdgeCountAsync());
        await service.DiscoverAsync();
        Assert.Equal("Succeeded", state.DiscoveryStatus);
        Assert.Null(await store.GetByIdAsync("b"));
        Assert.NotNull(await store.GetByIdAsync("c"));
        Assert.Equal(firstSeen, (await store.GetByIdAsync("a"))!.DiscoveredAt);
        Assert.Equal(2, await store.GetCountAsync());
        var graph = await store.GetFullGraphAsync();
        Assert.Single(graph.Edges);
        Assert.Equal("c", graph.Edges.Single().Target);

        await service.DiscoverAsync();
        Assert.Equal("Succeeded", state.DiscoveryStatus);
        Assert.Equal(0, await store.GetCountAsync());
        Assert.Equal(0, await store.GetEdgeCountAsync());
    }

    [Fact]
    public async Task FailedOrInvalidDiscoveryPreservesThePriorSnapshot()
    {
        var provider = new Mock<ICloudProviderService>();
        provider.SetupSequence(p => p.DiscoverResourcesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { Resource("a", "b"), Resource("b") }.AsEnumerable())
            .ThrowsAsync(new InvalidOperationException("provider error"))
            .ReturnsAsync(new[] { Resource("a"), Resource("A") }.AsEnumerable());
        var store = new InMemoryCloudStore();
        var state = new RuntimeState();
        var service = Service(provider, store, state);

        await service.DiscoverAsync();
        var lastSuccess = state.LastDiscoveryAt;
        await service.DiscoverAsync();
        Assert.Equal("Failed", state.DiscoveryStatus);
        Assert.Equal(lastSuccess, state.LastDiscoveryAt);
        Assert.Equal(2, await store.GetCountAsync());
        Assert.Equal(1, await store.GetEdgeCountAsync());
        await service.DiscoverAsync();
        Assert.Equal("Failed", state.DiscoveryStatus);
        Assert.Equal(lastSuccess, state.LastDiscoveryAt);
        Assert.Equal(2, await store.GetCountAsync());
        Assert.Equal(1, await store.GetEdgeCountAsync());
    }

    [Fact]
    public async Task InvalidRelationshipsAndCancellationCannotClearSnapshot()
    {
        var store = new InMemoryCloudStore();
        await store.ReplaceSnapshotAsync(CloudProvider.Azure, new[] { Resource("a", "b"), Resource("b") });
        var invalid = Resource("a");
        invalid.Relationships.Add(new ResourceRelationship { SourceResourceId = "other", TargetResourceId = "b" });
        await Assert.ThrowsAsync<InvalidOperationException>(() => store.ReplaceSnapshotAsync(CloudProvider.Azure, new[] { invalid }));
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => store.ReplaceSnapshotAsync(CloudProvider.Azure, Array.Empty<CloudResource>(), cancelled.Token));
        Assert.Equal(2, await store.GetCountAsync());
        Assert.Equal(1, await store.GetEdgeCountAsync());
    }

    [Fact]
    public async Task MixedProviderStoreCannotBeClearedBySingleProviderReplacement()
    {
        var store = new InMemoryCloudStore();
        await store.UpsertAsync(new CloudResource { Id = "aws", Provider = CloudProvider.AWS });
        await Assert.ThrowsAsync<InvalidOperationException>(() => store.ReplaceSnapshotAsync(CloudProvider.Azure, Array.Empty<CloudResource>()));
        Assert.NotNull(await store.GetByIdAsync("aws"));
    }
}
