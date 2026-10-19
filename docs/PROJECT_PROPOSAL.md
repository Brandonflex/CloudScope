# Project Proposal: CloudScope
## Multi-Cloud Infrastructure Intelligence Platform

> **Status: historical document.** This is the original pre-implementation
> proposal, kept to show the design reasoning. A few choices changed during
> delivery — most notably Cosmos DB **SQL API** instead of Gremlin, no MediatR,
> and Angular 20 instead of the then-current 17. For what was actually built,
> see [architecture.md](architecture.md) and [IMPLEMENTATION.md](IMPLEMENTATION.md).

---

## The Problem (Real, Open, Recurrent)

Organizations running workloads across **AWS and Azure** face a fundamental visibility problem:

- **No single pane of glass.** Teams use separate consoles for each cloud. There's no unified view of how resources relate across providers.
- **Dependency blindness.** When something breaks, engineers manually trace dependencies across two (or more) cloud consoles. "What breaks if I delete this subnet?" is answered by tribal knowledge, not tooling.
- **Cost opacity.** Multi-cloud spend is fragmented. FinOps teams export CSVs from both clouds and stitch them together in spreadsheets.
- **Compliance drift.** Resources get created outside of IaC. Configurations drift. Security teams run periodic audits instead of continuous monitoring.
- **Incident response is slow.** When an alert fires, the first 15 minutes are spent figuring out *what's connected to what* — not fixing the problem.

### What Exists Today (And Why It Falls Short)

| Tool | What It Does | What It Lacks |
|------|-------------|---------------|
| **Steampipe / CloudQuery** | SQL-based querying of cloud resources | No graph visualization, no blast radius, no AI |
| **Blast Radius** (Terraform) | Visualizes Terraform dependency graphs | Terraform-only, unmaintained since 2020, no live state |
| **Cartography** | Security-focused infrastructure mapping | AWS-centric, security-only, no cost/compliance |
| **Prowler / ScoutSuite** | Security posture assessment | No visualization, no dependency mapping |
| **OpenCost / Kubecost** | Kubernetes cost allocation | K8s-only, no broader cloud resource view |
| **Datadog / Dynatrace** | Full observability | $$$, closed-source, single-vendor lock-in |
| **CloudHealth / Cloudability** | Multi-cloud cost management | $$$, enterprise-only, no graph intelligence |

**The gap:** No open-source tool combines **live multi-cloud resource discovery + interactive dependency graph + blast radius analysis + cost intelligence + compliance monitoring** in a single platform.

---

## The Solution: CloudScope

**CloudScope** is an open-source multi-cloud infrastructure intelligence platform that discovers, maps, analyzes, and visualizes your entire cloud estate across AWS and Azure — with AI-powered querying and proactive anomaly detection.

### Elevator Pitch
> "CloudScope is like having a real-time Google Maps for your cloud infrastructure — it discovers every resource across AWS and Azure, maps their dependencies as an interactive graph, shows you the blast radius of any change, forecasts your costs, checks compliance, and lets you ask questions in plain English."

---

## Core Features (Phased Delivery)

### Phase 1 — Foundation (MVP)
1. **Multi-Cloud Resource Discovery Engine**
   - Connect to Azure (ARM/Resource Graph API) and AWS (Config/CloudTrail/Resource Explorer APIs)
   - Discover and catalog all resources: VMs, VNets/VPCs, databases, storage, functions, load balancers, etc.
   - Store in a graph database (Neo4j or Cosmos DB Gremlin API)
   - Scheduled and on-demand sync

2. **Interactive Dependency Graph (The Hero Feature)**
   - Angular frontend with **Cytoscape.js** or **D3.js force-directed graph**
   - Resources as nodes, relationships as edges (network, compute, storage, IAM)
   - Filter by cloud (Azure/AWS), resource type, region, tags
   - Click a resource to see its full metadata, connections, and health
   - Color-coded by status (healthy/warning/critical) and cost tier

3. **Blast Radius Analysis**
   - Select any resource → instantly see all downstream dependencies
   - Simulate: "What if this VM is deleted?" → highlights affected databases, load balancers, DNS records
   - Risk scoring: high/medium/low based on dependency count and criticality
   - Visual diff: before/after graph when evaluating a change

