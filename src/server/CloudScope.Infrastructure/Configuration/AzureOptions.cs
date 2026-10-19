namespace CloudScope.Infrastructure.Configuration;

/// <summary>
/// Configuration options for Azure services.
/// </summary>
public class AzureOptions
{
    public const string SectionName = "Azure";

    public string TenantId { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public string SubscriptionId { get; set; } = string.Empty;
    public string[] ResourceGraphScopes { get; set; } = Array.Empty<string>();
}

/// <summary>
/// Configuration options for Azure Cosmos DB.
/// </summary>
public class CosmosDbOptions
{
    public const string SectionName = "CosmosDb";

    public string Endpoint { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public string DatabaseName { get; set; } = "CloudScope";
    public string ResourcesContainer { get; set; } = "Resources";
    public string GraphContainer { get; set; } = "Graph";

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(Endpoint) && !string.IsNullOrWhiteSpace(Key);
}

/// <summary>
/// Configuration options for AWS services.
/// </summary>
public class AwsOptions
{
    public const string SectionName = "AWS";

    public string AccessKeyId { get; set; } = string.Empty;
    public string SecretAccessKey { get; set; } = string.Empty;
    public string Region { get; set; } = "us-east-1";

    /// <summary>
    /// Optional 12-digit AWS account id used to build ARNs for relationship edges.
    /// </summary>
    public string AccountId { get; set; } = string.Empty;

    /// <summary>
    /// Optional endpoint override (LocalStack / VPC endpoints).
    /// </summary>
    public string ServiceUrl { get; set; } = string.Empty;
}

/// <summary>
/// Configuration options for Azure OpenAI.
/// </summary>
public class AzureOpenAIOptions
{
    public const string SectionName = "AzureOpenAI";

    public string Endpoint { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string DeploymentName { get; set; } = "gpt-4";
    public int MaxTokens { get; set; } = 2000;
    public double Temperature { get; set; } = 0.1;
}

/// <summary>
/// Configuration options for Azure SignalR Service.
/// </summary>
public class SignalROptions
{
    public const string SectionName = "SignalR";

    public string ConnectionString { get; set; } = string.Empty;
}