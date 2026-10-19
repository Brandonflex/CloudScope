namespace CloudScope.Core.Interfaces;

/// <summary>
/// Service for natural language query processing using AI.
/// </summary>
public interface IAIQueryService
{
    /// <summary>
    /// Process a natural language query and return structured results.
    /// </summary>
    Task<AIQueryResult> QueryAsync(string question, CancellationToken ct = default);

    /// <summary>
    /// Get suggested queries based on the current resource inventory.
    /// </summary>
    Task<IEnumerable<string>> GetSuggestionsAsync(CancellationToken ct = default);
}

/// <summary>
/// Result of an AI natural language query.
/// </summary>
public class AIQueryResult
{
    public string Question { get; set; } = string.Empty;
    public string Answer { get; set; } = string.Empty;
    public string? GeneratedQuery { get; set; }
    public object? Data { get; set; }
    public bool Success { get; set; }
    public string? Error { get; set; }
    public TimeSpan ProcessingTime { get; set; }

    /// <summary>
    /// Where the answer came from: "AzureOpenAI" or "Local".
    /// </summary>
    public string Source { get; set; } = "Local";
}