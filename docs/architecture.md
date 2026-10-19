# CloudScope — Architecture

This document describes the architecture that is actually implemented in the
repository (as opposed to the earlier planning documents). It covers the system
landscape, the individual projects, the data model, and the design decisions
that shaped the implementation.

## 1. Principles

1. **One domain model, two clouds.** Every provider is normalised into
   `CloudResource` + `ResourceRelationship`, so graph, cost, compliance and AI
   features are provider-agnostic.
2. **Clean Architecture.** `CloudScope.Core` has no infrastructure
   dependencies; providers and stores implement its interfaces.
3. **Works without credentials.** A bundled demo estate makes the product
   explorable and testable end-to-end; live discovery is an additive path.
4. **Deterministic analytics.** Cost series, anomaly detection and compliance
   evaluations are pure functions of the inventory, which keeps tests stable and
   demo output plausible.
5. **Real-time by default.** SignalR publishes discovery and scan progress so
   the UI can react without polling.

## 2. System landscape

```
Browser
  │  HTTPS (REST /api, WebSocket /hubs/notifications)
  ▼
ASP.NET Core 8 API ───────────────────────────────────────────────┐
  │                                                              │
  ├── Controllers (Resources, Graph, Costs, Compliance, Query, Meta)
  │        │                                                     │
  │        ▼                                                     │
  │   Domain services                                          │
  │     • CloudDiscoveryService   (provider orchestration)      │
  │     • BlastRadiusService      (GraphEngine)                 │
  │     • AzureCostService        (cost + forecasts + savings)  │
  │     • AzureComplianceService  (policy-as-code engine)       │
  │     • AzureAIQueryService     (OpenAI or local engine)      │
  │     • PlatformStatusService   (runtime metadata)            │
  │        │                                                     │
  │        ▼                                                     │
  │   Repositories  IResourceRepository / IGraphRepository      │
  │     • InMemoryCloudStore  (default, singleton)              │
  │     • CosmosResourceRepository + CosmosGraphRepository      │
  │        │                                                     │
  │        ▼                                                     │
  │   Providers  ICloudProviderService                          │
  │     • AzureResourceGraphService (ARM Resource Graph REST)   │
  │     • AwsConfigService          (AWS Config SelectResource) │
  └──────────────────────────────────────────────────────────────┘
```

Supporting infrastructure:

* **SignalR hub** (`/hubs/notifications`) with a `SignalRNotificationService`
  adapter that never lets a notification failure break a request.
* **Hosted service** that seeds the demo estate on first run and then runs the
  periodic discovery loop when providers are configured.
* **Exception middleware** that maps `CloudScopeException` and unexpected
  errors to RFC7807-style problem responses.
* **Serilog** console logging (plus Application Insights when a connection
  string is supplied).
* **Swagger** at `/swagger`.

## 3. Projects

| Project | Contents |
|---------|----------|
| `CloudScope.Core` | `CloudResource`, `ResourceRelationship`, cost/compliance/blast-radius DTOs, enums, interfaces (`IResourceRepository`, `IGraphRepository`, `ICloudProviderService`, `ICostService`, `IComplianceService`, `IAIQueryService`, `IDiscoveryService`, `INotificationService`, `IPlatformStatusService`), paging primitives. |
| `CloudScope.Infrastructure` | Configuration options, demo inventory loader, repositories, cloud providers, cost analytics, compliance catalog, AI query service, caching, runtime state. |
| `CloudScope.GraphEngine` | `GraphAlgorithms` (BFS, shortest path, subgraph) and `BlastRadiusService` (risk scoring + enrichment). |
| `CloudScope.Api` | Controllers, hub, hosted service, middleware, `Program.cs`. |
| `CloudScope.Tests` | Unit tests for the store, graph traversal, compliance rules, cost analytics, domain models and the local query engine. |

## 4. Data model

