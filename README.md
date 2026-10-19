<h1 align="center">CloudScope</h1>

<p align="center">
  <strong>Multi-Cloud Infrastructure Intelligence Platform</strong><br/>
  <em>See everything. Know everything. Fix anything.</em>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quickstart">Quickstart</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#api">API</a> •
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Azure-0078D4?style=flat&logo=microsoftazure&logoColor=white" alt="Azure" />
  <img src="https://img.shields.io/badge/AWS-232F3E?style=flat&logo=amazonaws&logoColor=white" alt="AWS" />
  <img src="https://img.shields.io/badge/Angular-18-DD0031?style=flat&logo=angular&logoColor=white" alt="Angular" />
  <img src="https://img.shields.io/badge/.NET_8-512BD4?style=flat&logo=dotnet&logoColor=white" alt=".NET 8" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Cosmos_DB-0078D4?style=flat&logo=microsoftazure&logoColor=white" alt="Cosmos DB" />
  <img src="https://img.shields.io/badge/OpenAI-412991?style=flat&logo=openai&logoColor=white" alt="OpenAI" />
  <img src="https://img.shields.io/github/license/Brandonflex/Azure" alt="License" />
</p>

---

## Overview

**CloudScope** is an open-source multi-cloud infrastructure intelligence platform that discovers, maps, analyses and visualises an entire cloud estate across **Azure** and **AWS** — with AI-assisted querying, blast-radius analysis, cost intelligence and continuous compliance scanning.

Most organisations running multi-cloud have no single pane of glass. Teams juggle separate consoles, exported CSVs and tribal knowledge. Existing tools each solve one slice of the problem. **CloudScope puts the pieces together** in one deployable application.

> **It runs end-to-end with zero cloud credentials.** A realistic 54-resource demo estate (Azure + AWS, 65 dependency edges) is bundled and loaded automatically when no provider is configured, so every screen, chart and query is explorable out of the box.

### What makes CloudScope different?

| Capability | CloudScope | Steampipe | Cartography | Prowler | OpenCost |
|-----------|:----------:|:---------:|:-----------:|:-------:|:--------:|
| Multi-cloud discovery (Azure + AWS) | ✅ | ✅ | ⚠️ AWS-centric | ✅ | ❌ K8s only |
| Interactive dependency graph | ✅ | ❌ | ⚠️ Neo4j only | ❌ | ❌ |
| Blast radius analysis | ✅ | ❌ | ❌ | ❌ | ❌ |
| AI natural-language queries | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cost intelligence & forecasting | ✅ | ❌ | ❌ | ❌ | ✅ K8s only |
| Compliance scanning (CIS/SOC 2/HIPAA/GDPR) | ✅ | ⚠️ | ⚠️ Security only | ✅ | ❌ |
| IaC drift visibility | ✅ | ❌ | ❌ | ❌ | ❌ |
| Interactive dashboard UI | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Features

### 🔍 Multi-cloud resource discovery
Azure Resource Graph and AWS Config are queried on demand and on a schedule. Discovered resources are normalised into a single model (provider, type, region, tags, properties, cost, health, IaC ownership) and persisted to the configured store. Relationship edges are derived from ARM references and AWS resource configuration.

### 🕸️ Interactive dependency graph
The whole estate rendered with Cytoscape.js: force-directed, concentric, breadth-first and grid layouts; provider and type filters; search with focus; node inspector with live blast-radius analysis.

### 💥 Blast radius analysis
A reverse graph traversal (BFS) answers *"what breaks if this fails?"*. Impact is grouped by hop count, resource type and region, with a risk score and the monthly cost of everything downstream. Containment (`Contains`) and monitoring (`Monitors`) edges are excluded because a child failing does not take its parent down.

### 💬 Natural-language query
Ask questions such as *"which VMs are under-utilised?"* or *"what is the blast radius of vm-app-01?"*. When Azure OpenAI is configured the question is answered by GPT with the live inventory as context; otherwise a deterministic local engine resolves the same intents, so the feature always works. Answers are returned with the resources they cite and the query that produced them.

### 💰 Cost intelligence
Per-resource cost attribution, 30/60/90-day trends, linear-regression forecasts with confidence bands, z-score anomaly detection, and right-sizing / idle-resource recommendations. Live Azure Cost Management and AWS Cost Explorer data is used when credentials exist; otherwise costs are derived deterministically from the inventory.

### 🛡️ Compliance and posture
16 policy-as-code rules across **CIS**, **SOC 2**, **HIPAA** and **GDPR**, evaluated against resource properties and tags. Framework scorecards, severity-ranked findings with remediation guidance, a searchable policy catalog, and on-demand scans that stream progress over SignalR.

