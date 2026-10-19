using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Infrastructure.Helpers;

namespace CloudScope.Infrastructure.Compliance;

/// <summary>
/// Outcome of evaluating a single policy against a single resource.
/// </summary>
public readonly record struct PolicyEvaluation(ComplianceStatus Status, string? Details)
{
    public static PolicyEvaluation Pass(string? details = null) => new(ComplianceStatus.Compliant, details);
    public static PolicyEvaluation Fail(string details) => new(ComplianceStatus.NonCompliant, details);
    public static PolicyEvaluation NotApplicable() => new(ComplianceStatus.NotApplicable, null);
}

/// <summary>
/// A policy plus its executable rule.
/// </summary>
public sealed class PolicyDefinition
{
    public PolicyDefinition(CompliancePolicy policy, Func<CloudResource, PolicyEvaluation> evaluate)
    {
        Policy = policy;
        Evaluate = evaluate;
    }

    public CompliancePolicy Policy { get; }
    public Func<CloudResource, PolicyEvaluation> Evaluate { get; }
}

/// <summary>
/// Built-in policy-as-code catalog. Each rule is a pure function over a resource's
/// tags/properties, so the same code runs against demo data and live cloud data.
/// </summary>
public static class CompliancePolicyCatalog
{
    public static IReadOnlyList<PolicyDefinition> All { get; } = Build();

    public static IEnumerable<PolicyDefinition> ForFramework(ComplianceFramework framework) =>
        All.Where(p => p.Policy.Framework == framework);

