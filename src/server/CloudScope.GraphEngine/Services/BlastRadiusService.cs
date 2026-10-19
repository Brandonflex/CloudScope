using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Core.Interfaces;
using Microsoft.Extensions.Logging;

namespace CloudScope.GraphEngine.Services;

/// <summary>
/// Blast radius analysis engine — traverses the resource graph to determine
/// the full impact of a resource failure.
/// </summary>
public class BlastRadiusService : IBlastRadiusService
{
    private readonly IGraphRepository _graphRepository;
    private readonly IResourceRepository _resourceRepository;
    private readonly ILogger<BlastRadiusService> _logger;

    public BlastRadiusService(
        IGraphRepository graphRepository,
        IResourceRepository resourceRepository,
        ILogger<BlastRadiusService> logger)
    {
        _graphRepository = graphRepository;
        _resourceRepository = resourceRepository;
        _logger = logger;
    }

    /// <inheritdoc/>
    public async Task<BlastRadiusResult> AnalyzeAsync(
        string resourceId,
        int maxDepth = 5,
        CancellationToken ct = default)
    {
        _logger.LogInformation("Analyzing blast radius for resource {ResourceId} (max depth: {MaxDepth})...",
            resourceId, maxDepth);

        var resource = await _resourceRepository.GetByIdAsync(resourceId, ct);
        if (resource is null)
        {
            return new BlastRadiusResult
            {
                ResourceId = resourceId,
                ResourceName = "Unknown",
                RiskLevel = RiskLevel.Low,
                Summary = "Resource not found in inventory."
            };
        }

        // Get all transitive dependencies via graph traversal
        var dependencies = await _graphRepository.GetTransitiveDependenciesAsync(resourceId, maxDepth, ct);
        var dependencyList = dependencies.ToList();

        // Enrich dependent nodes with metadata (region, type, cost) from the inventory.
        var dependents = new List<(BlastRadiusNode Node, CloudResource? Resource)>();
        foreach (var dependency in dependencyList)
        {
            var dependentResource = await _resourceRepository.GetByIdAsync(dependency.ResourceId, ct);

            if (dependentResource is not null)
            {
                dependency.ResourceName = dependentResource.Name;
                dependency.ResourceType = dependentResource.ResourceType;
                dependency.Provider = dependentResource.Provider;
            }

            dependents.Add((dependency, dependentResource));
        }

        // Categorize by type and region
        var byType = dependents
            .GroupBy(d => d.Node.ResourceType)
            .ToDictionary(g => g.Key, g => g.Count());

        var byRegion = dependents
            .GroupBy(d => string.IsNullOrWhiteSpace(d.Resource?.Region) ? "unknown" : d.Resource!.Region)
            .ToDictionary(g => g.Key, g => g.Count());

        // Calculate affected monthly cost: the resource itself plus everything downstream.
        var affectedCost = resource.EstimatedMonthlyCost +
                           dependents.Sum(d => d.Resource?.EstimatedMonthlyCost ?? 0m);

        // Determine risk level
        var riskLevel = CalculateRiskLevel(dependencyList.Count, affectedCost);

        var result = new BlastRadiusResult
        {
            ResourceId = resourceId,
            ResourceName = resource.Name,
            RiskLevel = riskLevel,
            AffectedResourceCount = dependencyList.Count,
            DirectDependents = dependencyList.Where(d => d.HopCount == 1).ToList(),
            TransitiveDependents = dependencyList.Where(d => d.HopCount > 1).ToList(),
            AffectedByType = byType,
            AffectedByRegion = byRegion,
            AffectedMonthlyCost = Math.Round(affectedCost, 2),
            Summary = GenerateSummary(resource, dependencyList.Count, riskLevel)
        };

        _logger.LogInformation("Blast radius analysis complete for {Resource}: {Count} affected resources, risk={Risk}",
            resource.Name, result.AffectedResourceCount, result.RiskLevel);

        return result;
    }

    private static RiskLevel CalculateRiskLevel(int affectedCount, decimal cost)
    {
        return (affectedCount, cost) switch
        {
            (> 50, _) => RiskLevel.Critical,
            (> 20, _) => RiskLevel.High,
            (> 5, _) => RiskLevel.Medium,
            (> 0, > 1000) => RiskLevel.Medium,
            (> 0, _) => RiskLevel.Low,
            _ => RiskLevel.Low
        };
    }

    private static string GenerateSummary(CloudResource resource, int affectedCount, RiskLevel risk)
    {
        return affectedCount switch
        {
            0 => $"'{resource.Name}' has no downstream dependencies. Safe to modify or decommission.",
            1 => $"'{resource.Name}' has 1 dependent resource. Low impact if disrupted.",
            <= 5 => $"'{resource.Name}' has {affectedCount} dependent resources. Moderate impact — review dependencies before changes.",
            <= 20 => $"'{resource.Name}' has {affectedCount} dependent resources. High impact — changes may cause cascading failures.",
            _ => $"'{resource.Name}' has {affectedCount} dependent resources. CRITICAL — failure would cause widespread disruption."
        };
    }
}