```
CloudResource
  Id                 "az:{armId}" | "aws:{arn}"
  Provider           Azure | AWS
  NativeId           provider identifier
  Name, ResourceType (28 values), NativeResourceType
  ResourceGroup, Region, Status
  Tags               Dictionary<string,string>
  Properties         Dictionary<string,object> (provider metadata)
  EstimatedMonthlyCost, CpuUtilization, MemoryUtilization
  DiscoveredAt, LastSyncedAt
  IsManagedByIaC
  ComplianceStatus
  Relationships      direct incident edges

ResourceRelationship
  Id                 deterministic (SHA-256 of source|target|type)
  SourceResourceId, TargetResourceId
  RelationshipType   Contains, DependsOn, ConnectsTo, ManagedBy, … (9 values)
  Description, Properties
```

Edges are **directed from dependent to dependency** (`vm-app-01 -> nic-app-01`).
This makes impact analysis a reverse traversal: starting at the failing node,
follow edges whose *target* is the current node.

### Storage backends

* **In-memory** (`InMemoryCloudStore`) — a locked dictionary store used by
  default and in tests. Fast, zero-dependency, and the basis of the demo mode.
* **Cosmos DB** — selected with `Platform:StorageProvider=Cosmos` when
  `CosmosDb:Endpoint` and `Key` are present. Resources live in a `Resources`
  container partitioned by `/provider`; edges live in a `Graph` container
  partitioned by `/sourceResourceId`. Traversal is performed in-process over
  the (bounded) edge set, so no Gremlin server or graph query language is
  required. Database and containers are created lazily on first use.

Redis is optional (`ConnectionStrings:Redis`); without it an in-process
distributed memory cache is registered, so the API has no hard dependency.

## 5. Key algorithms

### Blast radius

1. `IGraphRepository.GetTransitiveDependenciesAsync` performs a breadth-first
   walk over reversed edges, skipping `Contains` and `Monitors` (structure and
   observability are not runtime dependencies).
2. Each node records hop count and impact risk (direct = High, transitive =
   Medium).
3. `BlastRadiusService` enriches nodes from the resource store, groups impact by
   type and region, sums affected monthly cost (failing resource + downstream)
   and assigns a risk level from the affected count
   (`>50 Critical`, `>20 High`, `>5 Medium`, otherwise `Low`).
4. Nodes are ordered by hop count then name; the summary sentence is generated
   from the same data.

### Cost analytics

`CostAnalytics` is a pure, testable module:

* **Daily cost** = monthly estimate / days in month × 90-day growth curve ×
  deterministic FNV-1a noise (±5%) × scripted demo spikes. Two spikes keep
  anomaly detection meaningful without randomness.
* **Summary** aggregates period cost per resource into totals and
  type/region/resource-group buckets (amounts and percentages).
* **Trends** produce one point per day, split by provider.
* **Forecast** fits an ordinary least-squares line over the trailing 30 days
  and projects it with ±1.96σ bounds at 90% confidence.
* **Anomalies** compare the latest daily cost of each resource with its own
  30-day mean/σ and report z ≥ 2.5 with at least 15% deviation.
* **Recommendations** cover rightsizing (CPU < 10% / < 20%), unattached public
  IPs, unattached disks and resources outside IaC.

When Azure/AWS credentials exist, `AzureCostService` additionally queries Azure
Cost Management (`2023-11-01`) and AWS Cost Explorer and rescales the summary to
the live totals; failures fall back silently to inventory-derived numbers.

### Compliance engine

`CompliancePolicyCatalog` defines 16 policies as data plus a pure evaluation
function. Each evaluation returns `Compliant`, `NonCompliant` or
`NotApplicable` with a human-readable reason. Policies declare the resource
types they apply to (empty = all). Scores are
`compliant / (compliant + nonCompliant) × 100` (one decimal). Reports contain
every result, counts, and violations sorted by severity. The catalog covers CIS
(storage, SQL, Key Vault, security groups, disk encryption), SOC 2 (segmentation,
HTTPS, monitoring, backups), HIPAA (encryption at rest/in transit) and GDPR
(public network access, data-inventory tags).

### Natural-language query

1. `AzureAIQueryService` builds a compact inventory context and, when
   `AzureOpenAI` is configured, asks GPT-4 for JSON
   `{answer, generatedQuery, resourceIds}`. Resource ids are rehydrated from the
   store so answers always cite real resources.
