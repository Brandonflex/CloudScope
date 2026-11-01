# CloudScope — Deployment Guide

CloudScope ships as **one App Service** that hosts the .NET API and the Angular
SPA from the same origin. The SPA is published into the API's `wwwroot`, so
there is no separate Static Web App, no CORS configuration and no absolute API
URL to maintain.

## Required production gateway

Production now fails closed unless `GatewayAuthentication__SharedSecret` is
configured. The existing Azure deployment does not provision an identity-aware
gateway. Before deployment, provide a gateway that authenticates and authorizes
users, strips client-supplied `X-CloudScope-Gateway-Key` headers and injects the
private shared secret for every request, including SignalR WebSockets. Restrict
direct access to the backend and use TLS on both hops. `GET /health` is exempt
for health probes. See [SECURITY.md](../SECURITY.md#gateway-and-deployment-safeguards)
for setup requirements and limitations. The local Docker Compose demo opts out;
that opt-out must not be used with real cloud credentials.

## Prerequisites

| Purpose | Requirement |
|---------|-------------|
| Local development | .NET 8 SDK, Node.js 20+ |
| Azure deployment | Azure subscription (Contributor), Entra ID tenant, GitHub repository secrets |
| Live discovery (optional) | Azure subscription read access and/or AWS Config + Cost Explorer |
| AI query (optional) | Azure OpenAI resource with a `gpt-4`-class deployment |

## Local development

### 1. Frontend only (no .NET required)

```bash
cd src/client
npm ci
npm run preview:demo        # http://localhost:4300
```

This builds the SPA and serves it with the demo API from
`src/client/mock-api/server.mjs`. Use `npm run mock:api` + `npm run start:mock`
for hot reload on port 4200.

### 2. Full stack

```bash
# Terminal 1 — API
cd src/server
dotnet restore
dotnet run --project CloudScope.Api    # http://localhost:5001, Swagger at /swagger

# Terminal 2 — SPA
cd src/client
npm ci
npm start                              # http://localhost:4200, proxies /api and /hubs
```

No credentials are needed. `Platform:SeedDemoData` defaults to `true` and the
bundled estate is seeded on startup when no cloud provider is configured.

### 3. Configuration

`appsettings.json` holds safe defaults. For local overrides:

```bash
cp src/server/CloudScope.Api/appsettings.Development.template.json \
   src/server/CloudScope.Api/appsettings.Development.json
```

`appsettings.Development.json` is git-ignored. Prefer user secrets for values
that must never be committed:

```bash
dotnet user-secrets init --project src/server/CloudScope.Api
dotnet user-secrets set "Azure:SubscriptionId" "<id>" --project src/server/CloudScope.Api
dotnet user-secrets set "AzureOpenAI:ApiKey" "<key>" --project src/server/CloudScope.Api
dotnet user-secrets set "AWS:AccessKeyId" "<key>" --project src/server/CloudScope.Api
dotnet user-secrets set "AWS:SecretAccessKey" "<secret>" --project src/server/CloudScope.Api
```

Key settings:

| Setting | Default | Purpose |
|---------|---------|---------|
| `Platform:StorageProvider` | `InMemory` | Set to `Cosmos` (with `CosmosDb:Endpoint`/`Key`) to persist |
| `Platform:SeedDemoData` | `true` | Load the demo estate when no providers are configured |
| `Discovery:IntervalMinutes` | `15` | Background discovery cadence |
| `Swagger:Enabled` | `true` | Swagger UI at `/swagger` |
| `Cors:AllowedOrigins` | empty | Only needed if the SPA is hosted separately |
| `AzureOpenAI:DeploymentName` | `gpt-4` | Must match a deployment in your OpenAI resource |

## Docker

Dependencies only (Cosmos emulator, Redis, Azure SQL Edge):

```bash
docker compose up -d
```

Full application stack (API + nginx-served SPA + Redis):

```bash
docker compose --profile app up --build
```

| Service | URL |
|---------|-----|
| SPA | http://localhost:8089 |
| API | http://localhost:8080/swagger (when `Swagger:Enabled=true`) |

The compose application profile runs with `StorageProvider=InMemory` and demo
seeding enabled, so it works without cloud credentials. Both images are built
from `src/server/Dockerfile` and `src/client/Dockerfile`; the API runs as a
non-root user with a `HEALTHCHECK`.

## Deploying to Azure

The optional Azure infrastructure pipeline `.github/workflows/deploy-azure.yml`
runs **only by manual dispatch** and requires explicit acknowledgment that it can
create billable resources. It is not used by the Vercel/Render setup. Do not run
it if you do not accept potential charges.

### Required GitHub secrets

| Secret | Description |
|--------|-------------|
| `AZURE_CREDENTIALS` | Service principal JSON for `azure/login` (`Contributor` on the resource group) |
| `AZURE_AD_TENANT_ID` | Entra ID tenant id |
| `AZURE_AD_CLIENT_ID` | App registration client id (reserved for authentication) |
| `APP_SERVICE_NAME` | Name of the App Service created by the Bicep template |

The Static Web App token is no longer needed — the SPA is embedded in the API.

### What gets deployed

1. `infra/bicep/main.bicep` creates:
   * App Service (Linux, .NET 8) with a system-assigned managed identity
   * Cosmos DB **SQL API** database `CloudScope` with `Resources` (`/provider`)
     and `Graph` (`/sourceResourceId`) containers
   * Azure Cache for Redis
   * Azure OpenAI
   * Application Insights
   * Key Vault
2. The workflow builds the SPA (`ng build --configuration production`), copies
   `dist/cloudscope/browser` into `src/server/CloudScope.Api/wwwroot`, publishes
   the API with a build-stamped version, zips it and deploys with
   `az webapp deployment source config-zip`.
3. A smoke test requests `/health` and `/` and asserts the CloudScope title.

### After the first deployment

* Set `Azure:SubscriptionId` (+ credentials or use the App Service managed
  identity) and/or `AWS:*` as App Service settings to enable live discovery.
  Until then, set `Platform:SeedDemoData=true` for a populated UI.
* Create an Azure OpenAI model deployment and set
  `AzureOpenAI:DeploymentName` to match; otherwise the local query engine
  answers.
* Confirm `/api/meta` reports the expected storage provider and counts.

### Verifying a deployment

```bash
curl https://<app>.azurewebsites.net/health
curl -s https://<app>.azurewebsites.net/api/meta
curl -sI https://<app>.azurewebsites.net/dashboard   # 200 text/html
```

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `/dashboard` 404 after deploy | `wwwroot/index.html` was not staged before publish — check the "Stage SPA" step |
| App starts in InMemory mode | `CosmosDb:Endpoint`/`Key` missing or `StorageProvider` not `Cosmos`; check `/api/meta` |
| `Invalid URL` or SPA served for `/api/...` | The demo host is running, not the .NET API |
| `Cannot connect to SignalR` in demo mode | Expected: the demo host returns 501 for `/hubs/*`; run the .NET API |
| Redirect loop (`ERR_TOO_MANY_REDIRECTS`) | `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` is set in code via `UseForwardedHeaders`; ensure the App Service front end is in front of the app |
| Cosmos 404 on containers | Run the Bicep deployment again; containers are created by the template |

## Cost notes

The template no longer provisions SQL Server, Service Bus, SignalR Service or a
Static Web App — none were used by the application. The remaining footprint is
the App Service plan, Cosmos DB (serverless-capable), Redis, OpenAI (only if
used) and Application Insights.