### ⚡ Real-time updates
A SignalR hub pushes `resourceDiscovered`, `discoveryProgress`, `discoveryCompleted`, `complianceViolation`, `costAnomaly` and `scanProgress` events to the SPA.

---

## Quickstart

> Setting up for the first time? **[docs/SETUP.md](docs/SETUP.md)** is a
> three-track checklist (run it locally → green checks → deploy to Azure).


### Option A — explore the demo UI (no .NET, no cloud account)

```bash
git clone https://github.com/Brandonflex/Azure.git
cd Azure/src/client
npm ci
npm run preview:demo       # builds the SPA and serves it with the bundled demo API
```

Open **http://localhost:4300**. The demo API (`src/client/mock-api/`) implements the same REST surface as the .NET backend on top of `public/demo/inventory.json`.

For hot reload while working on the UI:

```bash
npm run mock:api           # demo API on :5055
npm run start:mock         # ng serve on :4200, proxying /api to :5055
```

### Option B — run the full stack

Prerequisites: [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0), Node.js 20+.

```bash
# Terminal 1 — API (http://localhost:5001, Swagger at /swagger)
cd src/server
dotnet restore
dotnet run --project CloudScope.Api

# Terminal 2 — Angular dev server (http://localhost:4200)
cd src/client
npm ci
npm start                  # proxies /api and /hubs to :5001
```

No credentials are required: `Platform:SeedDemoData` is `true` by default and the demo estate is loaded when no provider is configured.

### Option C — Docker

```bash
# Dependencies only: Cosmos DB emulator (:8081), Redis (:6379), SQL Edge (:1433)
docker compose up -d

# Whole application: API on :8080 and the SPA on :8089
docker compose --profile app up --build
```

Then set `Platform:StorageProvider` to `Cosmos` and fill in `CosmosDb:Endpoint` / `CosmosDb:Key` to exercise the Cosmos persistence path.

### Tests and builds

```bash
# Backend
dotnet build src/server/CloudScope.sln -c Release
dotnet test  src/server/CloudScope.sln -c Release

# Frontend
cd src/client
npm run lint               # ESLint (TypeScript + templates)
npm test                   # Karma/Jasmine unit tests
npm run build              # development build
npm run build:prod         # optimised production build
```

### Deploying to Azure

One App Service hosts both the API and the SPA (the build is published into
`wwwroot`), provisioned by `infra/bicep/main.bicep` (Cosmos DB SQL API, Redis,
Azure OpenAI, Application Insights, Key Vault).

```bash
# demo profile: B1 App Service + Cosmos free tier (~$30/mo)
gh workflow run deploy-azure.yml -f profile=demo
```

Required repository secrets and the post-deploy checklist are documented in
[docs/deployment-guide.md](docs/deployment-guide.md); the short version is
[docs/SETUP.md](docs/SETUP.md).

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│                        Angular 18 SPA (standalone)                    │
│  Dashboard · Graph · Resources · Costs · Compliance · AI Query        │
│  Signals · Material 18 · Chart.js · Cytoscape.js · SignalR client     │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ REST + WebSocket (/api, /hubs/notifications)
┌───────────────────────────────┴──────────────────────────────────────┐
│                       ASP.NET Core 8 Web API                         │
│  Controllers ──► Domain services ──► Repositories                    │
│  Discovery · Blast Radius · Cost Analytics · Compliance · AI Query   │
│  Exception middleware · Serilog · Swagger · Health checks             │
└───────┬───────────────────┬────────────────────┬─────────────────────┘
        │                   │                    │
