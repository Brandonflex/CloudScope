# CloudScope — Roadmap to a Shippable v1.0

> Status snapshot: 2026-10-19, after the first P0 pass. The product is
> feature-complete against the proposal and demonstrable end-to-end without
> credentials. The deployment blockers below are fixed in the repository;
> authentication and the deeper quality work remain. Each item names the
> file(s) to touch and the acceptance criteria.

## P0 progress

| Item | Status | Notes |
|------|--------|-------|
| 1.1 Publish artefact | ✅ Done | Workflow zips `publish/`, stamps the version, deploys and smoke-tests |
| 1.2 Cosmos API mismatch | ✅ Done | Bicep now creates SQL API database + `Resources`/`Graph` containers and wires app settings |
| 1.3 Static Web App | ✅ Superseded | The SPA is published into the API `wwwroot`; one origin, no SWA token or fallback rules |
| 1.4 Demo host fallback | ✅ Done | Missing assets 404; `/hubs/*` returns a clear 501; API 404s stay JSON |
| 1.5 CI honesty | ✅ Done | ESLint added and blocking; unit tests blocking; duplicate CodeQL job removed |
| 1.6 Secret/env wiring | ✅ Done | `appsettings.Development.template.json` + `appsettings.Production.json` |
| 1.7 Containers | ✅ Done | Multi-stage API and SPA images, nginx proxy, `--profile app` compose stack |

Manual steps that cannot be done from a code change are collected in
[SETUP.md](SETUP.md): enabling code scanning, creating the Azure service
principal and storing the three repository secrets.

Not validated locally: Bicep compilation, `dotnet build`, Docker image builds
and the GitHub deployment (no Azure credentials, .NET SDK or Docker daemon in
this environment). CI validates Bicep, builds/tests the backend and builds the
frontend; a `workflow_dispatch` run of the deploy workflow is the remaining
verification step.

Effort key: **S** ≤ 1 day · **M** 2–3 days · **L** 1–2 weeks.

---

## 0. Where we are

| Area | State | Evidence |
|------|-------|----------|
| Feature surface | ✅ Complete | 6 screens, 19 REST routes, 51 backend tests |
| Demo experience | ✅ Complete | `npm run preview:demo`, 54 resources, all screens populated |
| Local full stack | ✅ Works | `dotnet run` + `ng serve` + proxy configs |
| CI (build/test) | ⏳ Re-run pending | P0 changes add lint, unit tests and a production build to the gate |
| CI (security) | ❌ Red (repo config) | Duplicate job removed; code scanning must be enabled in repository settings |
| Deployment pipeline | ✅ Fixed, unverified | Artefact produced and deployed; Bicep matches the runtime store |
| Production hardening | ⚠️ Partial | Forwarded headers, production config and containers added; auth/rate limiting pending |
| Automated test depth | ⚠️ Improved | ESLint + 20 unit specs now blocking; integration and E2E still missing |
| Documentation | ✅ Rewritten | README, architecture, API reference, implementation map |

---

## 1. P0 — Blockers (must fix before any real deployment)

### 1.1 Deploy workflow publishes nothing — **S** ✅

`.github/workflows/deploy-azure.yml` runs `dotnet publish … --output ./publish`
and then uploads `--src ./publish.zip`, a file that is never created.

**Fix:** either
```yaml
- name: Zip artefact
  run: cd publish && zip -r ../publish.zip .
```
or replace the step with `azure/webapps-deploy@v3` and `package: ./publish`
(it handles zip/OneDeploy and restarts the app). Add `--no-restore` after an
explicit restore, and stamp the build number into `AssemblyVersion` so
`/health` reports the deployed revision.

**Done when:** a manual `workflow_dispatch` run deploys and `/health` returns the
commit SHA.

### 1.2 Bicep provisions the wrong Cosmos API — **M** ✅

`infra/bicep/main.bicep` creates a **Gremlin** account
(`capabilities: EnableGremlin`, `gremlinDatabases/graphs`), while the backend
uses the **SQL API** with `Resources` and `Graph` containers
(`CloudScope.Infrastructure/Persistence/CosmosDatabase.cs`). Deploying this
template yields an account the app cannot use. Additionally, SQL Server,
Service Bus, SignalR Service and Redis are provisioned but never wired into the
App Service configuration.

