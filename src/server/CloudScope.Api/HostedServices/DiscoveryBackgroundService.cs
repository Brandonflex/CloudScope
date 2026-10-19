using CloudScope.Core.Interfaces;
using CloudScope.Infrastructure.Configuration;
using CloudScope.Infrastructure.Runtime;
using Microsoft.Extensions.Options;

namespace CloudScope.Api.HostedServices;

/// <summary>
/// Seeds the demo estate (or runs the first live sync) shortly after startup and
/// then refreshes the inventory on a configurable interval.
/// </summary>
public class DiscoveryBackgroundService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly IOptions<DiscoveryOptions> _discoveryOptions;
    private readonly IOptions<PlatformOptions> _platformOptions;
    private readonly RuntimeState _runtime;
    private readonly ILogger<DiscoveryBackgroundService> _logger;

    public DiscoveryBackgroundService(
        IServiceProvider serviceProvider,
        IOptions<DiscoveryOptions> discoveryOptions,
        IOptions<PlatformOptions> platformOptions,
        RuntimeState runtime,
        ILogger<DiscoveryBackgroundService> logger)
    {
        _serviceProvider = serviceProvider;
        _discoveryOptions = discoveryOptions;
        _platformOptions = platformOptions;
        _runtime = runtime;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var options = _discoveryOptions.Value;
        var startupDelay = TimeSpan.FromSeconds(Math.Max(0, options.StartupDelaySeconds));

        try
        {
            await Task.Delay(startupDelay, stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        await RunStartupSeedAsync(stoppingToken);

        if (!options.Enabled || _runtime.DemoMode || stoppingToken.IsCancellationRequested)
        {
            return;
        }

        var interval = TimeSpan.FromMinutes(Math.Max(1, options.IntervalMinutes));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(interval, stoppingToken);

                using var scope = _serviceProvider.CreateScope();
                var discovery = scope.ServiceProvider.GetRequiredService<IDiscoveryService>();
                await discovery.DiscoverAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Scheduled discovery failed.");
            }
        }
    }

    private async Task RunStartupSeedAsync(CancellationToken ct)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var statusService = scope.ServiceProvider.GetRequiredService<IPlatformStatusService>();
            var discovery = scope.ServiceProvider.GetRequiredService<IDiscoveryService>();
            var status = await statusService.GetStatusAsync(ct);

            if (status.ResourceCount > 0)
            {
                _logger.LogInformation("Inventory already contains {Count} resources; skipping startup seed.",
                    status.ResourceCount);
                return;
            }

            var platform = _platformOptions.Value;

            if (status.ConfiguredProviders.Count == 0)
            {
                if (!platform.SeedDemoData)
                {
                    _logger.LogWarning("No cloud providers configured and demo seeding is disabled.");
                    return;
                }

                _logger.LogInformation("No cloud providers configured — loading the bundled demo estate.");
                await discovery.SeedDemoAsync(ct);
                _runtime.DemoMode = true;
            }
            else
            {
                _logger.LogInformation("Starting initial discovery for: {Providers}",
                    string.Join(", ", status.ConfiguredProviders));
                await discovery.DiscoverAsync(ct);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Startup seeding/discovery failed.");
            _runtime.LastDiscoveryError = ex.Message;
        }
    }
}
