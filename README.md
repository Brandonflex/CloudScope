<p align="center">
  <img src="docs/screenshots/cloudscope-banner.png" alt="CloudScope Banner" width="100%" />
</p>

<h1 align="center">CloudScope</h1>

<p align="center">
  <strong>Multi-Cloud Infrastructure Intelligence Platform</strong><br/>
  <em>See everything. Know everything. Fix anything.</em>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#quickstart">Quickstart</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Azure-0078D4?style=flat&logo=microsoftazure&logoColor=white" alt="Azure" />
  <img src="https://img.shields.io/badge/AWS-232F3E?style=flat&logo=amazonaws&logoColor=white" alt="AWS" />
  <img src="https://img.shields.io/badge/Angular-DD0031?style=flat&logo=angular&logoColor=white" alt="Angular" />
  <img src="https://img.shields.io/badge/.NET_8-512BD4?style=flat&logo=dotnet&logoColor=white" alt=".NET 8" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Cosmos_DB-0078D4?style=flat&logo=microsoftazure&logoColor=white" alt="Cosmos DB" />
  <img src="https://img.shields.io/badge/OpenAI-412991?style=flat&logo=openai&logoColor=white" alt="OpenAI" />
  <img src="https://img.shields.io/github/license/Brandonflex/Azure" alt="License" />
</p>

---

## Overview

**CloudScope** is an open-source multi-cloud infrastructure intelligence platform that discovers, maps, analyzes, and visualizes your entire cloud estate across **AWS** and **Azure** — with AI-powered querying and proactive anomaly detection.

Most organizations running multi-cloud have no single pane of glass. Teams use separate consoles, export CSVs, and rely on tribal knowledge. Existing tools (Steampipe, Cartography, Blast Radius, Prowler, OpenCost) each solve one piece of the puzzle. **CloudScope puts all the pieces together.**

### What makes CloudScope different?

| Capability | CloudScope | Steampipe | Cartography | Prowler | OpenCost |
|-----------|:----------:|:---------:|:-----------:|:-------:|:--------:|
| Multi-cloud discovery (Azure + AWS) | ✅ | ✅ | ⚠️ AWS-centric | ✅ | ❌ K8s only |
| Interactive dependency graph | ✅ | ❌ | ⚠️ Neo4j only | ❌ | ❌ |
| Blast radius analysis | ✅ | ❌ | ❌ | ❌ | ❌ |
| AI natural language queries | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cost intelligence & forecasting | ✅ | ❌ | ❌ | ❌ | ✅ K8s only |
| Compliance scanning | ✅ | ⚠️ | ⚠️ Security only | ✅ | ❌ |
| Drift detection | ✅ | ❌ | ❌ | ❌ | ❌ |
| Interactive dashboard UI | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Features

### 🔍 Multi-Cloud Resource Discovery
Connect your Azure and AWS accounts to discover every resource — VMs, VNets, VPCs, databases, storage, functions, load balancers, and more. Scheduled and on-demand sync keeps your inventory current.

### 🕸️ Interactive Dependency Graph
Your entire infrastructure as an interactive, explorable graph. Resources are nodes, relationships are edges. Filter by cloud, type, region, or tags. Click any resource for full metadata and health status.

### 💥 Blast Radius Analysis
Select any resource and instantly see all downstream dependencies. Simulate: *"What breaks if this database goes down?"* — CloudScope highlights every affected service with risk scoring.

### 💬 AI-Powered Natural Language Query
Ask questions in plain English powered by Azure OpenAI (GPT-4):
- *"Show me all unattached public IP addresses in production"*
- *"What's my most expensive resource group?"*
- *"Which resources would be affected if us-east-1 goes down?"*

### 💰 Cost Intelligence & Forecasting
Unified cost view across Azure Cost Management and AWS Cost Explorer. Per-resource attribution, trend analysis, 30/60/90-day forecasts, anomaly detection, and right-sizing recommendations.

