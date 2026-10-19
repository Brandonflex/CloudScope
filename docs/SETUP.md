# CloudScope — Setup: what you actually have to do

Everything code-related is already done and committed. What remains needs a
human with repository-admin or Azure-subscription rights: **you**.

There are three tracks. You can stop after any of them.

| Track | Goal | Time | Needs |
|-------|------|------|-------|
| **A** | See the app running | 2 minutes | Node 20+ |
| **B** | Green checkmarks on the pull request | 2 minutes | GitHub repo admin |
| **C** | A real URL on Azure | ~20 minutes | Azure subscription (~$30/mo) |

---

## What does it cost?

**Nothing, unless you choose to host it on Azure.**

| Thing | Cost |
|-------|------|
| Running it locally (Track A) | **$0, forever.** Demo data, all six screens, AI query, compliance, costs — no account, no key, no database |
| Running the real .NET backend locally | **$0.** In-memory storage and the offline query engine are the default |
| GitHub Actions + Pages | **$0** on a public repository (unlimited minutes) |
| CodeQL | **$0** on a public repository; **~$30/committer/month** on a private one (needs a Team plan) |
| Hosting it publicly on Azure | **~$30/month** with the `demo` profile, ~$140+/month with `prod`. A card is required to open an Azure account even for free tiers |
| AWS | **$0, ever** — it is only read from if you supply keys |

So: **you can use the whole product without paying anything.** You only pay for
a public URL, and only if you want one.

