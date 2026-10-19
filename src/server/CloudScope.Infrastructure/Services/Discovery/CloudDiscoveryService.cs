using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Core.Interfaces;
using CloudScope.Infrastructure.Demo;
using CloudScope.Infrastructure.Helpers;
using CloudScope.Infrastructure.Runtime;
using Microsoft.Extensions.Logging;

namespace CloudScope.Infrastructure.Services.Discovery;

/// <summary>
/// Orchestrates discovery across all configured providers, persists resources and
/// relationships, and publishes real-time notifications. When no provider has
/// credentials the bundled demo estate is loaded instead.
/// </summary>
public class CloudDiscoveryService : IDiscoveryService
{
    private readonly IEnumerable<ICloudProviderService> _providers;
    private readonly IResourceRepository _resourceRepository;
    private readonly IGraphRepository _graphRepository;
    private readonly INotificationService _notifications;
    private readonly RuntimeState _runtime;
    private readonly ILogger<CloudDiscoveryService> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public CloudDiscoveryService(
        IEnumerable<ICloudProviderService> providers,
        IResourceRepository resourceRepository,
        IGraphRepository graphRepository,
        INotificationService notifications,
        RuntimeState runtime,
        ILogger<CloudDiscoveryService> logger)
    {
        _providers = providers;
        _resourceRepository = resourceRepository;
        _graphRepository = graphRepository;
        _notifications = notifications;
        _runtime = runtime;
        _logger = logger;
    }

    /// <inheritdoc/>
    public async Task<DiscoveryResult> DiscoverAsync(CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            _runtime.DiscoveryInProgress = true;
            _runtime.LastDiscoveryError = null;

            var configured = _providers.Where(p => p.IsConfigured).ToList();
            if (configured.Count == 0)
            {
                _logger.LogInformation("No cloud providers are configured; loading the demo estate.");
                return await SeedDemoCoreAsync(ct);
            }

            var result = new DiscoveryResult { StartedAt = DateTime.UtcNow, DemoMode = false };

            foreach (var provider in configured)
            {
                var providerResult = new ProviderDiscoveryResult
                {
                    Provider = provider.Provider,
                    Configured = true
                };

                try
                {
                    var discovered = (await provider.DiscoverResourcesAsync(ct)).ToList();
                    await _resourceRepository.UpsertBatchAsync(discovered, ct);

                    providerResult.ResourcesDiscovered = discovered.Count;
                    result.Providers.Add(providerResult);

                    _logger.LogInformation("{Provider} discovery stored {Count} resources.",
                        provider.Provider, discovered.Count);

                    await _notifications.NotifyDiscoveryProgress(
                        provider.Provider, result.ResourcesDiscovered,
                        result.ResourcesDiscovered + discovered.Count);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    providerResult.Error = ex.Message;
                    result.Providers.Add(providerResult);
                    _runtime.LastDiscoveryError = ex.Message;

                    _logger.LogError(ex, "{Provider} discovery failed.", provider.Provider);
                }
            }

            // Persist edges only when both endpoints are known.
            var allResources = new List<CloudResource>();
            var page = 1;
            while (true)
            {
                var batch = await _resourceRepository.GetAllAsync(page, 500, ct: ct);
                allResources.AddRange(batch.Items);
                if (batch.Items.Count < 500 || allResources.Count >= batch.TotalCount) break;
                page++;
            }

            var knownIds = allResources.Select(r => r.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var relationship in allResources.SelectMany(r => r.Relationships))
            {
                RelationshipIdentity.EnsureId(relationship);
            }

            var edges = allResources
                .SelectMany(r => r.Relationships)
                .Where(edge => knownIds.Contains(edge.SourceResourceId) &&
                               knownIds.Contains(edge.TargetResourceId))
                .GroupBy(edge => $"{edge.SourceResourceId}|{edge.TargetResourceId}|{edge.RelationshipType}")
                .Select(group => group.First())
                .ToList();

            foreach (var edge in edges)
            {
                await _graphRepository.UpsertEdgeAsync(edge, ct);
            }

            result.RelationshipsDiscovered = edges.Count;
            result.ResourcesDiscovered = result.Providers.Sum(p => p.ResourcesDiscovered);
            result.CompletedAt = DateTime.UtcNow;

            _runtime.LastDiscoveryAt = result.CompletedAt;
            _runtime.DemoMode = false;

            await _notifications.NotifyDiscoveryCompleted(result.ResourcesDiscovered, result.Duration);

            _logger.LogInformation(
                "Discovery finished: {Resources} resources, {Edges} relationships, {Duration:0.0}s.",
                result.ResourcesDiscovered, result.RelationshipsDiscovered, result.Duration.TotalSeconds);

            return result;
        }
        finally
        {
            _runtime.DiscoveryInProgress = false;
            _gate.Release();
        }
    }

    /// <inheritdoc/>
    public async Task<DiscoveryResult> SeedDemoAsync(CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            return await SeedDemoCoreAsync(ct);
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<DiscoveryResult> SeedDemoCoreAsync(CancellationToken ct)
    {
        var document = DemoInventoryLoader.Load();

        await _resourceRepository.UpsertBatchAsync(document.Resources, ct);
        foreach (var relationship in document.Relationships)
        {
            await _graphRepository.UpsertEdgeAsync(relationship, ct);
        }

        var result = new DiscoveryResult
        {
            StartedAt = DateTime.UtcNow,
            CompletedAt = DateTime.UtcNow,
            DemoMode = true,
            ResourcesDiscovered = document.Resources.Count,
            RelationshipsDiscovered = document.Relationships.Count,
            Providers = _providers.Select(p => new ProviderDiscoveryResult
            {
                Provider = p.Provider,
                Configured = p.IsConfigured,
                ResourcesDiscovered = document.Resources.Count(r => r.Provider == p.Provider),
                RelationshipsDiscovered = document.Relationships.Count
            }).ToList()
        };

        _runtime.DemoMode = true;
        _runtime.LastDiscoveryAt = result.CompletedAt;

        _logger.LogInformation(
            "Demo estate loaded: {Resources} resources and {Relationships} relationships.",
            result.ResourcesDiscovered, result.RelationshipsDiscovered);

        return result;
    }
}
