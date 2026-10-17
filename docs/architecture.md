# CloudScope — Architecture Decision Records

## Overview

CloudScope is a multi-cloud infrastructure intelligence platform built with a clean, modular architecture. This document describes the high-level architecture, key design decisions, and how the components interact.

## Architecture Principles

1. **Clean Architecture** — Domain logic is isolated from infrastructure concerns
2. **Event-Driven** — Services communicate via events where possible
3. **Multi-Cloud by Design** — Abstraction layers allow seamless Azure + AWS integration
4. **Real-Time First** — SignalR pushes live updates to the Angular dashboard
5. **AI-Augmented** — Azure OpenAI enhances (not replaces) structured queries

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Angular 17+ SPA (Port 4200)                 │    │
│  │                                                          │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │    │
│  │  │Dashboard │ │  Graph   │ │ Resource │ │   Cost     │ │    │
│  │  │ Overview │ │Visualizer│ │Inventory │ │ Intelligence│ │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                │    │
│  │  │Compliance│ │ NL Query │ │ Blast    │                │    │
│  │  │ Reports  │ │  Chat    │ │ Radius   │                │    │
│  │  └──────────┘ └──────────┘ └──────────┘                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          │ REST + SignalR                        │
└──────────────────────────┼──────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                     API GATEWAY LAYER                             │
│                           │                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │         ASP.NET Core Web API (Port 5000)                 │    │
│  │                                                          │    │
│  │  Controllers → MediatR → Handlers → Services             │    │
│  │                                                          │    │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────┐  │    │
│  │  │  Auth       │  │ Rate       │  │  Exception       │  │    │
│  │  │  Middleware │  │ Limiting   │  │  Handling        │  │    │
│  │  └────────────┘  └────────────┘  └──────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────┼──────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                   APPLICATION LAYER                               │
│                           │                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐    │
│  │  Resource    │ │    Graph     │ │    Cost              │    │
│  │  Discovery   │ │    Engine    │ │    Intelligence      │    │
│  │  Service     │ │    Service   │ │    Service           │    │
│  └──────┬───────┘ └──────┬───────┘ └──────────┬───────────┘    │
│         │                │                     │                 │
│  ┌──────┴───────┐ ┌──────┴───────┐ ┌──────────┴───────────┐    │
│  │ Compliance   │ │    AI        │ │    Notification       │    │
│  │ Scanner      │ │    Service   │ │    Service            │    │
│  └──────────────┘ └──────────────┘ └───────────────────────┘    │
└──────────────────────────┼──────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│               INFRASTRUCTURE LAYER                                │
│                           │                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐    │
│  │  Azure       │ │    AWS       │ │    Data              │    │
│  │  SDK         │ │    SDK       │ │    Access            │    │
│  │  Clients     │ │    Clients   │ │    (EF Core/Gremlin) │    │
│  └──────────────┘ └──────────────┘ └──────────────────────┘    │
└──────────────────────────┼──────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                    DATA LAYER                                     │
│                           │                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐    │
│  │  Cosmos DB   │ │  Azure SQL   │ │    Redis Cache       │    │
│  │  (Gremlin)   │ │  (Metadata)  │ │    (Hot Data)        │    │
│  │  Graph Store │ │              │ │                      │    │
│  └──────────────┘ └──────────────┘ └──────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### ADR-001: Graph Database for Resource Relationships
**Decision:** Use Cosmos DB with Gremlin API as the primary graph store.
**Rationale:** Cloud resources and their relationships form a natural graph. Traversal queries ("what depends on this?") are O(1) in a graph DB vs O(n) joins in relational DBs.
**Trade-off:** Adds Cosmos DB dependency; mitigated by emulator for local dev.

### ADR-002: Clean Architecture (Onion/Hexagonal)
**Decision:** Separate domain (Core) from infrastructure via interfaces.
**Rationale:** Cloud provider SDKs change frequently. Clean boundaries allow swapping Azure/AWS implementations without touching domain logic.
**Trade-off:** More files/folders upfront; pays off in testability and maintainability.

### ADR-003: MediatR for CQRS
**Decision:** Use MediatR to implement Command/Query Responsibility Segregation.
**Rationale:** Keeps controllers thin; each use case is a self-contained handler. Easy to add cross-cutting concerns (logging, validation, auth) via pipeline behaviors.
**Trade-off:** Indirection; mitigated by clear naming conventions.

### ADR-004: Angular Standalone Components + Signals
**Decision:** Use Angular 17+ standalone components with signals for state management.
**Rationale:** Standalone components eliminate NgModules boilerplate. Signals provide fine-grained reactivity without RxJS complexity for simple state.
**Trade-off:** Signals are still evolving in Angular; RxJS remains for complex async flows.

### ADR-005: Cytoscape.js for Graph Visualization
**Decision:** Use Cytoscape.js over D3.js for the dependency graph.
**Rationale:** Cytoscape is purpose-built for graph/network visualization. Better performance with 1000+ nodes, built-in layouts, and cleaner API for graph operations.
**Trade-off:** Less customizable than raw D3; sufficient for our use case.

### ADR-006: Azure Service Bus for Event Mesh
**Decision:** Use Azure Service Bus for inter-service communication.
**Rationale:** Decouples services, enables async processing of resource sync jobs, and provides dead-letter queues for error handling.
**Trade-off:** Azure-specific; acceptable since primary cloud is Azure. AWS SNS/SQS adapter can be added later.

### ADR-007: SignalR for Real-Time Updates
**Decision:** Use Azure SignalR Service for pushing live updates to the Angular frontend.
**Rationale:** Resource discovery, compliance scans, and cost updates are long-running operations. SignalR provides instant feedback without polling.
**Trade-off:** Adds WebSocket complexity; mitigated by Angular's built-in SignalR client.

## Data Flow: Resource Discovery

```
1. User triggers discovery (or scheduled job fires)
2. API dispatches DiscoverResourcesCommand via MediatR
3. Handler calls:
   a. AzureResourceGraphService.QueryResources() → Azure Resource Graph API
   b. AwsConfigService.QueryResources() → AWS Config API
4. Results are mapped to domain models (CloudResource, ResourceRelationship)
5. Resources upserted into Cosmos DB (Gremlin graph)
6. Relationships upserted as graph edges
7. ResourceSyncCompleted event published to Service Bus
8. NotificationService pushes update to Angular via SignalR
9. Graph component refreshes with new data
```

## Security Model

- **Authentication:** Azure Entra ID (OIDC) for SSO
- **Authorization:** Role-based (Admin, Viewer, Auditor)
- **API Security:** JWT bearer tokens, rate limiting, CORS
- **Secrets:** Azure Key Vault (prod), User Secrets (dev)
- **Data:** Encrypted at rest (Cosmos DB, SQL) and in transit (TLS)

## Deployment Architecture

- **Frontend:** Azure Static Web Apps (or Azure CDN + Blob Storage)
- **Backend:** Azure App Service (or AKS for scale)
- **Database:** Cosmos DB (Gremlin), Azure SQL, Azure Cache for Redis
- **AI:** Azure OpenAI Service
- **Messaging:** Azure Service Bus
- **Real-time:** Azure SignalR Service
- **IaC:** Bicep (Azure) + Terraform (AWS)
- **CI/CD:** GitHub Actions