**Fix:** switch the Cosmos resource to SQL API (`Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers`
with `/provider` and `/sourceResourceId` partition keys, matching the
repositories), and emit the connection settings into the Web App via
`siteConfig.appSettings` using Key Vault references plus a system-assigned
managed identity with `Key Vault Secrets User`.

**Done when:** `az deployment group what-if` matches the runtime expectations and
a deployed instance reports `storageProvider: Cosmos` with data surviving a
restart.

### 1.3 Static Web App deploy is wrong and has no SPA fallback — **S** ✅ *(superseded: single-origin hosting)*

`deploy-frontend` points Oryx at `src/client` (re-building the app with an
unrelated toolchain) and ships no routing rules, so `/dashboard`, `/graph`, …
return 404 on refresh.

**Fix:** build in CI, deploy `dist/cloudscope/browser` with
`skip_app_build: true`, and add `public/staticwebapp.config.json`:
```json
{
  "navigationFallback": { "rewrite": "/index.html", "exclude": ["/api/*", "/*.{js,css,ico,png,svg,woff2}"] },
  "globalHeaders": { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" }
}
```
Also set `environment.production.ts` `apiUrl` from a build-time replacement
(`ng build --define`/`fileReplacements` per environment) instead of relying on
same-origin hosting.

### 1.4 Demo server masks errors and breaks SignalR — **S** ✅

`src/client/mock-api/server.mjs` falls back to `index.html` for **every**
unmatched path: `/missing.js` → 200 HTML, `/hubs/notifications/negotiate` → 200
HTML (the SPA then fails to connect with a confusing error), and unknown
`/api/*` routes can never surface as real 404s.

**Fix:** only rewrite extension-less `GET` requests that accept HTML; return
`404 application/json` for `/api/*` and `/hubs/*`; add `POST /hubs/notifications/negotiate`
returning a stub negotiation payload (or an explicit 501 with a clear message)
so the UI shows "live updates unavailable in demo" instead of a parse error.

### 1.5 CI is partly theatre — **M** ✅

* `ng lint` has no builder configured — the script always throws and `|| true`
  hides it.
* `ng test --browsers=ChromeHeadless || true` hides real failures, and there is
  exactly one spec (`app.component.spec.ts`).
* `.github/workflows/ci.yml` runs a second CodeQL job that duplicates
  `codeql.yml`; both fail for repository-configuration reasons.

**Fix:** add `@angular-eslint` (`ng add @angular-eslint/schematics`), commit
`eslint.config.js`, make lint blocking. Make tests blocking once 1.6 lands.
Delete the `security` job from `ci.yml` and keep `codeql.yml` as the single
owner; enable code scanning in repository settings and add a manual build step
for C# (`dotnet build src/server/CloudScope.sln`) instead of autobuild.

### 1.6 No secret or environment wiring — **M** ✅

`appsettings.json` ships empty placeholders and there is no
`appsettings.Production.json`; the deployment guide references
`appsettings.Development.template.json` which does not exist.

**Fix:** commit `appsettings.Development.template.json` (empty values, safe to
share), add `appsettings.Production.json` with Key Vault/App Configuration
references, and document `dotnet user-secrets` in the README (already referenced
by the guide).

### 1.7 No container build path — **S** ✅

`docker-compose.yml` brings up dependencies only, and the deployment guide
implies containers exist. Add a multi-stage `Dockerfile` for the API
(`mcr.microsoft.com/dotnet/sdk:8.0` → `aspnet:8.0`, non-root, `HEALTHCHECK`),
a `Dockerfile` for the SPA (`node:20` → `nginx:alpine` with `try_files`), and a
`compose.yaml` profile `app` that runs the full stack with `depends_on:
condition: service_healthy`.

---

## 2. P1 — Production hardening

### 2.1 Authentication and authorization — **L**

Wire Entra ID end-to-end: `Microsoft.Identity.Web` in the API
(`AddMicrosoftIdentityWebApi`), policy-based authorization on controllers,
`[Authorize]` by default with explicit `[AllowAnonymous]` on `/health` and
`/swagger`, and `@azure/msal-angular` in the SPA with an HTTP interceptor that
attaches the token. Add an `ICurrentUser` abstraction and record the actor on
discovery scans and compliance runs.

**Done when:** unauthenticated calls to `/api/resources` return 401, the SPA
signs in silently, and `/swagger` can be hidden by configuration.

### 2.2 Service hardening — **M**

