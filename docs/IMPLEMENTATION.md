# CloudScope — Implementation Map

This document maps every capability in the project proposal to the code that
implements it, explains how to exercise it, and records the deliberate scope
decisions behind the delivered milestone.

## 1. Status at a glance

| Capability | Status | Where |
|-----------|--------|-------|
| Azure discovery | ✅ Implemented | `Infrastructure/Services/Azure/AzureResourceGraphService.cs` |
| AWS discovery | ✅ Implemented | `Infrastructure/Services/AWS/AwsConfigService.cs` |
| Demo estate (zero credentials) | ✅ Implemented | `Demo/DemoInventoryLoader.cs`, `public/demo/inventory.json` |
| Persistence — in-memory | ✅ Implemented | `Repositories/InMemoryCloudStore.cs` |
| Persistence — Cosmos DB | ✅ Implemented | `Persistence/CosmosDatabase.cs`, `Repositories/Cosmos*Repository.cs` |
| Relationship extraction | ✅ Implemented | provider services + `Helpers/RelationshipIdentity.cs` |
| Dependency graph API | ✅ Implemented | `GraphEngine/Algorithms/GraphAlgorithms.cs`, `Repositories/InMemoryCloudStore.cs` |
| Blast radius | ✅ Implemented | `GraphEngine/Services/BlastRadiusService.cs` |
| Cost summary / trends | ✅ Implemented | `Services/Cost/CostAnalytics.cs`, `Services/Azure/AzureCostService.cs` |
| Forecast / anomalies / recommendations | ✅ Implemented | `CostAnalytics.cs`, `AzureCostService.GetRecommendationsAsync` |
| Compliance engine (16 rules, 4 frameworks) | ✅ Implemented | `Compliance/CompliancePolicyCatalog.cs`, `Services/Azure/AzureComplianceService.cs` |
| AI query — Azure OpenAI | ✅ Implemented (config required) | `Services/Azure/AzureAIQueryService.cs` |
| AI query — offline engine | ✅ Implemented | `Services/Ai/LocalQueryEngine.cs` |
| Real-time notifications | ✅ Implemented | `Api/Hubs/NotificationHub.cs` |
| Background discovery | ✅ Implemented | `Api/HostedServices/DiscoveryBackgroundService.cs` |
| Angular UI (6 screens) | ✅ Implemented | `src/client/src/app/features/*` |
| Demo API for UI development | ✅ Implemented | `src/client/mock-api/server.mjs` |
| Tests | ✅ 51 unit tests | `CloudScope.Tests/Unit/*` |
| Entra ID authentication | ⏭ Deferred (wired, not enforced) | `Program.cs` |
| Gremlin graph database | ⏭ Replaced by in-process traversal | `docs/architecture.md` §7 |
| Multi-tenant RBAC | ⏭ Out of scope for phase 1 | — |

## 2. What runs where

### Backend (`src/server`)

* **`CloudScope.Api`** — entry point. `Program.cs` wires options, storage
  selection, providers, domain services, SignalR, CORS, Serilog, Swagger,
  exception middleware and the hosted discovery service.
* **`CloudScope.Infrastructure`** — everything that talks to the outside world
  or implements domain logic: cloud clients, repositories, analytics, policy
  catalog, query engine, demo loader, cache.
* **`CloudScope.GraphEngine`** — pure graph algorithms and blast-radius
  scoring.
* **`CloudScope.Core`** — no dependencies beyond the BCL; safe to reuse.

### Frontend (`src/client`)

| Route | Component | Highlights |
|-------|-----------|------------|
| `/dashboard` | `DashboardComponent` | 4 KPI tiles, 30-day cost chart, resource mix, framework scores, attention list, top spend, anomalies |
| `/graph` | `GraphComponent` | Cytoscape canvas with 5 layouts, filters, search, node inspector, blast-radius overlay |
| `/resources` | `ResourcesComponent` | Server-side paging/filtering/search, detail dialog (overview, relationships, blast radius) |
| `/costs` | `CostsComponent` | Period toggle, spend trend vs forecast, category/region charts, savings and anomalies, top-resource table |
| `/compliance` | `ComplianceComponent` | Framework donut cards, severity chart, violations, all results, policy catalog, scan action |
| `/query` | `QueryComponent` | Chat transcript, suggestions, generated query disclosure, source badge |

