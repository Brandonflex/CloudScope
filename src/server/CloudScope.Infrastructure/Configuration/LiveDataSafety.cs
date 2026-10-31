namespace CloudScope.Infrastructure.Configuration;

/// <summary>
/// Fail closed for live-data combinations whose isolation or privacy has not
/// yet been implemented. This does not authenticate users or secure a backend.
/// </summary>
public static class LiveDataSafety
{
    public static void Validate(bool useCosmos, AzureOptions azure, AwsOptions aws, AzureOpenAIOptions ai)
    {
        var providerConfigured = !string.IsNullOrWhiteSpace(azure.SubscriptionId) ||
            (!string.IsNullOrWhiteSpace(aws.AccessKeyId) && !string.IsNullOrWhiteSpace(aws.SecretAccessKey));
        if (!providerConfigured) return;

        if (useCosmos)
            throw new InvalidOperationException("Live discovery with persistent Cosmos storage is disabled until data provenance and isolation are implemented. Use a fresh in-memory store.");

        if (!string.IsNullOrWhiteSpace(ai.Endpoint) || !string.IsNullOrWhiteSpace(ai.ApiKey))
            throw new InvalidOperationException("External AI is disabled with live providers until real-data sharing and access controls are implemented.");
    }
}