4. **Angular Dashboard**
   - Modern, responsive Angular 17+ SPA with standalone components and signals
   - Real-time resource inventory with search, filter, sort
   - Cost overview cards (Azure + AWS combined)
   - Compliance posture summary
   - Dark/light theme

### Phase 2 — Intelligence
5. **Natural Language Query (AI-Powered)**
   - Azure OpenAI (GPT-4) integration
   - Ask: *"Show me all unattached public IP addresses in production"*
   - Ask: *"What's my most expensive resource group and what's in it?"*
   - Ask: *"Which resources would be affected if us-east-1 goes down?"*
   - Translates NL → resource graph query → visual result
   - Uses RAG with your resource catalog for grounded answers

6. **Cost Intelligence & Forecasting**
   - Pull billing data from Azure Cost Management API and AWS Cost Explorer API
   - Per-resource cost attribution
   - Trend analysis and 30/60/90-day forecasts
   - Anomaly detection (sudden cost spikes)
   - Right-sizing recommendations (underutilized VMs, idle databases)

7. **Compliance & Drift Detection**
   - Policy-as-code rules (YAML/JSON definitions)
   - CIS, SOC 2, HIPAA, GDPR framework mappings
   - Continuous scanning against live resource state
   - Drift detection: resources modified outside of IaC
   - Auto-generated compliance reports

### Phase 3 — Advanced
8. **Multi-Cloud Network Topology View**
   - Visualize VNet-to-VPC peering, VPN gateways, private endpoints
   - Latency heat map between connected resources
   - Security group / NSG flow visualization

9. **Incident Correlation**
   - Ingest alerts from Azure Monitor and AWS CloudWatch
   - Auto-correlate alerts to affected resources on the graph
   - "Incident blast radius" — show all affected services when an alert fires
   - Timeline view of cascading failures

10. **Infrastructure Drift Timeline**
    - Historical snapshots of resource graph
    - "What changed between Monday and Friday?"
    - Git-style diff of infrastructure state

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Angular Frontend                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │ Resource  │ │  Graph   │ │  Cost    │ │ Compliance │  │
│  │ Inventory │ │ Visualizer│ │Dashboard │ │  Reports   │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │
│  ┌──────────────────┐  ┌─────────────────────────────┐  │
│  │  NL Query (Chat)  │  │  Blast Radius Simulator     │  │
│  └──────────────────┘  └─────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────┘
                      │ REST / SignalR (real-time)
┌─────────────────────┴───────────────────────────────────┐
│                  .NET 8 Web API Backend                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │ Resource │ │  Graph   │ │  Cost    │ │ Compliance │  │
│  │ Discovery│ │  Engine  │ │ Analyzer │ │  Scanner   │  │
│  │ Service  │ │ Service  │ │ Service  │ │  Service   │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬───────┘  │
│       │             │            │             │          │
│  ┌────┴─────────────┴────────────┴─────────────┴───────┐ │
│  │          Azure Service Bus (Event Mesh)              │ │
│  └─────────────────────────────────────────────────────┘ │
└──────┬──────────────┬──────────────┬──────────────────────┘
       │              │              │
┌──────┴──────┐ ┌─────┴─────┐ ┌─────┴──────┐
│ Azure APIs  │ │ AWS APIs  │ │  AI Layer   │
│ ────────── │ │ ───────── │ │ ────────── │
│ Resource    │ │ Config    │ │ Azure      │
│  Graph API  │ │  API      │ │  OpenAI    │
│ Cost Mgmt  │ │ Cost      │ │  (GPT-4)   │
│  API       │ │  Explorer  │ │            │
│ Azure      │ │ CloudTrail│ │ Embeddings │
│  Monitor   │ │ CloudWatch│ │  + RAG     │
│ Policy     │ │ Config    │ │            │
│  Insights  │ │  Rules    │ │            │
└────────────┘ └──────────┘ └────────────┘
       │              │              │
┌──────┴──────────────┴──────────────┴──────────────────────┐
│                     Data Layer                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │Cosmos DB │ │ Azure    │ │ Redis    │ │  Blob Storage│ │
│  │(Gremlin) │ │ SQL DB   │ │  Cache   │ │  (Reports)   │ │
│  │ Graph    │ │(Metadata)│ │(Hot Data)│ │              │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Tech Stack & Skills Demonstrated

