using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using CloudScope.Core.Domain.Models;
using CloudScope.Infrastructure.Helpers;

namespace CloudScope.Infrastructure.Demo;

/// <summary>
/// Shape of the bundled demo inventory document (src/client/public/demo/inventory.json).
/// The same file is used by the Angular app's offline demo mode and the mock API.
/// </summary>
public sealed class DemoInventoryDocument
{
    public string Name { get; set; } = "CloudScope demo estate";
    public string Description { get; set; } = string.Empty;
    public List<CloudResource> Resources { get; set; } = new();
    public List<ResourceRelationship> Relationships { get; set; } = new();
}

/// <summary>
/// Loads the demo estate that is embedded into the assembly at build time.
/// Used to make CloudScope fully explorable without any cloud credentials.
/// </summary>
public static class DemoInventoryLoader
{
    private const string ResourceName = "CloudScope.demo.inventory.json";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    /// <summary>
    /// Deserialize a fresh copy of the demo estate. Each call returns new object
    /// instances so callers are free to mutate them.
    /// </summary>
    public static DemoInventoryDocument Load()
    {
        var assembly = typeof(DemoInventoryLoader).Assembly;

        using var stream = assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException(
                $"Embedded demo inventory '{ResourceName}' was not found. " +
                "Check the EmbeddedResource item in CloudScope.Infrastructure.csproj.");

        var document = JsonSerializer.Deserialize<DemoInventoryDocument>(stream, JsonOptions)
            ?? throw new InvalidOperationException("Demo inventory could not be deserialized.");

        // Normalise ids and wire each resource's relationship list (both directions).
        foreach (var resource in document.Resources)
        {
            if (string.IsNullOrWhiteSpace(resource.Id))
            {
                resource.Id = $"{resource.Provider.ToString().ToLowerInvariant()}:{resource.NativeId}";
            }
        }

        var byId = document.Resources.ToDictionary(r => r.Id, StringComparer.OrdinalIgnoreCase);

        foreach (var relationship in document.Relationships)
        {
            RelationshipIdentity.EnsureId(relationship);
        }

        foreach (var resource in document.Resources)
        {
            resource.Relationships = document.Relationships
                .Where(rel =>
                    string.Equals(rel.SourceResourceId, resource.Id, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(rel.TargetResourceId, resource.Id, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        // Drop relationships that point at resources which are not part of the estate.
        document.Relationships = document.Relationships
            .Where(rel => byId.ContainsKey(rel.SourceResourceId) && byId.ContainsKey(rel.TargetResourceId))
            .ToList();

        return document;
    }
}
