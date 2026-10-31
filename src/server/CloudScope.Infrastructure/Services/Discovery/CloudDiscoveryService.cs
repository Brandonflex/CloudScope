using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Core.Interfaces;
using CloudScope.Infrastructure.Configuration;
using CloudScope.Infrastructure.Demo;
using CloudScope.Infrastructure.Helpers;
using CloudScope.Infrastructure.Runtime;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

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
    private readonly PlatformOptions _platform;

    public CloudDiscoveryService(
        IEnumerable<ICloudProviderService> providers,
        IResourceRepository resourceRepository,
        IGraphRepository graphRepository,
        INotificationService notifications,
        RuntimeState runtime,
        IOptions<PlatformOptions> platform,
        ILogger<CloudDiscoveryService> logger)
    {
        _providers = providers;
        _resourceRepository = resourceRepository;
        _graphRepository = graphRepository;
        _notifications = notifications;
        _runtime = runtime;
        _platform = platform.Value;
        _logger = logger;
    }

    /// <inheritdoc/>
    public async Task<DiscoveryResult> DiscoverAsync(CancellationToken ct = default)
    {
        await _runtime.DiscoveryGate.WaitAsync(ct);
        try
        {
            _runtime.DiscoveryInProgress = true;
            _runtime.DiscoveryStatus = "InProgress";
            _runtime.LastDiscoveryError = null;

            var configured = _providers.Where(p => p.IsConfigured).ToList();
            if (configured.Count == 0)
            {
                if (!_platform.SeedDemoData)
                    throw new InvalidOperationException("No cloud providers are configured and demo seeding is disabled.");

                _logger.LogInformation("No cloud providers are configured; loading the demo estate.");
                return await SeedDemoCoreAsync(ct);
            }

            // A process that seeded demo data must never reinterpret the same
            // store as live. Do not delete data; require a fresh process/store.
            if (_runtime.DemoMode)
                throw new InvalidOperationException("Live discovery requires a fresh store that has never contained demo data.");

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
                    _logger.LogInformation("{Provider} discovery stored {Count} resources.",
                        provider.Provider, discovered.Count);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    providerResult.Error = "Discovery failed. See server logs for details.";
                    _runtime.LastDiscoveryError = ex.Message;

                    _logger.LogError(ex, "{Provider} discovery failed.", provider.Provider);
                }

                result.Providers.Add(providerResult);
                try
                {
                    var completed = result.Providers.Sum(p => p.ResourcesDiscovered);
                    await _notifications.NotifyDiscoveryProgress(provider.Provider, completed, completed);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogWarning(ex, "Could not send discovery progress notification.");
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

            var failures = result.Providers.Count(p => p.Error is not null);
            _runtime.DiscoveryStatus = failures == 0 ? "Succeeded"
                : failures == result.Providers.Count ? "Failed" : "PartialFailure";
            if (failures == 0)
            {
                _runtime.LastDiscoveryAt = result.CompletedAt;
                try
                {
                    await _notifications.NotifyDiscoveryCompleted(result.ResourcesDiscovered, result.Duration);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogWarning(ex, "Could not send discovery completion notification.");
                }
            }
            _runtime.DemoMode = false;

            _logger.LogInformation(
                "Discovery finished: {Resources} resources, {Edges} relationships, {Duration:0.0}s.",
                result.ResourcesDiscovered, result.RelationshipsDiscovered, result.Duration.TotalSeconds);

            return result;
        }
        catch
        {
            _runtime.DiscoveryStatus = "Failed";
            throw;
        }
        finally
        {
            _runtime.DiscoveryInProgress = false;
            _runtime.DiscoveryGate.Release();
        }
    }

    /// <inheritdoc/>
    public async Task<DiscoveryResult> SeedDemoAsync(CancellationToken ct = default)
    {
        if (!_platform.SeedDemoData || _providers.Any(p => p.IsConfigured))
            throw new InvalidOperationException("Demo seeding is disabled or cloud providers are configured.");

        await _runtime.DiscoveryGate.WaitAsync(ct);
        try
        {
            _runtime.DiscoveryInProgress = true;
            return await SeedDemoCoreAsync(ct);
        }
        finally
        {
            _runtime.DiscoveryInProgress = false;
            _runtime.DiscoveryGate.Release();
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
        _runtime.DiscoveryStatus = "Demo";
        _runtime.LastDiscoveryAt = result.CompletedAt;

        _logger.LogInformation(
            "Demo estate loaded: {Resources} resources and {Relationships} relationships.",
            result.ResourcesDiscovered, result.RelationshipsDiscovered);

        return result;
    }
}
