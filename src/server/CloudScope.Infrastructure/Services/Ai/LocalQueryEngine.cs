using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using CloudScope.Core.Domain.Enums;
using CloudScope.Core.Domain.Models;
using CloudScope.Core.Interfaces;
using CloudScope.Infrastructure.Helpers;

namespace CloudScope.Infrastructure.Services.Ai;

/// <summary>
/// Deterministic natural-language engine used when Azure OpenAI is not configured.
/// It maps questions to the same resource-graph operations the LLM is instructed to
/// use, so the AI Query experience works offline and in demos.
/// </summary>
public static class LocalQueryEngine
{
    private static readonly Regex CostThresholdRegex = new(
        @"(?:more than|over|above|greater than|exceeds?|>)\s*\$?\s*(?<amount>\d+(?:\.\d+)?)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex CostUnderRegex = new(
        @"(?:under|below|less than|cheaper than|<)\s*\$?\s*(?<amount>\d+(?:\.\d+)?)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex CpuUnderRegex = new(
        @"(?:cpu|utilisation|utilization)[^\d]{0,30}(?:under|below|less than|<)\s*(?<pct>\d+)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex CpuUnderAltRegex = new(
        @"(?:under|below|less than)\s*(?<pct>\d+)\s*%?\s*(?:cpu|utilisation|utilization)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex TopNRegex = new(
        @"top\s*(?<count>\d+)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Dictionary<string, ResourceType[]> TypeKeywords = new(StringComparer.OrdinalIgnoreCase)
    {
        ["virtual machine"] = new[] { ResourceType.VirtualMachine },
        ["virtual machines"] = new[] { ResourceType.VirtualMachine },
        ["vm"] = new[] { ResourceType.VirtualMachine },
        ["vms"] = new[] { ResourceType.VirtualMachine },
        ["ec2"] = new[] { ResourceType.VirtualMachine },
        ["kubernetes"] = new[] { ResourceType.KubernetesCluster },
        ["aks"] = new[] { ResourceType.KubernetesCluster },
        ["eks"] = new[] { ResourceType.KubernetesCluster },
        ["cluster"] = new[] { ResourceType.KubernetesCluster },
        ["database"] = new[] { ResourceType.SqlDatabase, ResourceType.CosmosDbAccount, ResourceType.DynamoDbTable },
        ["databases"] = new[] { ResourceType.SqlDatabase, ResourceType.CosmosDbAccount, ResourceType.DynamoDbTable },
        ["sql"] = new[] { ResourceType.SqlDatabase },
        ["cosmos"] = new[] { ResourceType.CosmosDbAccount },
        ["dynamodb"] = new[] { ResourceType.DynamoDbTable, ResourceType.Other },
        ["storage"] = new[] { ResourceType.StorageAccount },
        ["bucket"] = new[] { ResourceType.StorageAccount },
        ["s3"] = new[] { ResourceType.StorageAccount },
        ["function"] = new[] { ResourceType.Function },
        ["functions"] = new[] { ResourceType.Function },
        ["lambda"] = new[] { ResourceType.Function },
        ["app service"] = new[] { ResourceType.AppService },
        ["web app"] = new[] { ResourceType.AppService },
        ["redis"] = new[] { ResourceType.RedisCache },
        ["cache"] = new[] { ResourceType.RedisCache },
        ["load balancer"] = new[] { ResourceType.LoadBalancer },
        ["public ip"] = new[] { ResourceType.PublicIpAddress },
        ["public ip address"] = new[] { ResourceType.PublicIpAddress },
        ["ip address"] = new[] { ResourceType.PublicIpAddress },
        ["subnet"] = new[] { ResourceType.Subnet },
        ["subnets"] = new[] { ResourceType.Subnet },
        ["virtual network"] = new[] { ResourceType.VirtualNetwork },
        ["vnet"] = new[] { ResourceType.VirtualNetwork },
        ["vpc"] = new[] { ResourceType.VirtualNetwork },
        ["network"] = new[] { ResourceType.VirtualNetwork, ResourceType.Subnet },
        ["key vault"] = new[] { ResourceType.KeyVault },
        ["keyvault"] = new[] { ResourceType.KeyVault },
        ["kms"] = new[] { ResourceType.KeyVault },
        ["disk"] = new[] { ResourceType.Disk },
        ["disks"] = new[] { ResourceType.Disk },
        ["queue"] = new[] { ResourceType.Queue },
        ["sqs"] = new[] { ResourceType.Queue },
        ["service bus"] = new[] { ResourceType.ServiceBus },
        ["event hub"] = new[] { ResourceType.EventHub },
        ["firewall"] = new[] { ResourceType.Firewall, ResourceType.NetworkSecurityGroup, ResourceType.SecurityGroup },
        ["security group"] = new[] { ResourceType.SecurityGroup, ResourceType.NetworkSecurityGroup },
        ["nsg"] = new[] { ResourceType.NetworkSecurityGroup }
    };

    public static async Task<AIQueryResult> AnswerAsync(
        string question,
        IReadOnlyList<CloudResource> resources,
        IBlastRadiusService blastRadiusService,
        IComplianceService complianceService,
        ICostService costService,
        CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var lower = question.ToLowerInvariant();

        try
        {
            // ── 1. Impact / blast radius ────────────────────────────────
            if (ContainsAny(lower, "blast radius", "what breaks", "what would break", "affected", "goes down", "fails", "failure"))
            {
                var target = MatchResource(question, resources);
                if (target is not null)
                {
                    var radius = await blastRadiusService.AnalyzeAsync(target.Id, 5, ct);
                    return Result(
                        question,
                        BuildBlastRadiusAnswer(radius),
                        $"resources | where id == \"{target.Name}\" | blast-radius --depth 5",
                        radius,
                        sw);
                }

                var critical = resources
                    .Where(r => r.ResourceType is ResourceType.VirtualNetwork or ResourceType.SqlDatabase
                        or ResourceType.CosmosDbAccount or ResourceType.KubernetesCluster)
                    .Take(5)
                    .Select(Project)
                    .ToList();

                return Result(
                    question,
                    "I can compute the blast radius for any resource — just include its name " +
                    "(for example \"what breaks if snet-app goes down?\"). " +
                    "The most connected candidates right now are listed below.",
                    "resources | where type in (VirtualNetwork, SqlDatabase, CosmosDbAccount, KubernetesCluster)",
                    critical,
                    sw);
            }

            // ── 2. Compliance ────────────────────────────────────────────
            if (ContainsAny(lower, "compliance", "violation", "violations", "cis", "soc 2", "soc2", "hipaa", "gdpr", "audit"))
            {
                ComplianceFramework? framework = null;
                if (lower.Contains("cis")) framework = ComplianceFramework.CIS;
                else if (lower.Contains("soc")) framework = ComplianceFramework.SOC2;
                else if (lower.Contains("hipaa")) framework = ComplianceFramework.HIPAA;
                else if (lower.Contains("gdpr")) framework = ComplianceFramework.GDPR;

                var scan = (await complianceService.RunScanAsync(framework, ct)).ToList();
                var violations = scan.Where(r => r.Status == ComplianceStatus.NonCompliant).ToList();

                var answer = new StringBuilder();
                answer.Append(violations.Count == 0
                    ? "No compliance violations were found"
                    : $"I found {violations.Count} compliance violation{(violations.Count == 1 ? "" : "s")}");

                answer.Append(framework.HasValue ? $" for {framework}." : " across all frameworks.");

                if (violations.Count > 0)
                {
                    answer.Append(" The most common issues are: ");
                    answer.Append(string.Join("; ", violations
                        .GroupBy(v => v.PolicyName)
                        .OrderByDescending(g => g.Count())
                        .Take(3)
                        .Select(g => $"{g.Key} ({g.Count()})")));
                    answer.Append('.');
                }

                return Result(
                    question,
                    answer.ToString(),
                    $"policies | where framework == \"{framework?.ToString() ?? "ANY"}\" | evaluate(resources)",
                    violations.Take(25).Select(v => new
                    {
                        policy = v.PolicyName,
                        resource = v.ResourceName,
                        status = v.Status.ToString(),
                        details = v.Details
                    }),
                    sw);
            }

            // ── 3. Cost anomalies / forecast / recommendations ───────────
            if (ContainsAny(lower, "anomal", "spike", "unexpected cost", "unusual cost"))
            {
                var anomalies = (await costService.DetectAnomaliesAsync(ct)).ToList();
                return Result(
                    question,
                    anomalies.Count == 0
                        ? "No cost anomalies were detected in the last 30 days. Spending is within normal variance."
                        : $"I detected {anomalies.Count} cost anomal{(anomalies.Count == 1 ? "y" : "ies")}. " +
                          $"The largest is {anomalies[0].ResourceName} at {anomalies[0].DeviationPercentage:+0.0;-0.0}% versus its 30-day average.",
                    "costs | summarize daily by resource | where zscore > 2.5",
                    anomalies,
                    sw);
            }

            if (ContainsAny(lower, "forecast", "predict", "next month", "projected", "projection"))
            {
                var forecast = (await costService.GetForecastAsync(30, ct)).ToList();
                var total = forecast.Sum(f => f.PredictedCost);
                return Result(
                    question,
                    forecast.Count == 0
                        ? "I need a few days of cost history before I can produce a forecast."
                        : $"Based on the last 30 days, I forecast about ${total:0} in spend over the next " +
                          $"{forecast.Count} days (${forecast.Average(f => f.PredictedCost):0.00}/day average).",
                    "costs | extend forecast(30d)",
                    forecast,
                    sw);
            }

            if (ContainsAny(lower, "recommendation", "rightsiz", "right-siz", "save money", "savings", "idle", "waste"))
            {
                var recommendations = (await costService.GetRecommendationsAsync(ct)).ToList();
                var savings = recommendations.Sum(r => r.EstimatedMonthlySavings);

                return Result(
                    question,
                    $"I found {recommendations.Count} optimisation opportunit{(recommendations.Count == 1 ? "y" : "ies")} " +
                    $"worth about ${savings:0}/month in potential savings.",
                    "costs | recommendations() | order by monthlySavings desc",
                    recommendations,
                    sw);
            }

            // ── 4. Unattached / orphaned resources ───────────────────────
            if (ContainsAny(lower, "unattached", "not attached", "orphan", "unused", "idle public"))
            {
                var orphans = resources
                    .Where(r =>
                        (r.ResourceType == ResourceType.PublicIpAddress &&
                         (ResourceProperties.GetString(r, "associated") ?? "none")
                             .Equals("none", StringComparison.OrdinalIgnoreCase)) ||
                        (r.ResourceType == ResourceType.Disk &&
                         ResourceProperties.GetBool(r, "attached") == false))
                    .ToList();

                var cost = orphans.Sum(r => r.EstimatedMonthlyCost);

                return Result(
                    question,
                    orphans.Count == 0
                        ? "Every public IP address and disk in the inventory is attached to a resource."
                        : $"There are {orphans.Count} unattached resource{(orphans.Count == 1 ? "" : "s")} " +
                          $"costing about ${cost:0.00}/month: " +
                          $"{string.Join(", ", orphans.Take(5).Select(o => o.Name))}. " +
                          "They can usually be deleted safely.",
                    "resources | where attached == false | project name, type, cost",
                    orphans.Select(Project),
                    sw);
            }

            // ── 5. IaC drift ─────────────────────────────────────────────
            if (ContainsAny(lower, "iac", "infrastructure as code", "terraform", "bicep", "drift", "unmanaged", "not managed"))
            {
                var unmanaged = resources.Where(r => !r.IsManagedByIaC).ToList();

                return Result(
                    question,
                    unmanaged.Count == 0
                        ? "Every discovered resource is managed by Infrastructure as Code — no drift detected."
                        : $"{unmanaged.Count} of {resources.Count} resources ({unmanaged.Count * 100 / Math.Max(1, resources.Count)}%) " +
                          "are not managed by IaC. These are candidates for drift investigation.",
                    "resources | where isManagedByIaC == false | project name, type, resourceGroup",
                    unmanaged.Select(Project),
                    sw);
            }

            // ── 6. CPU-based right-sizing question ───────────────────────
            var cpuMatch = CpuUnderRegex.Match(question);
            if (!cpuMatch.Success) cpuMatch = CpuUnderAltRegex.Match(question);
            if (cpuMatch.Success || ContainsAny(lower, "low cpu", "underutilised", "underutilized"))
            {
                var threshold = cpuMatch.Success
                    ? double.Parse(cpuMatch.Groups["pct"].Value, CultureInfo.InvariantCulture)
                    : 20d;

                var vms = resources
                    .Where(r => r.ResourceType == ResourceType.VirtualMachine && r.CpuUtilization.HasValue)
                    .Where(r => r.CpuUtilization!.Value < threshold)
                    .OrderBy(r => r.CpuUtilization)
                    .ToList();

                var savings = vms.Sum(r => r.EstimatedMonthlyCost * 0.5m);

                return Result(
                    question,
                    vms.Count == 0
                        ? $"No virtual machines are running below {threshold:0}% CPU."
                        : $"{vms.Count} virtual machine{(vms.Count == 1 ? " is" : "s are")} below {threshold:0}% CPU: " +
                          $"{string.Join(", ", vms.Take(5).Select(v => v.Name))}. " +
                          $"Downsizing them would save roughly ${savings:0}/month.",
                    $"resources | where type == \"VirtualMachine\" and cpuUtilization < {threshold:0} | order by cpuUtilization",
                    vms.Select(Project),
                    sw);
            }

            // ── 7. Cost thresholds ───────────────────────────────────────
            var overMatch = CostThresholdRegex.Match(question);
            if (overMatch.Success)
            {
                var threshold = decimal.Parse(overMatch.Groups["amount"].Value, CultureInfo.InvariantCulture);
                var matches = resources
                    .Where(r => r.EstimatedMonthlyCost > threshold)
                    .OrderByDescending(r => r.EstimatedMonthlyCost)
                    .ToList();

                return Result(
                    question,
                    matches.Count == 0
                        ? $"No resources cost more than ${threshold:0}/month."
                        : $"{matches.Count} resource{(matches.Count == 1 ? "" : "s")} cost more than ${threshold:0}/month, " +
                          $"totalling ${matches.Sum(r => r.EstimatedMonthlyCost):0}/month " +
                          $"({string.Join(", ", matches.Take(5).Select(m => m.Name))}).",
                    $"resources | where estimatedMonthlyCost > {threshold:0} | order by cost desc",
                    matches.Select(Project),
                    sw);
            }

            // ── 8. Resource-group spend ──────────────────────────────────
            if (lower.Contains("resource group") || lower.Contains("resourcegroup"))
            {
                var groups = (await costService.GetCostSummaryAsync(DateTime.UtcNow.AddDays(-30), DateTime.UtcNow, ct))
                    .ByResourceGroup
                    .Take(10)
                    .ToList();

                return Result(
                    question,
                    groups.Count == 0
                        ? "No cost data is available for resource groups yet."
                        : $"The most expensive resource group over the last 30 days is {groups[0].Category} " +
                          $"at ${groups[0].Amount:0.00} ({groups[0].Percentage:0.0}% of spend).",
                    "costs | summarize by resourceGroup | order by cost desc",
                    groups,
                    sw);
            }

            // ── 9. Most expensive resources ──────────────────────────────
            if (ContainsAny(lower, "expensive", "cost", "spend", "spending", "bill"))
            {
                var count = TopNRegex.Match(question) is { Success: true } top
                    ? int.Parse(top.Groups["count"].Value, CultureInfo.InvariantCulture)
                    : 10;

                var topResources = resources
                    .OrderByDescending(r => r.EstimatedMonthlyCost)
                    .Take(Math.Clamp(count, 1, 50))
                    .ToList();

                return Result(
                    question,
                    $"The most expensive resource is {topResources[0].Name} at " +
                    $"${topResources[0].EstimatedMonthlyCost:0.00}/month. " +
                    $"The top {topResources.Count} resources account for " +
                    $"${topResources.Sum(r => r.EstimatedMonthlyCost):0.00}/month.",
                    $"resources | order by estimatedMonthlyCost desc | take {topResources.Count}",
                    topResources.Select(Project),
                    sw);
            }

            // ── 10. Inventory summary / type listing ─────────────────────
            var typeFilter = ResolveTypeFilter(lower);
            var providerFilter = ResolveProvider(lower);

            if (typeFilter.Count > 0)
            {
                var matches = resources
                    .Where(r => typeFilter.Contains(r.ResourceType))
                    .Where(r => !providerFilter.HasValue || r.Provider == providerFilter.Value)
                    .OrderBy(r => r.Name)
                    .ToList();

                return Result(
                    question,
                    matches.Count == 0
                        ? "No matching resources were found."
                        : $"Found {matches.Count} {string.Join("/", typeFilter)} resource{(matches.Count == 1 ? "" : "s")}" +
                          (providerFilter.HasValue ? $" in {providerFilter}." : "."),
                    $"resources | where type in ({string.Join(", ", typeFilter)})" +
                    (providerFilter.HasValue ? $" and provider == \"{providerFilter}\"" : string.Empty),
                    matches.Select(Project),
                    sw);
            }

            if (ContainsAny(lower, "summary", "overview", "how many", "inventory", "everything", "estate"))
            {
                return Result(question, BuildOverview(resources),
                    "resources | summarize count() by provider, type, region", Overview(resources), sw);
            }

            // ── 11. Keyword fallback ────────────────────────────────────
            var tokens = Regex.Split(lower, @"[^a-z0-9\-]+")
                .Where(t => t.Length >= 3)
                .Where(t => !StopWords.Contains(t))
                .Distinct()
                .ToList();

            var keywordMatches = resources
                .Select(r => new { Resource = r, Score = tokens.Count(t => MatchesToken(r, t)) })
                .Where(x => x.Score > 0)
                .OrderByDescending(x => x.Score)
                .ThenByDescending(x => x.Resource.EstimatedMonthlyCost)
                .Take(25)
                .Select(x => x.Resource)
                .ToList();

            if (keywordMatches.Count > 0)
            {
                return Result(
                    question,
                    $"I found {keywordMatches.Count} resource{(keywordMatches.Count == 1 ? "" : "s")} matching your question.",
                    $"resources | search \"{string.Join(" ", tokens)}\"",
                    keywordMatches.Select(Project),
                    sw);
            }

            return Result(question, BuildOverview(resources),
                "resources | summarize count() by provider", Overview(resources), sw);
        }
        catch (Exception ex)
        {
            sw.Stop();
            return new AIQueryResult
            {
                Question = question,
                Success = false,
                Error = ex.Message,
                Answer = "I couldn't complete that query. Try rephrasing it or ask for an inventory overview.",
                ProcessingTime = sw.Elapsed,
                Source = "Local"
            };
        }
    }

    public static IEnumerable<string> Suggestions(IEnumerable<CloudResource> resources)
    {
        var list = resources.ToList();
        var suggestions = new List<string>();

        var underutilised = list
            .Where(r => r.ResourceType == ResourceType.VirtualMachine && r.CpuUtilization is < 20)
            .OrderBy(r => r.CpuUtilization)
            .FirstOrDefault();

        if (underutilised is not null)
            suggestions.Add($"Show me VMs running under 20% CPU");

        var expensive = list.OrderByDescending(r => r.EstimatedMonthlyCost).FirstOrDefault();
        if (expensive is not null)
            suggestions.Add($"What are my top 5 most expensive resources?");

        if (list.Any(r => !r.IsManagedByIaC))
            suggestions.Add("Which resources are not managed by Infrastructure as Code?");

        suggestions.Add("Show me all resources costing more than $300/month");
        suggestions.Add("What breaks if snet-app goes down?");
        suggestions.Add("Are there any compliance violations for CIS?");
        suggestions.Add("Show me cost anomalies from the last 30 days");
        suggestions.Add("What would it cost to run this estate next month?");

        return suggestions.Distinct().Take(8);
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    private static bool ContainsAny(string text, params string[] terms) =>
        terms.Any(term => text.Contains(term, StringComparison.OrdinalIgnoreCase));

    private static AIQueryResult Result(
        string question,
        string answer,
        string generatedQuery,
        object? data,
        Stopwatch sw)
    {
        sw.Stop();
        return new AIQueryResult
        {
            Question = question,
            Answer = answer,
            GeneratedQuery = generatedQuery,
            Data = data,
            Success = true,
            ProcessingTime = sw.Elapsed,
            Source = "Local"
        };
    }

    private static string BuildBlastRadiusAnswer(BlastRadiusResult radius)
    {
        var builder = new StringBuilder();
        builder.Append($"If '{radius.ResourceName}' fails, {radius.AffectedResourceCount} downstream ");

        if (radius.AffectedResourceCount == 0)
        {
            builder.Append("resources are affected. It has no dependents, so it is safe to change.");
        }
        else
        {
            builder.Append($"resource{(radius.AffectedResourceCount == 1 ? " is" : "s are")} affected ");
            builder.Append($"(risk: {radius.RiskLevel}, ~${radius.AffectedMonthlyCost:0.00}/month of impacted spend).");
            builder.Append($" {radius.Summary}");
        }

        return builder.ToString();
    }

    private static string BuildOverview(IReadOnlyCollection<CloudResource> resources)
    {
        if (resources.Count == 0)
            return "The inventory is empty. Connect a cloud account and run discovery to get started.";

        var azure = resources.Count(r => r.Provider == CloudProvider.Azure);
        var aws = resources.Count(r => r.Provider == CloudProvider.AWS);
        var cost = resources.Sum(r => r.EstimatedMonthlyCost);
        var unhealthy = resources.Count(r => r.Status is ResourceStatus.Warning or ResourceStatus.Critical);

        return $"Your estate contains {resources.Count} resources across {resources.Select(r => r.Region).Distinct().Count()} regions — " +
               $"{azure} on Azure and {aws} on AWS. Estimated spend is ${cost:0}/month, and " +
               $"{unhealthy} resource{(unhealthy == 1 ? " needs" : "s need")} attention.";
    }

    private static IEnumerable<object> Overview(IReadOnlyCollection<CloudResource> resources) =>
        resources.GroupBy(r => new { r.Provider, r.ResourceType })
            .OrderByDescending(g => g.Sum(r => r.EstimatedMonthlyCost))
            .Select(g => (object)new
            {
                provider = g.Key.Provider.ToString(),
                type = g.Key.ResourceType.ToString(),
                count = g.Count(),
                monthlyCost = Math.Round(g.Sum(r => r.EstimatedMonthlyCost), 2)
            });

    private static object Project(CloudResource resource) => new
    {
        id = resource.Id,
        name = resource.Name,
        type = resource.ResourceType.ToString(),
        provider = resource.Provider.ToString(),
        region = resource.Region,
        resourceGroup = resource.ResourceGroup,
        status = resource.Status.ToString(),
        monthlyCost = resource.EstimatedMonthlyCost,
        cpuUtilization = resource.CpuUtilization,
        managedByIaC = resource.IsManagedByIaC
    };

    private static List<ResourceType> ResolveTypeFilter(string question)
    {
        var types = new List<ResourceType>();

        // Longest keyword first so "public ip address" wins over "ip address".
        foreach (var keyword in TypeKeywords.Keys.OrderByDescending(k => k.Length))
        {
            if (Regex.IsMatch(question, $@"\b{Regex.Escape(keyword)}(?:s|es)?\b", RegexOptions.IgnoreCase))
            {
                types.AddRange(TypeKeywords[keyword]);
            }
        }

        return types.Distinct().ToList();
    }

    private static CloudProvider? ResolveProvider(string question)
    {
        if (Regex.IsMatch(question, @"\bazure\b", RegexOptions.IgnoreCase)) return CloudProvider.Azure;
        if (Regex.IsMatch(question, @"\baws\b|\bamazon\b", RegexOptions.IgnoreCase)) return CloudProvider.AWS;
        return null;
    }

    private static bool MatchesToken(CloudResource resource, string token) =>
        resource.Name.Contains(token, StringComparison.OrdinalIgnoreCase) ||
        resource.ResourceType.ToString().Contains(token, StringComparison.OrdinalIgnoreCase) ||
        resource.Region.Contains(token, StringComparison.OrdinalIgnoreCase) ||
        resource.ResourceGroup.Contains(token, StringComparison.OrdinalIgnoreCase) ||
        resource.Tags.Values.Any(v => v.Contains(token, StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// Finds the resource whose name is mentioned in the question (longest match wins).
    /// </summary>
    private static CloudResource? MatchResource(string question, IEnumerable<CloudResource> resources)
    {
        var normalisedQuestion = Normalise(question);

        return resources
            .Select(r => new { Resource = r, Key = Normalise(r.Name) })
            .Where(x => x.Key.Length >= 3 && normalisedQuestion.Contains(x.Key, StringComparison.Ordinal))
            .OrderByDescending(x => x.Key.Length)
            .Select(x => x.Resource)
            .FirstOrDefault();
    }

    private static string Normalise(string value)
    {
        var builder = new StringBuilder(value.Length);

        foreach (var ch in value.ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(ch)) builder.Append(ch);
        }

        return builder.ToString();
    }

    private static readonly HashSet<string> StopWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "the", "and", "for", "with", "show", "list", "all", "any", "are", "what", "which",
        "who", "how", "can", "you", "give", "tell", "about", "from", "that", "this", "have",
        "has", "was", "were", "will", "would", "could", "should", "there", "their", "them",
        "me", "my", "our", "your", "please", "get", "find", "much", "many", "more", "than"
    };
}