### Azure Skills (Primary Cloud)
| Service | Purpose | Skill Demonstrated |
|---------|---------|-------------------|
| **Azure Resource Graph** | Resource discovery at scale | Large-scale querying, KQL |
| **Azure Cost Management API** | Billing data ingestion | Financial data APIs |
| **Azure OpenAI (GPT-4)** | NL query + RAG | AI/ML integration, prompt engineering |
| **Cosmos DB (Gremlin API)** | Graph data store | Graph databases, Gremlin queries |
| **Azure Service Bus** | Event-driven architecture | Message queues, async processing |
| **Azure Monitor** | Alert ingestion | Observability integration |
| **Azure Policy Insights** | Compliance data | Governance APIs |
| **Azure AD / Entra ID** | Authentication (OIDC) | Identity & access management |
| **Azure App Service / AKS** | Hosting | Cloud deployment & scaling |
| **Azure SignalR** | Real-time updates | WebSocket/real-time communication |
| **Azure Blob Storage** | Report storage | Object storage patterns |

### AWS Skills (Secondary Cloud)
| Service | Purpose | Skill Demonstrated |
|---------|---------|-------------------|
| **AWS Config** | Resource discovery & compliance | Multi-cloud architecture |
| **AWS Cost Explorer** | Billing data | Cross-cloud cost management |
| **AWS CloudTrail** | Activity tracking | Audit & governance |
| **AWS CloudWatch** | Metrics & alerts | Monitoring integration |
| **AWS Resource Explorer** | Resource search | Multi-cloud inventory |
| **AWS SDK for .NET** | API integration | Cross-platform SDK usage |

### Angular Skills (Frontend)
| Feature | Technology | Skill Demonstrated |
|---------|-----------|-------------------|
| **Modern Angular** | Angular 17+, standalone components, signals | Current framework expertise |
| **Graph Visualization** | Cytoscape.js / D3.js | Complex data visualization |
| **Real-time Updates** | SignalR client + RxJS | Reactive programming |
| **State Management** | NgRx / Signals | Application state architecture |
| **Responsive Design** | Angular Material + CSS Grid | UI/UX engineering |
| **Charts & Dashboards** | Chart.js / ngx-echarts | Data visualization |
| **Authentication** | MSAL (Microsoft Auth Library) | OAuth2/OIDC client-side auth |

### API Integration Skills
| Integration | Type | Skill Demonstrated |
|------------|------|-------------------|
| **Azure Resource Graph** | REST + SDK | Complex query APIs |
| **AWS Config/CE** | REST + SDK | Multi-provider API patterns |
| **Azure OpenAI** | REST + streaming | AI API integration |
| **Neo4j/Cosmos** | Graph query (Gremlin) | Graph database APIs |
| **SignalR** | WebSocket/hub | Real-time API patterns |
| **Internal REST APIs** | Clean architecture | API design & versioning |

### Backend / Architecture Skills
| Area | Technology | Skill Demonstrated |
|------|-----------|-------------------|
| **Clean Architecture** | .NET 8, C#, MediatR | Enterprise patterns |
| **CQRS Pattern** | Command/Query separation | Scalable architecture |
| **Event-Driven** | Azure Service Bus | Microservices patterns |
| **Background Jobs** | Hangfire / Azure Functions | Async processing |
| **Testing** | xUnit, Moq, integration tests | Quality engineering |
| **CI/CD** | GitHub Actions + Azure DevOps | DevOps practices |
| **IaC** | Bicep / Terraform | Infrastructure as Code |
| **Docker** | Containerization | Cloud-native deployment |

---

## Why This Project Stands Out

### 1. It Solves a Real, Expensive Problem
Multi-cloud visibility is a **$4B+ market** (Gartner). Companies spend hundreds of thousands on tools like Datadog, Dynatrace, and CloudHealth. This project demonstrates you understand the *business problem*, not just the technology.

### 2. It's Architecturally Ambitious (In a Good Way)
This isn't a CRUD app. It involves:
- Graph databases and traversal algorithms
- Real-time event processing across two cloud providers
- AI-powered natural language understanding
- Complex data visualization with interactive graphs
- Multi-cloud API orchestration

