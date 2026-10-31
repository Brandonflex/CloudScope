# Security Policy

CloudScope is a demonstration/reference platform. Production requires an
identity-aware gateway; CloudScope verifies a gateway secret but does **not**
authenticate or authorize individual users itself. Do not attach real cloud
credentials until the gateway, network isolation and access policies are in place.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private reporting: **Security → Report a vulnerability** on this
repository
([direct link](https://github.com/Brandonflex/Azure/security/advisories/new)).

Include the affected version/commit, a description, reproduction steps, and the
impact you believe it has. You can expect an acknowledgement within a few days.

## Supported versions

Only the latest commit on `main` receives fixes.

## What is in scope

* The .NET API (`src/server`) — request handling, discovery, storage access,
  the query engine, and compliance evaluation.
* The Angular SPA (`src/client/src`) — XSS, unsafe DOM use, token or secret
  leakage.
* Infrastructure as code (`infra/`) — exposed secrets, overly broad roles,
  public network exposure in the templates.
* CI workflows (`.github/workflows/`) — injection via PR titles or branches.

## What is out of scope

* The demo host (`src/client/mock-api/server.mjs`) has no authentication or
  rate limiting and is a local development tool. The Vercel adapter uses it only
  for fictional demo data in preview deployments; keep Vercel Deployment
  Protection enabled and configure platform rate limits. Never attach real
  cloud credentials or expose it as a production service. The optional
  Groq/Gemini preview integration sends questions, up to three recent
  exchanges and fictional context to configured providers (both may
  receive a question if failover occurs). Google free-tier content may be used
  to improve its products. Do not enter secrets or sensitive information. Keep
  provider keys in Vercel's Preview-only secret settings, use free-tier accounts
  without billing, configure platform rate limits, and retain deployment
  protection. The app cannot verify provider billing plans. AI output is
  untrusted and may be incorrect.
* Missing built-in user authentication — user identity and authorization are
  delegated to the operator-provided identity-aware gateway.

## Secrets

No credentials are committed. `appsettings.json` contains empty placeholders;
local overrides use `dotnet user-secrets`; deployment supplies values through
App Service settings. If you believe a secret has been committed, report it
privately and rotate the credential immediately.

## Gateway and deployment safeguards

In Production the API fails to start unless `GatewayAuthentication:SharedSecret`
is configured. Set `GatewayAuthentication__SharedSecret` to a cryptographically
random secret of at least 32 bytes (for example, the output of
`openssl rand -hex 32`), using the deployment platform's secret store. Do not
put this secret in browser code, Git, or client-facing responses.

An operator must deploy and configure an **identity-aware gateway** in front of
the app. It must authenticate and authorize users for every SPA, API and SignalR
request, including WebSocket upgrades, remove any incoming
`X-CloudScope-Gateway-Key` header, and inject its own shared secret in that
header on every request it forwards. The API verifies this secret on all paths
(including static files and the SignalR hub) except `GET /health`. A valid secret
only identifies the gateway: it does not identify a user or provide per-user
roles. Never rely on the secret as a substitute for user authentication.

Restrict direct network access to the backend to the gateway and health probe;
use TLS on both network hops and rotate the secret when it may be compromised.
A malicious or misconfigured gateway can bypass this protection. Existing Azure
infrastructure does **not** provision the identity-aware gateway or its secret;
configure both before deploying this version or production will not start.
Development and the Docker Compose demo disable gateway authentication; never
use that opt-out with real cloud data. Compose also requires a strong
`MSSQL_SA_PASSWORD`; infrastructure service ports bind to localhost. The app
ports are not authentication boundaries.

Forwarded headers are accepted only from framework-default loopback proxies and
IPs configured in `ForwardedHeaders:KnownProxies` (for example via
`ForwardedHeaders__KnownProxies__0`). Configure the actual immediate proxy IPs
when deploying behind a reverse proxy; do not trust arbitrary client addresses.
Production CORS origins must be explicitly configured in `Cors:AllowedOrigins`.
