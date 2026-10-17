namespace CloudScope.Core.Exceptions;

/// <summary>
/// Base exception for CloudScope domain errors.
/// </summary>
public class CloudScopeException : Exception
{
    public CloudScopeException(string message) : base(message) { }
    public CloudScopeException(string message, Exception innerException) : base(message, innerException) { }
}

/// <summary>
/// Thrown when a requested resource is not found.
/// </summary>
public class ResourceNotFoundException : CloudScopeException
{
    public string ResourceId { get; }
    public ResourceNotFoundException(string resourceId)
        : base($"Resource not found: { resourceId}")
    {
        ResourceId = resourceId;
    }
}

/// <summary>
/// Thrown when a cloud provider API call fails.
/// </summary>
public class CloudProviderException : CloudScopeException
{
    public string Provider { get; }
    public CloudProviderException(string provider, string message)
        : base($"[{ provider}] { message}")
    {
        Provider = provider;
    }
    public CloudProviderException(string provider, string message, Exception inner)
        : base($"[{ provider}] { message}", inner)
    {
        Provider = provider;
    }
}

/// <summary>
/// Thrown when AI query processing fails.
/// </summary>
public class AIQueryException : CloudScopeException
{
    public AIQueryException(string message) : base(message) { }
    public AIQueryException(string message, Exception inner) : base(message, inner) { }
}