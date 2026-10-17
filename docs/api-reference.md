# CloudScope — API Reference

> This document will be auto-generated from OpenAPI/Swagger specs once the backend is running.

## Base URL

```
Development: https://localhost:5001
Production:  https://api.cloudscope.dev
```

## Authentication

All API endpoints require a valid JWT bearer token from Azure Entra ID.

```
Authorization: Bearer <token>
```

## Endpoints (Planned)

### Resources

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/resources` | List all discovered resources |
| `GET` | `/api/resources/{id}` | Get resource by ID |
| `GET` | `/api/resources/{id}/relationships` | Get resource dependencies |
| `POST` | `/api/resources/discover` | Trigger resource discovery |
| `GET` | `/api/resources/blast-radius/{id}` | Get blast radius analysis |

### Graph

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/graph` | Get full dependency graph |
| `GET` | `/api/graph/subgraph/{resourceId}` | Get subgraph around a resource |
| `GET` | `/api/graph/paths` | Find paths between two resources |

### Costs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/costs/summary` | Get cost summary (Azure + AWS) |
| `GET` | `/api/costs/trends` | Get cost trends over time |
| `GET` | `/api/costs/forecast` | Get cost forecast |
| `GET` | `/api/costs/anomalies` | Get detected cost anomalies |

### Compliance

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/compliance/status` | Get compliance posture |
| `GET` | `/api/compliance/reports/{framework}` | Get report for a framework |
| `POST` | `/api/compliance/scan` | Trigger compliance scan |

### AI Query

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/query/ask` | Ask a natural language question |
| `GET` | `/api/query/suggestions` | Get query suggestions |

### Notifications (SignalR Hub)

| Hub | Events |
|-----|--------|
| `/hubs/notifications` | `resourceDiscovered`, `complianceViolation`, `costAnomaly`, `scanProgress` |