┌───────┴───────┐   ┌───────┴────────┐   ┌───────┴────────────┐
│ Cloud APIs    │   │ Storage        │   │ AI                 │
│ Azure ARM /   │   │ In-memory      │   │ Azure OpenAI       │
│ Resource Graph│   │ (default) or   │   │ (optional) +       │
│ AWS Config /  │   │ Cosmos DB      │   │ local NL engine    │
│ Cost Explorer │   │ (SQL API)      │   │                    │
└───────────────┘   └────────────────┘   └────────────────────┘
```

The backend follows Clean Architecture:

| Project | Responsibility |
|---------|----------------|
| `CloudScope.Core` | Domain models, enums, service interfaces, paging/result primitives |
| `CloudScope.Infrastructure` | Cloud providers, repositories, cost/compliance/AI services, demo data |
| `CloudScope.GraphEngine` | Graph traversal and blast-radius analysis |
| `CloudScope.Api` | HTTP surface, SignalR hub, hosted discovery loop, middleware |
| `CloudScope.Tests` | xUnit + FluentAssertions + Moq unit tests |

See [docs/architecture.md](docs/architecture.md) for design decisions and
[docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) for a feature-by-feature implementation map.

---

## Configuration

Everything is configurable through `appsettings.json` or environment variables (`Azure__SubscriptionId`, `Platform__StorageProvider`, …).

| Section | Purpose |
|---------|---------|
| `Platform` | `Mode` (`Auto`/`Demo`/`Live`), `StorageProvider` (`InMemory`/`Cosmos`), `SeedDemoData` |
| `Discovery` | Background sync toggle, interval (minutes), startup delay |
| `Azure` | Tenant, client, subscription and Resource Graph scopes |
| `AWS` | Access key, secret, region, optional account id for ARN construction |
| `CosmosDb` | Endpoint, key, database and container names |
| `AzureOpenAI` | Endpoint, key, deployment, temperature, max tokens |
| `Redis` | Optional distributed cache connection string |
| `ApplicationInsights` | Optional telemetry connection string |

**Demo mode** is selected automatically when neither Azure nor AWS credentials are present. `GET /api/meta` reports the active mode, storage backend, AI mode and inventory counts; the SPA shows a banner when demo data is loaded.

### Cloud permissions

* **Azure** — Resource Graph `read`, Cost Management `read`, plus `Microsoft.Resources/subscriptions/read`. Any of client-secret credentials, managed identity or `az login` (via `DefaultAzureCredential`) works.
* **AWS** — `config:SelectResourceConfig`, `config:ListDiscoveredResources`, `ce:GetCostAndUsage`.

> Authentication between the SPA and the API is intentionally open in this phase; the pipeline already wires `UseAuthentication`/`UseAuthorization` so Entra ID can be enabled without restructuring.

---

## API

Interactive documentation is served at **`/swagger`** when the API is running.

| Area | Endpoints |
|------|-----------|
| Meta | `GET /api/meta`, `POST /api/meta/demo` |
| Resources | `GET /api/resources` (paging, provider/type/region/group/search filters), `GET /api/resources/{id}`, `GET /api/resources/{id}/relationships`, `GET /api/resources/blast-radius/{id}`, `POST /api/resources/discover` |
| Graph | `GET /api/graph`, `GET /api/graph/subgraph/{id}`, `GET /api/graph/paths?sourceId=&targetId=` |
| Costs | `GET /api/costs/{summary,trends,forecast,anomalies,top-resources,recommendations}` |
| Compliance | `GET /api/compliance/{status,policies}`, `GET /api/compliance/reports/{framework}`, `POST /api/compliance/scan` |
| Query | `POST /api/query/ask`, `GET /api/query/suggestions` |
| Realtime | SignalR hub at `/hubs/notifications` |
| Health | `GET /health` |

Full request and response examples live in [docs/api-reference.md](docs/api-reference.md).

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Angular 18 (standalone, signals, strict templates), Angular Material 18, Chart.js 4, Cytoscape.js, SignalR client, TypeScript 5.5 |
| **Backend** | .NET 8, ASP.NET Core, Serilog, Swashbuckle, SignalR |
| **Data** | In-memory store (default) or Azure Cosmos DB (SQL API); optional Redis cache |
| **Cloud** | Azure Resource Graph, Azure Cost Management, Azure OpenAI, AWS Config, AWS Cost Explorer |
| **DevOps** | GitHub Actions (build, test, CodeQL, Bicep validation), Bicep, Terraform, Docker Compose |
| **Testing** | xUnit, FluentAssertions, Moq |

---

## Repository structure

```text
CloudScope/
├── src/
│   ├── client/                        # Angular 18 application
│   │   ├── src/app/
│   │   │   ├── core/                  # models, API services, formatting helpers
│   │   │   ├── features/              # dashboard, graph, resources, costs, compliance, query
│   │   │   ├── layout/                # navigation shell
│   │   │   └── shared/                # chart, stat-card, empty-state, spinner
│   │   ├── public/demo/inventory.json # single source of truth for the demo estate
│   │   ├── mock-api/                  # dependency-free demo API + static host
│   │   └── proxy*.json                # dev proxies (real API / demo API)
│   └── server/                        # .NET 8 solution
│       ├── CloudScope.Api/
│       ├── CloudScope.Core/
│       ├── CloudScope.Infrastructure/
│       ├── CloudScope.GraphEngine/
│       └── CloudScope.Tests/
├── infra/                             # Bicep + Terraform
├── docs/                              # architecture, API, implementation notes
├── .github/workflows/                 # CI, CodeQL, deployment
└── docker-compose.yml                 # Cosmos DB emulator + Redis
```

---

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Good first issues include additional compliance policies, more provider relationship mappings and additional AI query intents.

---

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  Built with ☁️ by <a href="https://github.com/Brandonflex">Brandonflex</a>
</p>