    private static List<PolicyDefinition> Build() => new()
    {
        // ── CIS ──────────────────────────────────────────────────────────
        Policy("CIS-AZ-2.1", "Ensure storage accounts are not publicly accessible",
            "Storage accounts must disable anonymous blob access unless explicitly approved.",
            ComplianceFramework.CIS, "Storage", "High", new[] { ResourceType.StorageAccount },
            "Set allowBlobPublicAccess to false or enable the public access block.",
            r =>
            {
                var azureSetting = ResourceProperties.GetBool(r, "allowBlobPublicAccess");
                var awsSetting = ResourceProperties.GetBool(r, "publicAccessBlock");

                if (azureSetting == true) return PolicyEvaluation.Fail("Anonymous blob access is enabled.");
                if (azureSetting == false) return PolicyEvaluation.Pass("Anonymous blob access is disabled.");
                if (awsSetting == true) return PolicyEvaluation.Pass("S3 public access block is enabled.");
                if (awsSetting == false) return PolicyEvaluation.Fail("S3 public access block is disabled.");

                return PolicyEvaluation.NotApplicable();
            }),

        Policy("CIS-AZ-2.2", "Ensure storage accounts enforce TLS 1.2",
            "Storage endpoints must reject TLS 1.0/1.1 clients.",
            ComplianceFramework.CIS, "Storage", "Medium", new[] { ResourceType.StorageAccount },
            "Set minimumTlsVersion to TLS1_2 on the storage account.",
            r =>
            {
                var tls = ResourceProperties.GetString(r, "minTlsVersion");
                if (string.IsNullOrWhiteSpace(tls)) return PolicyEvaluation.NotApplicable();

                return tls.Replace("_", ".").ToLowerInvariant() is "tls1.2" or "tls1.3"
                    ? PolicyEvaluation.Pass($"Minimum TLS version is {tls}.")
                    : PolicyEvaluation.Fail($"Minimum TLS version is {tls}; TLS 1.2 is required.");
            }),

        Policy("CIS-AZ-3.1", "Ensure SQL auditing is enabled",
            "Azure SQL databases must write audit events to a destination.",
            ComplianceFramework.CIS, "Database", "High", new[] { ResourceType.SqlDatabase },
            "Enable auditing and send logs to Log Analytics or a storage account.",
            r =>
            {
                var auditing = ResourceProperties.GetBool(r, "auditingEnabled");
                if (auditing is null) return PolicyEvaluation.NotApplicable();

                return auditing.Value
                    ? PolicyEvaluation.Pass("Auditing is enabled.")
                    : PolicyEvaluation.Fail("Auditing is disabled.");
            }),

        Policy("CIS-AZ-8.1", "Ensure Key Vault purge protection is enabled",
            "Key Vaults must protect deleted secrets from permanent destruction.",
            ComplianceFramework.CIS, "Identity & Access", "High", new[] { ResourceType.KeyVault },
            "Enable purge protection on the vault.",
            r =>
            {
                var purge = ResourceProperties.GetBool(r, "purgeProtection");
                var rotation = ResourceProperties.GetBool(r, "rotationEnabled");

                if (purge == true || rotation == true)
                    return PolicyEvaluation.Pass(purge == true ? "Purge protection is enabled." : "Automatic key rotation is enabled.");
                if (purge == false)
                    return PolicyEvaluation.Fail("Purge protection is disabled.");

                return PolicyEvaluation.NotApplicable();
            }),

        Policy("CIS-AWS-2.1.1", "Ensure S3 buckets have default encryption",
            "All S3 buckets must encrypt objects at rest.",
            ComplianceFramework.CIS, "Storage", "High", new[] { ResourceType.StorageAccount },
            "Enable default encryption (SSE-S3 or SSE-KMS).",
            r =>
            {
                var encryption = ResourceProperties.GetString(r, "encryption");
                if (string.IsNullOrWhiteSpace(encryption)) return PolicyEvaluation.NotApplicable();

                return encryption.Equals("None", StringComparison.OrdinalIgnoreCase)
                    ? PolicyEvaluation.Fail("Default encryption is disabled.")
                    : PolicyEvaluation.Pass($"Default encryption is {encryption}.");
            }),

        Policy("CIS-AWS-2.1.2", "Ensure S3 bucket versioning is enabled",
            "Versioning protects objects from accidental deletion.",
            ComplianceFramework.CIS, "Storage", "Medium", new[] { ResourceType.StorageAccount },
            "Enable versioning on the bucket.",
            r =>
            {
                var versioning = ResourceProperties.GetBool(r, "versioning");
                if (versioning is null) return PolicyEvaluation.NotApplicable();

                return versioning.Value
                    ? PolicyEvaluation.Pass("Versioning is enabled.")
                    : PolicyEvaluation.Fail("Versioning is disabled.");
            }),

        Policy("CIS-AWS-5.2", "Ensure no security group allows 22/3389 from the Internet",
            "Administrative ports must never be reachable from 0.0.0.0/0.",
            ComplianceFramework.CIS, "Network Security", "Critical",
            new[] { ResourceType.NetworkSecurityGroup, ResourceType.SecurityGroup },
            "Restrict administrative access to a bastion host or VPN range.",
            r =>
            {
                var source = ResourceProperties.GetString(r, "source");
                if (string.IsNullOrWhiteSpace(source)) return PolicyEvaluation.NotApplicable();

                var isPublic = source.Contains("internet", StringComparison.OrdinalIgnoreCase) ||
                               source.Contains("0.0.0.0/0", StringComparison.OrdinalIgnoreCase);

                if (!isPublic) return PolicyEvaluation.Pass($"Ingress is restricted to {source}.");

                var exposesAdminPort =
                    ResourceProperties.ListContains(r, "openPorts", "22") ||
                    ResourceProperties.ListContains(r, "openPorts", "3389");

                return exposesAdminPort
                    ? PolicyEvaluation.Fail($"Ports {ResourceProperties.GetString(r, "openPorts")} are open to {source}.")
                    : PolicyEvaluation.Pass("Only public web ports are exposed.");
            }),

        Policy("CIS-AZ-7.1", "Ensure virtual machine disks are encrypted",
            "OS and data disks must be encrypted at rest.",
            ComplianceFramework.CIS, "Compute", "High", new[] { ResourceType.VirtualMachine },
            "Enable Azure Disk Encryption or use platform-managed keys with encryption at host.",
            r =>
            {
                var azure = ResourceProperties.GetBool(r, "diskEncryption");
                var aws = ResourceProperties.GetBool(r, "ebsEncrypted");

                if (azure == true || aws == true) return PolicyEvaluation.Pass("Disks are encrypted.");
                if (azure == false) return PolicyEvaluation.Fail("Disk encryption is disabled.");
                if (aws == false) return PolicyEvaluation.Fail("EBS encryption is disabled.");

                return PolicyEvaluation.NotApplicable();
            }),

        // ── SOC 2 ────────────────────────────────────────────────────────
        Policy("SOC2-CC6.1", "Ensure network segmentation on every subnet",
            "Subnets must be protected by a network security group or be private.",
            ComplianceFramework.SOC2, "Network Security", "High", new[] { ResourceType.Subnet },
            "Attach an NSG to the subnet and restrict public ingress.",
            r =>
            {
                var nsg = ResourceProperties.GetString(r, "nsg");
                var isPublic = ResourceProperties.GetBool(r, "public");

                if (!string.IsNullOrWhiteSpace(nsg)) return PolicyEvaluation.Pass($"Protected by {nsg}.");
                if (isPublic == false) return PolicyEvaluation.Pass("Subnet is private.");
                if (isPublic == true) return PolicyEvaluation.Fail("Public subnet has no network security group.");

                return PolicyEvaluation.NotApplicable();
            }),

        Policy("SOC2-CC6.6", "Ensure web apps enforce HTTPS",
            "App Services and Functions must redirect HTTP traffic to HTTPS.",
            ComplianceFramework.SOC2, "Network Security", "High",
            new[] { ResourceType.AppService, ResourceType.Function },
            "Set httpsOnly to true on the site.",
            r =>
            {
                var httpsOnly = ResourceProperties.GetBool(r, "httpsOnly");
                if (httpsOnly is null) return PolicyEvaluation.NotApplicable();

                return httpsOnly.Value
                    ? PolicyEvaluation.Pass("HTTPS-only is enforced.")
                    : PolicyEvaluation.Fail("HTTP traffic is allowed.");
            }),

        Policy("SOC2-CC7.1", "Ensure detailed monitoring is enabled",
            "Compute instances must emit 1-minute metrics for incident response.",
            ComplianceFramework.SOC2, "Monitoring", "Medium", new[] { ResourceType.VirtualMachine },
            "Enable detailed monitoring (AWS) or the Azure Monitor agent.",
            r =>
            {
                var detailed = ResourceProperties.GetBool(r, "detailedMonitoring");
                if (detailed is null) return PolicyEvaluation.NotApplicable();

                return detailed.Value
                    ? PolicyEvaluation.Pass("Detailed monitoring is enabled.")
                    : PolicyEvaluation.Fail("Detailed monitoring is disabled.");
            }),

        Policy("SOC2-CC7.2", "Ensure database backups retain at least 7 days",
            "Backups must be retained long enough to recover from incidents.",
            ComplianceFramework.SOC2, "Resilience", "High",
            new[] { ResourceType.SqlDatabase, ResourceType.CosmosDbAccount, ResourceType.DynamoDbTable },
            "Raise the backup retention period to at least 7 days.",
            r =>
            {
                var retention = ResourceProperties.GetDouble(r, "backupRetentionDays");
                if (retention is null) return PolicyEvaluation.NotApplicable();

                return retention.Value >= 7
                    ? PolicyEvaluation.Pass($"Retention is {retention:0} days.")
                    : PolicyEvaluation.Fail($"Retention is only {retention:0} days.");
            }),

        // ── HIPAA ────────────────────────────────────────────────────────
        Policy("HIPAA-164.312(a)(2)(iv)", "Ensure data stores encrypt data at rest",
            "All stores that may contain PHI must be encrypted at rest.",
            ComplianceFramework.HIPAA, "Encryption", "Critical",
            new[] { ResourceType.StorageAccount, ResourceType.SqlDatabase, ResourceType.CosmosDbAccount,
                    ResourceType.DynamoDbTable, ResourceType.RedisCache },
            "Enable encryption at rest with a customer-managed key where required.",
            r =>
            {
                var explicitSetting =
                    ResourceProperties.GetBool(r, "encryptionAtRest") ??
                    ResourceProperties.GetBool(r, "storageEncrypted") ??
                    ResourceProperties.GetBool(r, "atRestEncryption");

                if (explicitSetting == true) return PolicyEvaluation.Pass("Encryption at rest is enabled.");
                if (explicitSetting == false) return PolicyEvaluation.Fail("Encryption at rest is disabled.");

                var encryptionValue = ResourceProperties.GetString(r, "encryption");
                if (!string.IsNullOrWhiteSpace(encryptionValue))
                {
                    return encryptionValue.Equals("None", StringComparison.OrdinalIgnoreCase)
                        ? PolicyEvaluation.Fail("Encryption at rest is disabled.")
                        : PolicyEvaluation.Pass($"Encryption at rest is {encryptionValue}.");
                }

                var tde = ResourceProperties.GetBool(r, "tde");
                if (tde.HasValue)
                {
                    return tde.Value
                        ? PolicyEvaluation.Pass("Transparent data encryption is enabled.")
                        : PolicyEvaluation.Fail("Transparent data encryption is disabled.");
                }

                return PolicyEvaluation.NotApplicable();
            }),

        Policy("HIPAA-164.312(e)(1)", "Ensure transmission security",
            "Data stores and web endpoints must require encrypted transport.",
            ComplianceFramework.HIPAA, "Encryption", "High",
            new[] { ResourceType.StorageAccount, ResourceType.RedisCache, ResourceType.SqlDatabase },
            "Disable non-TLS ports and enforce a minimum of TLS 1.2.",
            r =>
            {
                var nonSsl = ResourceProperties.GetBool(r, "nonSslPort");
                var transit = ResourceProperties.GetBool(r, "transitEncryption");
                var httpsOnly = ResourceProperties.GetBool(r, "httpsOnly");
                var tls = ResourceProperties.GetString(r, "minTlsVersion");

                if (nonSsl == true) return PolicyEvaluation.Fail("The non-TLS Redis port is enabled.");
                if (transit == false) return PolicyEvaluation.Fail("In-transit encryption is disabled.");
                if (httpsOnly == false) return PolicyEvaluation.Fail("HTTPS is not enforced.");
                if (!string.IsNullOrWhiteSpace(tls) &&
                    tls.Replace("_", ".").ToLowerInvariant() is "tls1.0" or "tls1.1")
                {
                    return PolicyEvaluation.Fail($"Minimum TLS version is {tls}.");
                }

                if (nonSsl == false || transit == true || httpsOnly == true ||
                    !string.IsNullOrWhiteSpace(tls))
                {
                    return PolicyEvaluation.Pass("Encrypted transport is enforced.");
                }

                return PolicyEvaluation.NotApplicable();
            }),

        // ── GDPR ─────────────────────────────────────────────────────────
        Policy("GDPR-32", "Ensure data stores disable public network access",
            "Personal data stores must not be reachable from the public internet.",
            ComplianceFramework.GDPR, "Network Security", "High",
            new[] { ResourceType.CosmosDbAccount, ResourceType.SqlDatabase, ResourceType.KeyVault },
            "Use private endpoints and set publicNetworkAccess to Disabled.",
            r =>
            {
                var publicAccess = ResourceProperties.GetString(r, "publicNetworkAccess");
                if (string.IsNullOrWhiteSpace(publicAccess)) return PolicyEvaluation.NotApplicable();

                return publicAccess.Equals("Enabled", StringComparison.OrdinalIgnoreCase)
                    ? PolicyEvaluation.Fail("Public network access is enabled.")
                    : PolicyEvaluation.Pass("Public network access is disabled.");
            }),

        Policy("GDPR-5.1", "Ensure resources carry data inventory tags",
            "Every resource must have an owner and environment tag for records of processing.",
            ComplianceFramework.GDPR, "Governance", "Medium",
            Array.Empty<ResourceType>(),
            "Add owner and environment tags to the resource.",
            r =>
            {
                var missing = new List<string>();
                if (!r.Tags.ContainsKey("owner")) missing.Add("owner");
                if (!r.Tags.ContainsKey("environment")) missing.Add("environment");

                return missing.Count == 0
                    ? PolicyEvaluation.Pass("Owner and environment tags are present.")
                    : PolicyEvaluation.Fail($"Missing tags: {string.Join(", ", missing)}.");
            })
    };

    private static PolicyDefinition Policy(
        string id,
        string name,
        string description,
        ComplianceFramework framework,
        string category,
        string severity,
        ResourceType[] applicableTypes,
        string remediation,
        Func<CloudResource, PolicyEvaluation> evaluate) =>
        new(new CompliancePolicy
        {
            Id = id,
            Name = name,
            Description = description,
            Framework = framework,
            Category = category,
            Severity = severity,
            ApplicableResourceTypes = applicableTypes,
            RuleExpression = "builtin",
            Remediation = remediation,
            Enabled = true
        }, evaluate);
}