### 🛡️ Compliance & Drift Detection
Policy-as-code rules against CIS, SOC 2, HIPAA, and GDPR frameworks. Continuous scanning, drift detection for resources modified outside IaC, and auto-generated compliance reports.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Angular 17+ Frontend                   │
│  Dashboard │ Graph Viz │ Resources │ Costs │ Compliance  │
└─────────────────────┬───────────────────────────────────┘
                      │ REST / SignalR
┌─────────────────────┴───────────────────────────────────┐
│                  .NET 8 Web API Backend                    │
│  Discovery │ Graph Engine │ Cost Analyzer │ Compliance    │
└──────┬──────────────┬──────────────┬──────────────────────┘
       │              │              │
┌──────┴──────┐ ┌─────┴─────┐ ┌─────┴──────┐
│ Azure APIs  │ │ AWS APIs  │ │  Azure     │
│ (Resource   │ │ (Config,  │ │  OpenAI    │
│  Graph,     │ │  Cost     │ │  (GPT-4)   │
│  Cost,      │ │  Explorer,│ │            │
│  Monitor)   │ │  CloudTrail│ │            │
└─────────────┘ └──────────┘ └────────────┘
```

> See [docs/architecture.md](docs/architecture.md) for detailed architecture documentation.

---

## Quickstart

### Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Node.js 20+](https://nodejs.org/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Azure subscription with [Resource Graph](https://learn.microsoft.com/en-us/azure/governance/resource-graph/) access
- AWS account with [Config](https://aws.amazon.com/config/) enabled

### Local Development

```bash
# Clone the repository
git clone https://github.com/Brandonflex/Azure.git
cd Azure

# Start infrastructure services (Cosmos DB Emulator, Redis, etc.)
docker-compose up -d

# Start the backend
cd src/server
dotnet restore
dotnet run --project CloudScope.Api

# Start the frontend (in a new terminal)
cd src/client
npm install
ng serve
```

Open [http://localhost:4200](http://localhost:4200) to access CloudScope.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Angular 17+, TypeScript, Cytoscape.js, Chart.js, Angular Material |
| **Backend** | .NET 8, C# 12, ASP.NET Core Web API, MediatR, Clean Architecture |
| **Database** | Cosmos DB (Gremlin API), Azure SQL, Redis Cache |
| **AI/ML** | Azure OpenAI (GPT-4), Embeddings, RAG |
| **Cloud (Azure)** | Resource Graph, Cost Management, Service Bus, SignalR, Entra ID |
| **Cloud (AWS)** | Config, Cost Explorer, CloudTrail, CloudWatch, SDK for .NET |
| **DevOps** | GitHub Actions, Docker, Bicep, Terraform |
| **Testing** | xUnit, Moq, Angular Testing Library, Playwright |

---

## Repository Structure

```
CloudScope/
├── src/
│   ├── client/                    # Angular 17+ Frontend
│   │   └── src/app/
│   │       ├── core/              # Guards, interceptors, services
│   │       ├── features/          # Feature modules (dashboard, graph, etc.)
│   │       ├── shared/            # Shared components & pipes
│   │       └── layout/            # App shell & navigation
│   └── server/                    # .NET 8 Backend
│       ├── CloudScope.Api/        # Web API host
│       ├── CloudScope.Core/       # Domain models & interfaces
│       ├── CloudScope.Infrastructure/ # Cloud provider integrations
│       ├── CloudScope.GraphEngine/    # Graph traversal & analysis
│       └── CloudScope.Tests/      # Unit & integration tests
├── infra/
│   ├── bicep/                     # Azure IaC templates
│   └── terraform/                 # AWS IaC templates
├── .github/workflows/             # CI/CD pipelines
├── docs/                          # Architecture docs & screenshots
└── docker-compose.yml             # Local development environment
```

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with ☁️ by <a href="https://github.com/Brandonflex">Brandonflex</a>
</p>