* `AddRateLimiter` (fixed window per IP/user, tighter on `POST /api/query/ask`
  and `/discover`).
* `AddResponseCompression` (brotli/gzip for JSON).
* `UseHsts`, `ForwardedHeaders` (behind App Service/SWA), and security headers
  middleware (`X-Content-Type-Options`, `Referrer-Policy`, CSP for Swagger).
* `AddProblemDetails` + `IExceptionHandler` so 500s are RFC 7807 with a trace id
  (the current middleware returns an ad-hoc shape).
* Replace the inline `/health` lambda with `AddHealthChecks().AddCheck<StorageHealthCheck>("storage")`
  plus `/health/live` and `/health/ready`.

### 2.3 Observability — **M**

OpenTelemetry (`AddOpenTelemetry().WithTracing().WithMetrics()`) exporting to
Application Insights; Serilog enrichers (`WithCorrelationId`, `WithRequestId`);
a `TraceId` returned on every error and shown in the SPA's error toast. Add a
couple of source-generated metrics (discovery duration, resources by provider,
query latency by source) so dashboards have signal on day one.

### 2.4 Frontend resilience — **M**

* Global `HttpInterceptorFn`: timeout (15 s), one retry with exponential backoff
  for idempotent GETs, correlation id header, and mapping to a typed
  `ApiError`.
* Route-level error handling: a shared `ErrorStateComponent` instead of silent
  `error: () => …` callbacks that currently only stop spinners.
* `navigator.onLine` banner and a "retry" affordance; SignalR connection state
  surfaced consistently (the shell already tracks it).
* Skeleton loaders for the dashboard and tables (spinners are the current
  fallback).

### 2.5 Test pyramid — **L**

| Layer | Add | Target |
|-------|-----|--------|
| API integration | `WebApplicationFactory<Program>` tests for paging, filtering, 404s, query intents, compliance scan | 25 tests |
| Persistence | Cosmos emulator test fixture (container per run) or a Testcontainers setup | 8 tests |
| Frontend unit | services with `HttpTestingController`, formatters, dialog logic | 30 specs |
| E2E | Playwright against `mock:api` + built SPA: navigate all routes, assert key numbers, run `@axe-core/playwright` | 8 flows |

**Done when:** CI blocks on all four layers and the default `ng test` is no
longer a fake spec.

### 2.6 Accessibility — **M**

Add a skip link, `main` landmark, focus return after MatDialog close, `aria-live`
for toasts and load states, `aria-label` on icon-only buttons, a keyboard-usable
table view as an alternative to the Cytoscape canvas, and a contrast audit of
`--muted` text on `--bg-elevated`. Run axe in the E2E suite so it cannot regress.

### 2.7 Performance — **S/M**

Production build is 668 kB raw / 155 kB transfer initial — inside the 750 kB
budget, but the graph chunk is 508 kB. Use `@defer` for the graph and the
cost charts, add `PreloadAllModules` with a route-level `data: { preload: false }`
escape hatch for the graph, lazy-load Cytoscape only when the graph route is
visited (already route-scoped, verify tree-shaking), and enable
`withViewTransitions()`. Add a Lighthouse CI budget job (perf ≥ 90 on the demo
build).

---

## 3. P2 — Capability upgrades

### 3.1 Cost intelligence — **L**

Replace inventory-derived estimates with real data: Azure Cost Management
`UsageDetails` exports (or the `Microsoft.CostManagement` query API) and AWS CUR
via Athena, attributed to resource ids via `ResourceId`/`resourceTags` joins.
Add tag-based allocation (team, application, cost centre), budget thresholds with
alerts through the notification hub, and a what-if savings planner on top of the
recommendation list.

### 3.2 Compliance as configuration — **M**

Move the 16 rules out of `CompliancePolicyCatalog.cs` into embedded
`policies/*.json` (id, framework, severity, selector, predicate DSL, remediation
URL), keeping the C# evaluator for the built-in predicates. This enables custom
policies without a redeploy, and is a prerequisite for the next two items.

* Evidence export (CSV + PDF per framework) for auditors.
* Waivers/exceptions with expiry and justification, surfaced in reports.
* Scheduled scans with drift diffing (`+3 new findings since yesterday`).

### 3.3 AI query — **M**