2. Without OpenAI (or on failure) `LocalQueryEngine` resolves intents with
   regexes and a keyword table, in this priority order: blast radius,
   compliance, anomalies, forecast, recommendations, unattached resources, IaC
   drift, CPU utilisation, cost threshold, resource group, top-N, type/provider,
   overview, keyword search.
3. Every response carries the answer, the query that produced it, the resources
   used, a source label (`AzureOpenAI` / `Local`) and processing time.

### Discovery

`CloudDiscoveryService`:

1. Collects configured providers (`ICloudProviderService.IsConfigured`).
2. With none configured, loads the embedded demo estate
   (`CloudScope.demo.inventory.json`) and marks the runtime as demo.
3. Otherwise runs provider discovery, upserts resources, collects and
   de-duplicates edges whose endpoints both exist, upserts edges, and emits
   SignalR progress/completion events.
4. The hosted service seeds on startup and then repeats on the configured
   interval.

**Azure** discovery calls the Resource Graph REST API using
`DefaultAzureCredential` (client secret or managed identity), pages through
`skipToken`, maps provisioning state to health, and derives edges by recursively
scanning resource properties for ARM ids (subnets, NICs, NSGs, public IPs,
disks, identities…).

**AWS** discovery calls `SelectResourceConfig` with pagination, maps Config
resource types into the CloudScope enum, flattens configuration into properties,
and derives subnet/VPC/security-group edges using ARNs.

## 6. Frontend architecture

Angular 20 standalone application:

* `core/models` — one TypeScript mirror of the API contract plus label/colour
  maps.
* `core/services` — typed HTTP clients for every controller, a SignalR client,
  a meta/status service, toast notifications and a refresh bus.
* `features/*` — lazy-loaded routes: dashboard, graph, resources (with a detail
  dialog), costs, compliance, query.
* `layout/nav-shell` — responsive shell with live status, realtime indicator and
  a global discovery action.
* `shared/components` — Chart.js wrapper, stat card, empty state, spinner.

State uses signals and `computed`; HTTP calls are composed with `forkJoin` per
screen. Strict templates, `noPropertyAccessFromIndexSignature`, and strict
TypeScript settings are enabled.

## 7. Design decisions

| Decision | Rationale |
|----------|-----------|
| **Cosmos DB SQL API instead of Gremlin** | Microsoft.Azure.Cosmos is a single, mature dependency; traversal over ≤ thousands of edges is trivially fast in-process, and it avoids provisioning a Gremlin endpoint. The repository abstraction keeps a future Gremlin implementation isolated. |
| **In-memory default** | Lets reviewers and CI run the full product with no external services; Cosmos is opt-in. |
| **Bundled demo estate** | The same JSON powers backend seeding, the Angular demo host and tests, so numbers agree across all three. |
| **Local NL engine alongside OpenAI** | The AI feature must not be a paywalled demo; deterministic intent matching covers the common questions and acts as the OpenAI fallback. |
| **No MediatR** | Controllers call services directly; with one deployable and a small surface, indirection added cost without benefit. Interfaces still isolate the domain. |
| **No authentication yet** | Phase-1 scope; middleware and CORS (with credentials) are wired so Entra ID can be added without re-architecting. |

## 8. Observability and failure handling

* Serilog structured console logging with request correlation via ASP.NET Core.
* `ExceptionHandlingMiddleware` returns consistent JSON errors and logs
  unhandled exceptions.
* Cloud provider failures are captured per provider and surfaced in discovery
  results and `/api/meta`, never as a 500 for the whole run.
* SignalR notifications swallow failures (best effort).
* `/health` provides a liveness probe.

## 9. Testing

Unit tests cover:

* store seeding, filters, paging, search, upserts, deletions and graph queries;
* transitive dependency traversal, depth limits and path finding;
* blast-radius thresholds, grouping and cost aggregation;
* every compliance rule plus posture/report/scan behaviour;
* cost determinism, summaries, trends, forecasts, anomalies and MoM change;
* the local query engine's intents and suggestions;
* domain model invariants (paging, results, enum coverage).

CI runs `dotnet test` on every pull request and annotates failing tests directly
on the PR.
