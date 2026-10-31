# CloudScope — API Reference

The API is generated from the controllers in `src/server/CloudScope.Api` and is
documented interactively by Swagger at **`/swagger`** while the service runs.

* **Base URL (development):** `http://localhost:5001`
* **Content type:** `application/json`; enums serialize as strings.
* **Authentication:** in production, requests must pass through an identity-aware
  gateway that injects a private gateway secret. The gateway authenticates and
  authorizes users; see [deployment safeguards](../SECURITY.md#gateway-and-deployment-safeguards).

The **demo API** (`src/client/mock-api/server.mjs`) implements the same surface
on top of the bundled demo estate, which is handy for UI work and for exploring
the product without a cloud account.

---

## Meta

### `GET /api/meta`

Runtime status used by the SPA banner and footer.

```json
{
  "version": "1.0.0",
  "demoMode": true,
  "storageProvider": "InMemory",
  "aiMode": "Local",
  "configuredProviders": [],
  "resourceCount": 54,
  "relationshipCount": 65,
  "lastDiscoveryAt": "2026-10-19T05:30:00Z",
  "serverTimeUtc": "2026-10-19T06:00:00Z"
}
```

### `POST /api/meta/demo`

Reloads the bundled demo estate (idempotent upsert) and returns the counts.

---

## Resources

### `GET /api/resources`

| Query parameter | Type | Description |
|-----------------|------|-------------|
| `pageNumber` | int (1) | 1-based page |
| `pageSize` | int (50) | Clamped to 1–500 |
| `provider` | `Azure` \| `AWS` | Filter by cloud |
| `resourceType` | enum | e.g. `VirtualMachine` |
| `region` | string | Exact region match |
| `resourceGroup` | string | Exact match |
| `search` | string | Case-insensitive match across name, ids, type, group, region, tags |

```json
{
  "items": [
    {
      "id": "az:/subscriptions/…/virtualMachines/vm-app-01",
      "provider": "Azure",
      "nativeId": "/subscriptions/…",
      "name": "vm-app-01",
      "resourceType": "VirtualMachine",
      "nativeResourceType": "Microsoft.Compute/virtualMachines",
      "resourceGroup": "rg-prod-app",
      "region": "eastus",
      "status": "Healthy",
      "tags": { "environment": "prod", "owner": "app-team" },
      "properties": { "vmSize": "Standard_D4s_v5", "diskEncryption": "True" },
      "estimatedMonthlyCost": 342.4,
      "cpuUtilization": 34,
      "memoryUtilization": null,
      "discoveredAt": "2026-09-18T06:00:00Z",
      "lastSyncedAt": "2026-10-19T05:30:00Z",
      "isManagedByIaC": true,
      "complianceStatus": "Unknown",
      "relationships": [ … ]
    }
  ],
  "totalCount": 54,
  "pageNumber": 1,
  "pageSize": 50,
  "totalPages": 2,
  "hasPreviousPage": false,
  "hasNextPage": true
}
```

For IDs containing `/` (including Azure ARM IDs), use query parameters: `GET /api/resources/by-id?id=...`, `GET /api/resources/relationships?id=...`, and `GET /api/resources/blast-radius?id=...&maxDepth=5`. Encode the ID as a query parameter. The legacy path routes remain available for simple IDs.

### `GET /api/resources/{id}`

Returns a single resource or `404 { "message": "Resource '…' not found" }`.
Ids contain slashes (ARM ids); clients must URL-encode them.

### `GET /api/resources/{id}/relationships`

Returns the resource's incident edges.

### `GET /api/resources/blast-radius/{id}?maxDepth=5`

```json
{
  "resourceId": "…snet-app",
  "resourceName": "snet-app",
  "riskLevel": "Medium",
  "affectedResourceCount": 13,
  "directDependents": [
    {
      "resourceId": "…nic-app-01",
      "resourceName": "nic-app-01",
      "resourceType": "NetworkInterface",
      "provider": "Azure",
      "relationshipType": "DependsOn",
      "hopCount": 1,
      "impactRisk": "High"
    }
  ],
  "transitiveDependents": [ … ],
  "affectedByType": { "VirtualMachine": 3, "NetworkInterface": 3 },
  "affectedByRegion": { "eastus": 12, "westeurope": 1 },
  "affectedMonthlyCost": 1820.44,
  "summary": "If snet-app fails, 13 resources across 2 regions would be impacted, costing 1820.44 USD per month."
}
```

Risk levels are derived from the affected count: `>50 Critical`, `>20 High`,
`>5 Medium`, otherwise `Low`. Traversal skips `Contains` and `Monitors` edges.

### `POST /api/resources/discover`

Runs discovery across configured providers (or reloads the demo estate when
none are configured) and returns:

```json
{
  "message": "Resource discovery completed",
  "demoMode": false,
  "resourcesDiscovered": 128,
  "relationshipsDiscovered": 214,
  "durationSeconds": 4.2,
  "providers": [
    { "provider": "Azure", "configured": true, "resources": 96, "error": null },
    { "provider": "AWS", "configured": true, "resources": 32, "error": null }
  ]
}
```

---

## Graph

| Endpoint | Description |
|----------|-------------|
| `GET /api/graph?provider=&resourceType=&region=` | Nodes + edges (edges only between included nodes) |
| `GET /api/graph/subgraph?resourceId=...&depth=2` | Neighbourhood in both directions; supports IDs containing `/` |
| `GET /api/graph/subgraph/{resourceId}?depth=2` | Legacy path route for simple IDs |
| `GET /api/graph/paths?sourceId=&targetId=` | Shortest edge chain |

```json
{
  "nodes": [
    {
      "id": "…",
      "label": "vm-app-01",
      "type": "VirtualMachine",
      "provider": "Azure",
      "region": "eastus",
      "status": "Healthy",
      "monthlyCost": 342.4,
      "metadata": { "resourceGroup": "rg-prod-app" }
    }
  ],
  "edges": [
    {
      "id": "a1b2c3d4e5f60718",
      "source": "…vm-app-01",
      "target": "…nic-app-01",
      "relationshipType": "DependsOn",
      "label": "VM depends on NIC"
    }
  ]
}
```

---

## Costs

### `GET /api/costs/summary?startDate=&endDate=`

```json
{
  "totalCost": 5843.47,
  "azureCost": 4086.87,
  "awsCost": 1756.61,
  "currency": "USD",
  "periodStart": "2026-09-20T00:00:00Z",
  "periodEnd": "2026-10-19T00:00:00Z",
  "byResourceType": [{ "category": "VirtualMachine", "amount": 1347.82, "percentage": 23.1 }],
  "byRegion": [ … ],
  "byResourceGroup": [ … ],
  "monthOverMonthChange": 6.5
}
```

### `GET /api/costs/trends?startDate=&endDate=`

One point per day: `{ "date", "azureCost", "awsCost", "totalCost" }`.
Defaults to the last 90 days.

### `GET /api/costs/forecast?daysAhead=30`

Linear regression over the trailing 30 days with 90% confidence bounds:
`{ "forecastDate", "predictedCost", "lowerBound", "upperBound", "confidenceLevel": 0.9 }`.

### `GET /api/costs/anomalies`

Resources whose latest daily cost is ≥2.5σ and ≥15% above their 30-day mean:

```json
{
  "id": "…",
  "resourceId": "…",
  "resourceName": "cosmos-prod-orders",
  "expectedCost": 16.4,
  "actualCost": 24.9,
  "deviationPercentage": 51.8,
  "detectedAt": "2026-10-19T06:00:00Z",
  "description": "Daily cost is +51.8% versus the 30-day average (16.40/day). …"
}
```

### `GET /api/costs/top-resources?count=10`

`{ resourceId, resourceName, provider, resourceGroup, amount, currency, periodStart, periodEnd }`
sorted by period cost.

### `GET /api/costs/recommendations`

Right-sizing, idle resources, unattached storage and governance findings:

```json
{
  "id": "…",
  "resourceId": "…",
  "resourceName": "vm-app-02",
  "resourceType": "VirtualMachine",
  "provider": "Azure",
  "region": "eastus",
  "category": "Rightsizing",
  "title": "Downsize under-utilised virtual machine",
  "description": "Average CPU utilisation is 7%. Downsize one SKU to cut spend by ~50%.",
  "estimatedMonthlySavings": 171.2,
  "confidence": "Medium"
}
```

---

## Compliance

### `GET /api/compliance/status`

```json
{
  "frameworkScores": { "CIS": 68.2, "SOC2": 80.0, "HIPAA": 85.7, "GDPR": 93.0 },
  "totalViolations": 15,
  "criticalViolations": 2,
  "highViolations": 9,
  "lastScanAt": "2026-10-19T06:00:00Z"
}
```

### `GET /api/compliance/reports/{framework}`

`framework` is one of `CIS`, `SOC2`, `HIPAA`, `GDPR`, `NIST`, `PCI_DSS`,
`ISO27001`. The response contains every evaluation:

```json
{
  "id": "…",
  "framework": "CIS",
  "generatedAt": "2026-10-19T06:00:00Z",
  "totalPolicies": 8,
  "compliantCount": 15,
  "nonCompliantCount": 7,
  "notApplicableCount": 7,
  "compliancePercentage": 68.2,
  "results": [
    {
      "id": "…",
      "policyId": "CIS-AZ-2.1",
      "policyName": "Ensure storage accounts are not publicly accessible",
      "resourceId": "…",
      "resourceName": "stgprodapp",
      "framework": "CIS",
      "status": "NonCompliant",
      "details": "Anonymous blob access is enabled.",
      "evaluatedAt": "2026-10-19T06:00:00Z"
    }
  ],
  "topViolations": [
    {
      "policyName": "…",
      "resourceName": "nsg-app",
      "resourceId": "…",
      "severity": "Critical",
      "details": "Ports 22,3389 are open to Internet.",
      "remediation": "Restrict administrative access to a bastion host or VPN range."
    }
  ]
}
```

### `GET /api/compliance/policies?framework=`

Returns the policy catalog including `ruleExpression` (a readable Resource Graph
query), `severity`, applicable types and remediation guidance.

### `POST /api/compliance/scan?framework=`

Runs a scan (all frameworks when omitted):

```json
{
  "message": "Compliance scan completed",
  "framework": "CIS",
  "totalEvaluated": 29,
  "compliant": 15,
  "nonCompliant": 7,
  "results": [ … ]
}
```

---

## Query

### `POST /api/query/ask`

```json
{ "question": "Which VMs are under-utilised?" }
```

```json
{
  "question": "Which VMs are under-utilised?",
  "answer": "**2** virtual machines run below 20% average CPU: **vm-app-02** (7%, $342.40/mo), …",
  "generatedQuery": "resources | where type == 'VirtualMachine' and cpuUtilization < 20",
  "data": [ { "id": "…", "name": "vm-app-02", "type": "VirtualMachine", "monthlyCost": 342.4 } ],
  "success": true,
  "error": null,
  "processingTime": "14 ms",
  "source": "Local"
}
```

`source` is `AzureOpenAI` when a configured deployment answered, otherwise
`Local`. Answers are Markdown-light (`**bold**`, bullet lines).

### `GET /api/query/suggestions`

Returns a list of contextual example questions.

---

## Realtime — `/hubs/notifications`

| Event | Payload |
|-------|---------|
| `resourceDiscovered` | `{ id, name, type, provider }` |
| `discoveryProgress` | `{ provider, completed, total, percentage }` |
| `discoveryCompleted` | `{ totalResources, durationSeconds, completedAt }` |
| `complianceViolation` | `{ policyName, resourceName, severity, details }` |
| `costAnomaly` | `{ resourceName, expectedCost, actualCost, deviationPercentage, description }` |
| `scanProgress` | `{ scanType, progress, total, percentage }` |

The hub also exposes `Ping()` (server replies `pong`).

---

## Errors

Errors use a problem-details shape (`application/problem+json`) carrying a trace
id. Client errors keep their specific message; server and upstream failures are
deliberately generic so internal URLs and response bodies never reach the caller.

```json
{
  "type": "https://httpstatuses.io/404",
  "title": "Not Found",
  "status": 404,
  "detail": "Resource 'az:…' not found",
  "traceId": "0HN7…:00000002",
  "timestamp": "2026-10-19T08:00:00Z"
}
```

Every response also carries `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`.

`GET /health` returns `{ "status": "Healthy", "timestamp": "…", "version": "…" }`.
