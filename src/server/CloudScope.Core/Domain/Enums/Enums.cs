namespace CloudScope.Core.Domain.Enums;

/// <summary>
/// Represents the cloud provider a resource belongs to.
/// </summary>
public enum CloudProvider
{
    Azure,
    AWS
}

/// <summary>
/// Current health/status of a cloud resource.
/// </summary>
public enum ResourceStatus
{
    Unknown,
    Healthy,
    Warning,
    Critical,
    Stopped,
    Provisioning,
    Deprovisioning
}

/// <summary>
/// The category/type of a cloud resource.
/// </summary>
public enum ResourceType
{
    // Compute
    VirtualMachine,
    AppService,
    Function,
    ContainerInstance,
    KubernetesCluster,

    // Networking
    VirtualNetwork,
    Subnet,
    NetworkInterface,
    PublicIpAddress,
    LoadBalancer,
    ApplicationGateway,
    DnsZone,
    Firewall,
    NetworkSecurityGroup,
    SecurityGroup,
    VpnGateway,

    // Storage
    StorageAccount,
    BlobContainer,
    FileShare,
    Disk,

    // Database
    SqlDatabase,
    CosmosDbAccount,
    RedisCache,
    MySql,
    PostgreSql,
    DynamoDbTable,

    // Identity & Security
    ManagedIdentity,
    KeyVault,
    RoleAssignment,

    // Messaging
    ServiceBus,
    EventHub,
    Queue,

    // Monitoring
    LogAnalytics,
    ApplicationInsights,

    // Other
    ResourceGroup,
    Subscription,
    Other
}

/// <summary>
/// The type of relationship between two resources.
/// </summary>
public enum RelationshipType
{
    Contains,
    DependsOn,
    ConnectsTo,
    ManagedBy,
    PeeredWith,
    LoadBalances,
    Monitors,
    SecuredBy,
    StoredIn,
    DeployedOn,
    RoutesTo,
    Other
}

/// <summary>
/// Compliance status for a resource or policy.
/// </summary>
public enum ComplianceStatus
{
    Compliant,
    NonCompliant,
    NotApplicable,
    Unknown
}

/// <summary>
/// Risk level for blast radius analysis.
/// </summary>
public enum RiskLevel
{
    Low,
    Medium,
    High,
    Critical
}

/// <summary>
/// Supported compliance frameworks.
/// </summary>
public enum ComplianceFramework
{
    CIS,
    SOC2,
    HIPAA,
    GDPR,
    NIST,
    PCI_DSS,
    ISO27001
}