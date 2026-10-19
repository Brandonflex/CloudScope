using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Infrastructure.Demo;
using CloudScope.Infrastructure.Repositories;
using FluentAssertions;

namespace CloudScope.Tests.Unit;

public class InMemoryCloudStoreTests
{
    private static InMemoryCloudStore CreateSeededStore()
    {
        var demo = DemoInventoryLoader.Load();
        var store = new InMemoryCloudStore();
        store.Seed(demo.Resources, demo.Relationships);
        return store;
    }

    [Fact]
    public void Seed_LoadsEveryDemoResourceAndRelationship()
    {
        var demo = DemoInventoryLoader.Load();
        var store = CreateSeededStore();

        store.GetCountAsync().Result.Should().Be(demo.Resources.Count);
        store.GetEdgeCountAsync().Result.Should().Be(demo.Relationships.Count);
        demo.Resources.Should().HaveCountGreaterThan(50);
    }

    [Fact]
    public async Task GetAllAsync_AppliesProviderFilter()
    {
        var store = CreateSeededStore();

        var azure = await store.GetAllAsync(pageSize: 500, provider: CloudProvider.Azure);
        var aws = await store.GetAllAsync(pageSize: 500, provider: CloudProvider.AWS);

        azure.TotalCount.Should().BeGreaterThan(0);
        aws.TotalCount.Should().BeGreaterThan(0);
        azure.Items.Should().OnlyContain(r => r.Provider == CloudProvider.Azure);
        (azure.TotalCount + aws.TotalCount).Should().Be(await store.GetCountAsync());
    }

    [Fact]
    public async Task GetAllAsync_PaginatesResults()
    {
        var store = CreateSeededStore();

        var page1 = await store.GetAllAsync(1, 10);
        var page2 = await store.GetAllAsync(2, 10);

        page1.Items.Should().HaveCount(10);
        page2.Items.Should().HaveCount(10);
        page1.Items.Select(r => r.Id).Should().NotIntersectWith(page2.Items.Select(r => r.Id));
        page1.TotalPages.Should().BeGreaterThan(1);
    }

    [Fact]
    public async Task GetAllAsync_SearchesAcrossNameTypeAndTags()
    {
        var store = CreateSeededStore();

        var byName = await store.GetAllAsync(searchTerm: "vm-app");
        var byType = await store.GetAllAsync(searchTerm: "Kubernetes");
        var byTag = await store.GetAllAsync(searchTerm: "orders");

        byName.TotalCount.Should().BeGreaterThan(0);
        byType.TotalCount.Should().BeGreaterThan(0);
        byTag.TotalCount.Should().BeGreaterThan(0);
        byName.Items.Should().Contain(r => r.Name == "vm-app-01");
    }

    [Fact]
    public async Task GetTransitiveDependenciesAsync_WalksDependentsOnly()
    {
        var store = CreateSeededStore();
        var subnet = (await store.GetAllAsync(searchTerm: "snet-app")).Items.Single();

        var dependents = (await store.GetTransitiveDependenciesAsync(subnet.Id, 5)).ToList();

        dependents.Should().NotBeEmpty();
        dependents.Should().Contain(d => d.ResourceName == "vm-app-01");
        dependents.Should().Contain(d => d.ResourceName == "aks-prod");
        dependents.Should().NotContain(d => d.ResourceName == "vnet-prod-eastus");
        dependents.Select(d => d.ResourceId).Should().OnlyHaveUniqueItems();
        dependents.Should().OnlyContain(d => d.HopCount >= 1 && d.HopCount <= 5);
    }

    [Fact]
    public async Task GetTransitiveDependenciesAsync_RespectsMaxDepth()
    {
        var store = CreateSeededStore();
        var vnet = (await store.GetAllAsync(searchTerm: "vnet-prod-eastus")).Items.Single();

        var oneHop = (await store.GetTransitiveDependenciesAsync(vnet.Id, 1)).ToList();
        var threeHops = (await store.GetTransitiveDependenciesAsync(vnet.Id, 3)).ToList();

        oneHop.Should().OnlyContain(d => d.HopCount == 1);
        threeHops.Count.Should().BeGreaterThan(oneHop.Count);
    }

    [Fact]
    public async Task FindPathAsync_ReturnsShortestEdgeChain()
    {
        var store = CreateSeededStore();
        var resources = await store.GetAllAsync(pageSize: 500);
        var vm = resources.Items.Single(r => r.Name == "vm-app-01");
        var vnet = resources.Items.Single(r => r.Name == "vnet-prod-eastus");

        var path = (await store.FindPathAsync(vm.Id, vnet.Id)).ToList();

        path.Should().HaveCount(3);
        path.Should().Contain(e => e.RelationshipType == RelationshipType.Contains);
    }

    [Fact]
    public async Task GetSubgraphAsync_ReturnsNeighboursWithinDepth()
    {
        var store = CreateSeededStore();
        var vm = (await store.GetAllAsync(searchTerm: "vm-app-01")).Items.First(r => r.Name == "vm-app-01");

        var subgraph = await store.GetSubgraphAsync(vm.Id, 1);

        subgraph.Nodes.Select(n => n.Label).Should().Contain("vm-app-01");
        subgraph.Nodes.Select(n => n.Label).Should().Contain("nic-app-01");
        subgraph.Edges.Should().NotBeEmpty();
        subgraph.Edges.Should().OnlyContain(e =>
            subgraph.Nodes.Any(n => n.Id == e.Source) && subgraph.Nodes.Any(n => n.Id == e.Target));
    }

    [Fact]
    public async Task GetFullGraphAsync_FiltersNodesAndDropsDanglingEdges()
    {
        var store = CreateSeededStore();

        var graph = await store.GetFullGraphAsync(CloudProvider.AWS);

        graph.Nodes.Should().NotBeEmpty();
        graph.Nodes.Should().OnlyContain(n => n.Provider == CloudProvider.AWS);
        graph.Edges.Should().OnlyContain(e =>
            graph.Nodes.Any(n => n.Id == e.Source) && graph.Nodes.Any(n => n.Id == e.Target));
    }

    [Fact]
    public async Task UpsertAsync_AddsAndUpdatesResources()
    {
        var store = new InMemoryCloudStore();
        var resource = new CloudResource
        {
            Id = "az:test",
            NativeId = "/subscriptions/x/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/test",
            Name = "test-vm",
            Provider = CloudProvider.Azure,
            ResourceType = ResourceType.VirtualMachine,
            EstimatedMonthlyCost = 100m
        };

        await store.UpsertAsync(resource);
        (await store.GetCountAsync()).Should().Be(1);

        resource.EstimatedMonthlyCost = 250m;
        await store.UpsertAsync(resource);

        var stored = await store.GetByIdAsync("az:test");
        stored!.EstimatedMonthlyCost.Should().Be(250m);
        (await store.GetCountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task DeleteVertexAsync_RemovesEdgesToo()
    {
        var store = CreateSeededStore();
        var nic = (await store.GetAllAsync(searchTerm: "nic-app-01")).Items.Single();
        var edgesBefore = await store.GetEdgeCountAsync();

        await store.DeleteVertexAsync(nic.Id);

        (await store.GetByIdAsync(nic.Id)).Should().BeNull();
        (await store.GetEdgeCountAsync()).Should().BeLessThan(edgesBefore);
        (await store.GetNeighborsAsync(nic.Id)).Should().BeEmpty();
    }
}