The shell (`layout/nav-shell.component.ts`) shows platform mode, resource/edge
counts, SignalR state and a global "Run discovery" action.

## 3. Exercise each feature

### Demo data (default)

```bash
cd src/server && dotnet run --project CloudScope.Api
# or, UI only:
cd src/client && npm ci && npm run preview:demo
```

The estate contains 54 resources (34 Azure / 20 AWS), 65 edges, 28 resource
types and $5.5k monthly spend. It is deliberately imperfect: public blobs, a
world-open NSG, unencrypted disks, an over-provisioned VM, an unattached public
IP, a cost spike on `cosmos-prod-orders`, and three resources created outside
IaC.

### Live discovery

Fill in `Azure:SubscriptionId` (+ client credentials or managed identity) and/or
`AWS:AccessKeyId`/`SecretAccessKey`/`Region`. Discovery runs on startup and every
15 minutes, or immediately via `POST /api/resources/discover`. Relationships are
derived from ARM references and AWS subnet/VPC/security-group configuration.

### Cosmos persistence

```jsonc
{
  "Platform": { "StorageProvider": "Cosmos" },
  "CosmosDb": { "Endpoint": "https://…documents.azure.com:443/", "Key": "…" }
}
```

Containers are created automatically. Resource documents are partitioned by
provider; edge documents by source resource id.

### Azure OpenAI

```jsonc
{
  "AzureOpenAI": {
    "Endpoint": "https://my-openai.openai.azure.com/",
    "ApiKey": "…",
    "DeploymentName": "gpt-4o"
  }
}
```

Requests use `api-version=2024-08-01-preview`, a JSON response format and a
compact inventory context. Any failure falls back to the local engine, and the
response's `source` field reveals which path answered.

## 4. The demo estate

`src/client/public/demo/inventory.json` is the single source of truth. It is:

* embedded into `CloudScope.Infrastructure` as
  `CloudScope.demo.inventory.json` and seeded on startup;
* served to the mock API used by `npm run preview:demo`;
* referenced by unit tests (so tests validate the same data users see).

Topology highlights (useful when demoing):

* `snet-app` → 3 NICs → 3 VMs, plus AKS and its ACR. Blast radius of the
  subnet reaches 13 resources across 3 hops.
* `cosmos-prod-orders` carries the scripted cost anomaly.
* `nsg-app` exposes 22/3389 to the Internet (critical CIS finding).
* `vm-app-03`, `nic-app-03` and `pip-orphan-01` were created outside IaC.
* `s3-prod-backups` lacks bucket versioning; `stgprodapp` allows public blobs.

## 5. Testing strategy

| Layer | What is covered | Command |
|-------|-----------------|---------|
| Domain | paging invariants, result types, model defaults | `dotnet test` |
| Store | seeding, filters, paging, search, upsert/delete, graph queries, traversal limits | `dotnet test` |
| Graph | blast radius thresholds, grouping, affected cost, missing resources | `dotnet test` |
| Compliance | each policy's pass/fail/NA branch, posture, reports, scan filtering | `dotnet test` |
| Costs | determinism, summary sums, daily trends, regression forecast, anomaly spike, MoM | `dotnet test` |
| Query engine | CPU, cost, orphan, IaC, blast radius, compliance and overview intents | `dotnet test` |
| Frontend | TypeScript strict build + template type checking | `npm run build` |

CI (`.github/workflows/ci.yml`) restores, builds and tests the backend, installs
and builds the frontend, validates Bicep, and annotates failing tests on the PR.
The dedicated CodeQL workflow analyses both languages (requires code scanning to
be enabled in the repository settings).

## 6. Known limitations and next steps

1. **No end-user authentication.** Entra ID / RBAC is the next milestone; CORS
   and middleware are already prepared.
2. **AWS relationships** depend on `AWS:AccountId` being configured to build
   ARNs; without it resources are still discovered but edges are skipped.
3. **Cost data for live estates** is only rescaled by live totals; per-resource
   attribution still uses inventory estimates unless Azure Cost Management
   exports are added.
4. **Cosmos traversal** loads the edge set into memory. At very large estate
   sizes a Gremlin/Neo4j backend behind `IGraphRepository` would be preferable.
5. **Demo mode is explicitly labelled.** `/api/meta` and the UI banner make it
   obvious when synthetic data is shown.
6. **Screenshots** are placeholders in `docs/screenshots/`; capture them from a
   running instance before publishing the repository.