If you'd rather not pay at all but still want a shareable link, put the SPA on a
free static host (GitHub Pages, Cloudflare Pages, Netlify) and keep the demo API
local — see [Cheap and free hosting](#cheap-and-free-hosting) below.

---

## Track A — see it running

```bash
git clone https://github.com/Brandonflex/Azure.git
cd Azure/src/client
npm ci
npm run preview:demo
```

Open **http://localhost:4300**. That's the whole product, on demo data, with no
cloud account, no database and no API keys.

With the .NET SDK installed you can also run the real backend: see
[deployment-guide.md](deployment-guide.md) § Local development.

---

## Track B — make the checks green

Right now three checks pass (Backend, Frontend, Infrastructure) and **CodeQL**
fails on both languages. That is not a code problem — GitHub says it plainly:

> Code scanning is not enabled for this repository.

Code scanning is **free on public repositories** and requires a **paid GitHub
Advanced Security licence on private repositories**. Choose one:

### Option B1 — make the repository public (recommended, free)

1. Open <https://github.com/Brandonflex/Azure/settings>
2. Scroll to **Danger Zone** → **Change repository visibility** → **Make public**
3. Confirm by typing the repository name.
4. Open <https://github.com/Brandonflex/Azure/actions/workflows/codeql.yml> →
   **Run workflow** → branch `arena/d2622d45-azure`.

CodeQL then runs, uploads results and the checks go green. Making the repo
public also makes Actions minutes free.

> Before publishing, check that no secrets are committed — `appsettings.json`
> contains only empty placeholders, and `.gitignore` excludes local settings.

### Option B2 — keep it private and buy Advanced Security

<https://github.com/Brandonflex/Azure/settings/security_analysis> → enable
**GitHub Code Security** for the repository (billed per committer). Then re-run
the CodeQL workflow.

### Option B3 — keep it private without code scanning

Delete `.github/workflows/codeql.yml` (or disable the workflow under the
**Actions** tab). You lose static analysis, but the remaining three checks stay
green and honest.

If C# still fails after B1/B2, add a manual build between `init` and `analyze`:

```yaml
- name: Build C#
  run: dotnet build src/server/CloudScope.sln --configuration Release
```

---

## Track C — deploy to Azure

This creates App Service, Cosmos DB (SQL API), Redis, Azure OpenAI, Application
Insights and Key Vault, then publishes the API **and** the SPA into one App
Service.

**Pick the `demo` profile when you start the workflow.** It uses the small SKUs
and the Cosmos lifetime free tier:

| Profile | What it provisions | Rough monthly cost |
|---------|--------------------|--------------------|
| `demo` / `dev` | App Service **B1**, Cosmos with **free tier** (1,000 RU/s + 25 GB), Basic Redis | **~$30** |
| `prod` (default) | App Service **S1**, Cosmos provisioned throughput, Standard Redis, always-on | **~$140–160** |

Both include Azure OpenAI and Application Insights, which are pay-per-use — a
handful of queries and a demo-sized telemetry volume cost a few dollars at most.
Prices are East US list prices; check the [Azure pricing
calculator](https://azure.microsoft.com/pricing/calculator/) for your region.

### 1. Install and sign in to the Azure CLI

```bash
# macOS
brew install azure-cli
# Windows
winget install Microsoft.AzureCLI
# Ubuntu/Debian
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

az login
az account set --subscription "<YOUR_SUBSCRIPTION_ID>"
```

### 2. Create the deployment identity

From the repository root:

```bash
./scripts/create-azure-credentials.sh
```

It creates the resource group, creates a service principal called
`cloudscope-github` with Contributor on that group, writes
`azure-credentials.json`, and prints the three commands that store the secrets.
`azure-credentials.json` is git-ignored.

<details>
<summary>Doing it by hand instead</summary>

```bash
az group create --name cloudscope-rg --location eastus
az ad sp create-for-rbac --name cloudscope-github \
  --role Contributor \
  --scopes /subscriptions/<SUB_ID>/resourceGroups/cloudscope-rg \
  --sdk-auth > azure-credentials.json
```
</details>

### 3. Store the secrets

<https://github.com/Brandonflex/Azure/settings/secrets/actions> → **New
repository secret**:

| Name | Value |
|------|-------|
| `AZURE_CREDENTIALS` | the entire contents of `azure-credentials.json` |
| `AZURE_AD_TENANT_ID` | your tenant id (`az account show --query tenantId -o tsv`) |
| `AZURE_AD_CLIENT_ID` | an app registration client id, or the tenant id for now |

Or, in one go:

```bash
gh secret set AZURE_CREDENTIALS  < azure-credentials.json
gh secret set AZURE_AD_TENANT_ID -b "$(az account show --query tenantId -o tsv)"
gh secret set AZURE_AD_CLIENT_ID -b "<client-id-or-tenant-id>"
rm azure-credentials.json
```

`APP_SERVICE_NAME` is optional — the workflow discovers the App Service by name
from the resource group.

### 4. Run the deployment

<https://github.com/Brandonflex/Azure/actions/workflows/deploy-azure.yml> →
**Run workflow** → branch `arena/d2622d45-azure` (or `main` after merging) and
choose the **`demo`** profile.

It takes ~6–10 minutes: Bicep → build SPA → publish API → zip → deploy →
smoke-test `/health` and `/`.

> The workflow does nothing until `AZURE_CREDENTIALS` exists. That is
> deliberate, so merging the pull request does not produce a red run.

### 5. Check it

```bash
az webapp list -g cloudscope-rg --query "[?starts_with(name,'cloudscope')].defaultHostName" -o tsv
```

Open `https://<that-host>` — the dashboard loads with demo data. Then:

```bash
curl -s https://<host>/health
curl -s https://<host>/api/meta     # storageProvider should be "Cosmos"
```

### 6. Turn on real cloud data (optional)

| Data | App Service settings |
|------|----------------------|
| Azure inventory | `Azure__SubscriptionId`, plus managed identity Contributor-read on the subscription — or `Azure__TenantId`/`ClientId`/`ClientSecret` |
| AWS inventory | `AWS__AccessKeyId`, `AWS__SecretAccessKey`, `AWS__Region`, `AWS__AccountId` |
| Real AI answers | `AzureOpenAI__Endpoint`, `AzureOpenAI__ApiKey`, `AzureOpenAI__DeploymentName` |

Set them under **App Service → Configuration → Application settings**, then
`POST /api/resources/discover`. Without them it stays in demo mode, which is a
perfectly good outcome for a review or a portfolio link.

### Turning it off

```bash
az group delete --name cloudscope-rg --yes --no-wait
```

---

## Track D — merge the pull request

Once Track B is done and you're happy with the checks:

```bash
gh pr ready 6            # take the PR out of draft
gh pr merge 6 --merge    # merge into main
```

Merging to `main` triggers CI; the deployment runs only if the secrets from
Track C exist.

---

## Cheap and free hosting

| Option | Cost | Trade-off |
|--------|------|-----------|
| Local (`npm run preview:demo`) | $0 | Not shareable |
| Static host + bundled demo data | $0 | Needs a small code change so the SPA reads `public/demo/inventory.json` instead of `/api/*` |
| Azure `demo` profile | ~$30/mo | Real API, Cosmos persistence, one URL |
| Azure free account | $0 for 12 months | App Service **F1** (60 CPU-min/day, sleeps after 20 min, no custom-domain SSL) + Cosmos free tier. Costs nothing but is slow to wake |
| Render / Railway / Fly.io + Docker | $0–5/mo | The Dockerfiles are in the repo; free tiers sleep when idle |

The Azure free account gives you **$200 credit for 30 days** plus 12 months of
select services and 65+ always-free services (including 1,000 RU/s of Cosmos DB).
The F1 App Service tier is free permanently but is explicitly not for production.

---

## What is *not* required

- **No Azure account** to explore the app — Track A covers that.
- **No AWS account** at any point.
- **No OpenAI key** — the local query engine answers all the sample questions.
- **No database** — in-memory storage is the default and is fully functional.

## Checklist

- [ ] Track A: `npm run preview:demo` opens on :4300
- [ ] Track B: CodeQL green (public repo, GHAS, or workflow disabled)
- [ ] Track C: `az login` done, `./scripts/create-azure-credentials.sh` run
- [ ] Track C: three secrets stored, deploy workflow green
- [ ] Track C: `https://<host>/api/meta` reports `Cosmos` and 54 resources
- [ ] Track D: PR #6 merged

## If something goes wrong

| Symptom | Fix |
|---------|-----|
| Deploy workflow is green but skips everything | `AZURE_CREDENTIALS` is missing — add it, re-run |
| `AADSTS70021` / login error | Service principal expired or wrong subscription — re-run the script |
| App shows demo banner but you added credentials | Check `/api/meta` → `configuredProviders`; the values must be set as App Service settings, not in the repo |
| `/dashboard` 404s after deploy | `wwwroot/index.html` missing — confirm the "Stage SPA into the API wwwroot" step ran |
| Cosmos 404 on containers | Redeploy the Bicep template; the containers are created by it |

More detail: [deployment-guide.md](deployment-guide.md).
