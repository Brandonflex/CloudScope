# Security Policy

CloudScope is a demonstration/reference platform. It ships with **no
authentication enabled** by default (see the roadmap) and should not be exposed
to the public internet with real cloud credentials attached until that work is
complete.

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

* The demo host (`src/client/mock-api/server.mjs`) has no authentication, no
  rate limiting and is explicitly a local development tool. Do not run it on a
  public interface.
* Missing authentication on the API — it is a documented, deliberate phase-1
  limitation, not a vulnerability report.

## Secrets

No credentials are committed. `appsettings.json` contains empty placeholders;
local overrides use `dotnet user-secrets`; deployment supplies values through
App Service settings. If you believe a secret has been committed, report it
privately and rotate the credential immediately.

## Deployment safeguards

The API and SignalR hub still have **no authentication or authorization**. Do
not expose them or attach real credentials without a trusted identity-aware
proxy, network isolation, TLS, and access controls for both HTTP and WebSockets.
The sample Docker Compose stack is for local development only. Set a strong
`MSSQL_SA_PASSWORD` before starting it; infrastructure service ports bind to
localhost. The app ports are not authentication boundaries.

Forwarded headers are accepted only from framework-default loopback proxies and
IPs configured in `ForwardedHeaders:KnownProxies` (for example via
`ForwardedHeaders__KnownProxies__0`). Configure the actual immediate proxy IPs
when deploying behind a reverse proxy; do not trust arbitrary client addresses.
Production CORS origins must be explicitly configured in `Cors:AllowedOrigins`.