### 3. No Direct Open-Source Competitor
The research is clear: nothing combines all these capabilities in one open-source tool. This means:
- It's genuinely useful (not a toy project)
- It fills a real gap in the ecosystem
- It has potential for community traction (stars, contributions)

### 4. It Demonstrates Exactly What Recruiters Want
Every feature maps directly to a skill that's in high demand:
- "Multi-cloud architecture" → Azure + AWS integration
- "Full-stack development" → Angular + .NET + cloud
- "API integration" → 6+ external API integrations
- "AI/ML experience" → Azure OpenAI, RAG, NLP
- "Data visualization" → Graph viz, charts, dashboards
- "DevOps" → CI/CD, IaC, containerization
- "Security & compliance" → Policy engine, CIS/SOC2/HIPAA

### 5. It Has a Compelling Demo Story
In an interview, you can say:
> *"Let me show you CloudScope. I connected it to my Azure and AWS accounts — here's the live graph of every resource. Watch what happens when I ask 'what breaks if this database goes down?' ... Now let me ask it a question in plain English: 'show me all resources costing more than $100/month that are under 10% CPU utilization' ... Here's the compliance report it generated against CIS benchmarks."*

That's a **memorable** demo. Nobody forgets the person who showed them their cloud infrastructure as an interactive graph with AI querying.

---

## Project Name: **CloudScope**

**Tagline:** *"See everything. Know everything. Fix anything."*

**Why this name:**
- "Scope" = to see/examine (like a microscope for your cloud)
- "Scope" = breadth of vision (full-scope visibility)
- Short, memorable, professional
- Available as a GitHub org/repo name
- Clean, no trademark conflicts

---

## Repository Structure (Proposed)

```
CloudScope/
├── README.md                          # Impressive, visual README
├── LICENSE                            # MIT License
├── CONTRIBUTING.md                    # Contribution guidelines
├── docs/
│   ├── architecture.md                # Architecture decision records
│   ├── api-reference.md               # API documentation
│   ├── deployment-guide.md            # How to deploy
│   └── screenshots/                   # UI screenshots for README
├── src/
│   ├── client/                        # Angular Frontend
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── core/              # Guards, interceptors, services
│   │   │   │   ├── features/
│   │   │   │   │   ├── dashboard/     # Overview dashboard
│   │   │   │   │   ├── graph/         # Graph visualization
│   │   │   │   │   ├── resources/     # Resource inventory
│   │   │   │   │   ├── costs/         # Cost intelligence
│   │   │   │   │   ├── compliance/    # Compliance reports
│   │   │   │   │   └── query/         # NL query chat
│   │   │   │   ├── shared/            # Shared components
│   │   │   │   └── layout/            # App shell
│   │   │   └── environments/
│   │   ├── angular.json
│   │   └── package.json
│   │
│   └── server/                        # .NET 8 Backend
│       ├── CloudScope.Api/            # Web API host
│       ├── CloudScope.Core/           # Domain logic, interfaces
│       ├── CloudScope.Infrastructure/ # Azure/AWS integrations
│       ├── CloudScope.GraphEngine/    # Graph traversal & analysis
│       ├── CloudScope.AI/             # OpenAI integration
│       └── CloudScope.Tests/          # Unit & integration tests
│
├── infra/                             # Infrastructure as Code
│   ├── bicep/                         # Azure Bicep templates
│   └── terraform/                     # Terraform (for AWS resources)
│
├── .github/
│   └── workflows/
│       ├── ci.yml                     # Build & test on PR
│       ├── deploy-azure.yml           # Deploy to Azure
│       └── codeql.yml                 # Security scanning
│
└── docker-compose.yml                 # Local dev environment
```

---

## Estimated Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| **Phase 1** | 4-6 weeks | Working MVP with discovery, graph, blast radius |
| **Phase 2** | 3-4 weeks | AI queries, cost intelligence, compliance |
| **Phase 3** | 3-4 weeks | Network topology, incident correlation, timeline |
| **Polish** | 2 weeks | README, docs, screenshots, demo video |

---

## Licensing

**MIT License** — maximizes adoption, allows commercial use, standard for portfolio projects.

---

*This proposal is a living document. Features and architecture will evolve during implementation.*