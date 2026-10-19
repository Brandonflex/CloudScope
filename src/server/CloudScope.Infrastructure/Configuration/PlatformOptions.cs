namespace CloudScope.Infrastructure.Configuration;

/// <summary>
/// Platform-level behaviour switches. Demo mode is auto-detected when no cloud
/// credentials are configured, but can be forced on or off here.
/// </summary>
public class PlatformOptions
{
    public const string SectionName = "Platform";

    /// <summary>
    /// "Auto" (default), "Demo" or "Live".
    /// </summary>
    public string Mode { get; set; } = "Auto";

    /// <summary>
    /// Storage backend: "InMemory" (default) or "Cosmos".
    /// </summary>
    public string StorageProvider { get; set; } = "InMemory";

    /// <summary>
    /// When true the bundled demo estate is loaded at startup if the store is empty.
    /// </summary>
    public bool SeedDemoData { get; set; } = true;
}

/// <summary>
/// Background discovery configuration.
/// </summary>
public class DiscoveryOptions
{
    public const string SectionName = "Discovery";

    /// <summary>
    /// Enable the periodic background sync loop.
    /// </summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// How often a sync runs, in minutes.
    /// </summary>
    public int IntervalMinutes { get; set; } = 15;

    /// <summary>
    /// Delay before the first background sync, in seconds.
    /// </summary>
    public int StartupDelaySeconds { get; set; } = 20;
}
