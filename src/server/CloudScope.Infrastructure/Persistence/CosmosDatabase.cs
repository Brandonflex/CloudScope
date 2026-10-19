using CloudScope.Infrastructure.Configuration;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CloudScope.Infrastructure.Persistence;

/// <summary>
/// Owns the Cosmos DB client and lazily creates the database/containers.
/// The SQL API is used (not the Gremlin API) so the platform only depends on one
/// Cosmos SDK; graph traversal is performed by the graph repository.
/// </summary>
public sealed class CosmosDatabase
{
    private readonly CosmosDbOptions _options;
    private readonly ILogger<CosmosDatabase> _logger;
    private readonly SemaphoreSlim _initGate = new(1, 1);
    private readonly CosmosClient _client;

    private Container? _resources;
    private Container? _edges;
    private bool _initialized;

    public CosmosDatabase(IOptions<CosmosDbOptions> options, ILogger<CosmosDatabase> logger)
    {
        _options = options.Value;
        _logger = logger;

        _client = new CosmosClient(_options.Endpoint, _options.Key, new CosmosClientOptions
        {
            ApplicationName = "CloudScope",
            SerializerOptions = new CosmosSerializationOptions
            {
                PropertyNamingPolicy = CosmosPropertyNamingPolicy.CamelCase
            }
        });
    }

    public async Task<Container> GetResourcesContainerAsync(CancellationToken ct = default)
    {
        await EnsureInitializedAsync(ct);
        return _resources!;
    }

    public async Task<Container> GetEdgesContainerAsync(CancellationToken ct = default)
    {
        await EnsureInitializedAsync(ct);
        return _edges!;
    }

    private async Task EnsureInitializedAsync(CancellationToken ct)
    {
        if (_initialized) return;

        await _initGate.WaitAsync(ct);
        try
        {
            if (_initialized) return;

            var database = await _client.CreateDatabaseIfNotExistsAsync(_options.DatabaseName, cancellationToken: ct);

            var resources = await database.Database.CreateContainerIfNotExistsAsync(
                new ContainerProperties(_options.ResourcesContainer, "/provider"), cancellationToken: ct);

            var edges = await database.Database.CreateContainerIfNotExistsAsync(
                new ContainerProperties(_options.GraphContainer, "/sourceResourceId"), cancellationToken: ct);

            _resources = resources.Container;
            _edges = edges.Container;
            _initialized = true;

            _logger.LogInformation("Cosmos DB initialised ({Database}/{Resources}, {Graph}).",
                _options.DatabaseName, _options.ResourcesContainer, _options.GraphContainer);
        }
        finally
        {
            _initGate.Release();
        }
    }
}
