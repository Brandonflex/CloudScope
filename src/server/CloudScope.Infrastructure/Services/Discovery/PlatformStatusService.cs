using CloudScope.Core.Domain.Models;
using CloudScope.Core.Interfaces;
using CloudScope.Infrastructure.Configuration;
using CloudScope.Infrastructure.Runtime;
using Microsoft.Extensions.Options;

namespace CloudScope.Infrastructure.Services.Discovery;

/// <summary>
/// Reports what mode the platform is running in and how much data is loaded.
/// </summary>
public class PlatformStatusService : IPlatformStatusService
{
    private readonly IResourceRepository _resourceRepository;
    private readonly IGraphRepository _graphRepository;
    private readonly IEnumerable<ICloudProviderService> _providers;
    private readonly RuntimeState _runtime;
    private readonly AzureOpenAIOptions _openAiOptions;

    public PlatformStatusService(
        IResourceRepository resourceRepository,
        IGraphRepository graphRepository,
        IEnumerable<ICloudProviderService> providers,
        RuntimeState runtime,
        IOptions<AzureOpenAIOptions> openAiOptions)
    {
        _resourceRepository = resourceRepository;
        _graphRepository = graphRepository;
        _providers = providers;
        _runtime = runtime;
        _openAiOptions = openAiOptions.Value;
    }

    public async Task<PlatformStatus> GetStatusAsync(CancellationToken ct = default)
    {
        var version = typeof(PlatformStatusService).Assembly.GetName().Version?.ToString() ?? "1.0.0";

        return new PlatformStatus
        {
            Version = version,
            DemoMode = _runtime.DemoMode,
            StorageProvider = _runtime.StorageProvider,
            AiMode = !string.IsNullOrWhiteSpace(_openAiOptions.Endpoint) &&
                     !string.IsNullOrWhiteSpace(_openAiOptions.ApiKey)
                ? "AzureOpenAI"
                : "Local",
            ConfiguredProviders = _providers
                .Where(p => p.IsConfigured)
                .Select(p => p.Provider.ToString())
                .ToList(),
            ResourceCount = await _resourceRepository.GetCountAsync(ct: ct),
            RelationshipCount = await _graphRepository.GetEdgeCountAsync(ct),
            LastDiscoveryAt = _runtime.LastDiscoveryAt
        };
    }
}
