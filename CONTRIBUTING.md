# Contributing to CloudScope

Thanks for taking the time to contribute. This project is a portfolio-grade
reference implementation, so clear, tested, boring changes are preferred over
clever ones.

## Quick start

```bash
git clone https://github.com/Brandonflex/Azure.git
cd Azure/src/client
npm ci
npm run preview:demo       # http://localhost:4300 — no Azure account needed
```

With the .NET SDK installed you can run the real API as well:

```bash
cd src/server
dotnet run --project CloudScope.Api    # http://localhost:5001/swagger
```

## Before you open a pull request

```bash
# Backend
dotnet build src/server/CloudScope.sln -c Release
dotnet test  src/server/CloudScope.sln -c Release

# Frontend
cd src/client
npm run lint
npm test
npm run build:prod
```

All four must pass; CI runs exactly these. Please also:

* keep new behaviour covered by a test (xUnit for the backend, Jasmine for the
  client) — a bug fix should come with the test that would have caught it;
* update the relevant doc in `docs/` if the change is user-visible;
* avoid new dependencies unless they remove more code than they add.

## Project layout

| Path | What lives there |
|------|------------------|
| `src/server/CloudScope.Core` | Domain models, enums, interfaces — no infrastructure dependencies |
| `src/server/CloudScope.Infrastructure` | Cloud providers, repositories, cost/compliance/AI services |
| `src/server/CloudScope.GraphEngine` | Graph traversal and blast-radius analysis |
| `src/server/CloudScope.Api` | Controllers, hub, hosted services, middleware |
| `src/server/CloudScope.Tests` | xUnit tests |
| `src/client/src/app/core` | Models, HTTP services, formatting helpers |
| `src/client/src/app/features` | One folder per screen |
| `src/client/mock-api` | Dependency-free demo API used by `npm run preview:demo` |
| `infra/` | Bicep (Azure) and Terraform (AWS discovery prerequisites) |
| `docs/` | Architecture, API reference, setup, deployment, roadmap |

## Commit messages

Use the imperative mood and explain *why*:

```
Bound the demo API request body so one client cannot exhaust it

A 50 MB JSON payload was buffered in full (RSS hit 257 MB). Bodies are now
capped at 64 KB with a 413 response.
```

## Style

* C# — nullable enabled, file-scoped namespaces, `async`/`await` throughout.
* TypeScript — strict mode, signals and `OnPush`, standalone components, no
  `any` in new code.
* SCSS — use the existing CSS variables (`--bg`, `--accent`, `--aws`, …) instead
  of hard-coded colours.
* Markdown — one sentence per line is not required; keep lines readable.

## Reporting bugs

Open an issue with the **Bug report** template. Include the commit, what you
expected, what happened, and how to reproduce it against the demo estate if
possible.

## Security

Do **not** open a public issue for a vulnerability — see [SECURITY.md](SECURITY.md).

## Code of conduct

Be respectful, assume good faith, and keep discussion technical. Harassment of
any kind is not tolerated.