Stream responses over SignalR/SSE so answers appear progressively; add
tool-calling so the model can call `/api/costs/*`, `/api/resources` and blast
radius instead of receiving a static context blob; capture thumbs-up/down with
the question + chosen path in a feedback table; add an offline evaluation set
(30 questions with expected intents) that runs in CI.

### 3.4 Discovery breadth — **M**

Multi-subscription and AWS organization fan-out (`--subscription` list,
`assume-role` per account), AWS edge derivation without requiring `AWS:AccountId`,
Azure tag inheritance from resource groups, and an incremental change feed
(Resource Graph `changes` API) rather than full re-scan.

### 3.5 Notifications and integrations — **S/M**

Route critical findings to Slack/Teams/email webhooks with digest + threshold
rules; configure the SignalR Redis backplane (the package is referenced but
never wired) so the API can scale past one instance; add a generic outbound
webhook with HMAC signing.

### 3.6 Export and saved views — **M**

CSV/JSON export on every table endpoint (`Accept: text/csv` content negotiation
or `?format=csv`), PDF report generation for cost and compliance, saved
filter/query state in the URL so views are shareable, and per-user pinning of
dashboard tiles.

---

## 4. P3 — Polish

**Repository hygiene (S)**
`.editorconfig`, `Directory.Build.props` with `TreatWarningsAsErrors` +
`AnalysisLevel=latest-recommended` for the solution, `dotnet format --verify-no-changes`
in CI, Prettier + ESLint for the client, Dependabot/Renovate, `CHANGELOG.md`,
semantic-release or a tag-driven release workflow producing a published API
archive and a versioned SPA bundle.

**Storytelling (S)**
Real screenshots and a 20-second GIF in `docs/screenshots/` referenced from the
README (the previous banner reference was removed because the asset did not
exist); an OG image; a short "demo in 60 seconds" section; a deployed demo URL.

**Demo UX (S/M)**
Guided tour on first visit, a "reset demo estate" action wired to
`POST /api/meta/demo`, deep links into resources from dashboard tiles, empty and
error states that suggest the next action, and undo on destructive actions.

**Visual polish (M)**
Skeletons instead of spinners, consistent 8-pt spacing and card elevation,
light theme + `prefers-color-scheme`, reduced-motion support, a print stylesheet
for cost/compliance reports, and a responsive pass at 375/768/1024 px (the shell
collapses correctly today; tables and the graph need attention).

**Developer experience (S)**
A `devcontainer.json`, `CONTRIBUTING.md` refreshed with the new commands,
issue/PR templates, and a `docs/` site (or at least a docs index) so the four
markdown files are discoverable.

---

## 5. Suggested sequence

| Sprint | Goal | Items | Outcome |
|--------|------|-------|---------|
| **1** (week 1) | Make deployment real | 1.1, 1.2, 1.3, 1.4, 1.7 | A one-click deploy lands a working, demo-seeded instance |
| **2** | Trust the pipeline | 1.5, 1.6, 2.5 (API integration + E2E), 2.2 | Required checks are honest and meaningful |
| **3** | Secure it | 2.1, 2.3, 2.4 | Entra ID sign-in, traceable errors, resilient UI |
| **4** | Quality gate | 2.5 (frontend unit), 2.6, 2.7 | Accessible, fast, regression-proof |
| **5** | Deepen the value | 3.1, 3.2 | Real costs and configurable compliance |
| **6** | Intelligence + reach | 3.3, 3.4, 3.5, 3.6 | Streaming AI, multi-account, integrations, exports |
| **7** | Ship | P3 (all) | Public v1.0 with screenshots, docs and a demo URL |

Rough total: **6–8 weeks** for one experienced full-stack engineer, or **3–4
weeks** for two (split backend/infra vs frontend/quality).

---

## 6. Definition of done for v1.0

- [ ] `git push` to `main` deploys API + SPA with no manual steps and no stored secrets.
- [ ] Deep-linking any route on the deployed SPA works; API 404s are JSON.
- [ ] Every API endpoint requires a token; `/health/live` and `/health/ready` are anonymous.
- [ ] `/api/meta` reports the deployed commit, and errors carry a trace id.
- [ ] CI is green with lint, unit, integration and E2E all blocking.
- [ ] Cosmos-backed deployment survives a restart with data intact.
- [ ] Lighthouse ≥ 90 performance, axe clean on all six routes.
- [ ] README shows real screenshots and links to a live demo.
