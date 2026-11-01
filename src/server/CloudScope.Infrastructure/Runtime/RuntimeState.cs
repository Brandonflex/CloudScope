namespace CloudScope.Infrastructure.Runtime;

/// <summary>
/// Process-wide runtime flags shared by discovery, the status endpoint and the UI.
/// </summary>
public sealed class RuntimeState
{
    private readonly object _sync = new();

    // Discovery services are scoped; the gate must be shared across all scopes.
    public SemaphoreSlim DiscoveryGate { get; } = new(1, 1);

    private bool _demoMode;
    private string _storageProvider = "InMemory";
    private DateTime? _lastDiscoveryAt;
    private string? _lastDiscoveryError;
    private bool _discoveryInProgress;
    private string _discoveryStatus = "NotStarted";

    public bool DemoMode
    {
        get { lock (_sync) return _demoMode; }
        set { lock (_sync) _demoMode = value; }
    }

    public string StorageProvider
    {
        get { lock (_sync) return _storageProvider; }
        set { lock (_sync) _storageProvider = value; }
    }

    public DateTime? LastDiscoveryAt
    {
        get { lock (_sync) return _lastDiscoveryAt; }
        set { lock (_sync) _lastDiscoveryAt = value; }
    }

    public string? LastDiscoveryError
    {
        get { lock (_sync) return _lastDiscoveryError; }
        set { lock (_sync) _lastDiscoveryError = value; }
    }

    // Reports outcome, not just whether a provider has been configured.
    public string DiscoveryStatus
    {
        get { lock (_sync) return _discoveryStatus; }
        set { lock (_sync) _discoveryStatus = value; }
    }

    public bool DiscoveryInProgress
    {
        get { lock (_sync) return _discoveryInProgress; }
        set { lock (_sync) _discoveryInProgress = value; }
    }
}
