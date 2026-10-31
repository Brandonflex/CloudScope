# Cloudscope

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 18.2.21.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Vercel deployment

Set the Vercel project's **Root Directory** to `src/client`. The checked-in
`vercel.json` builds the Angular SPA, publishes `dist/cloudscope/browser`, and
rewrites the app's client-side routes to `index.html` on refresh. When adding a
new Angular route, update the rewrites too; CI checks that they match.

Vercel preview deployments serve a **fictional demo estate** through a
preview-only serverless adapter; no cloud credentials or real data are used.
SignalR is not available, and changes are not persisted. Enable Vercel system
environment variables so `VERCEL_ENV=preview` is available at runtime. Preview
Deployment Protection must remain enabled and platform rate limits should be
configured; the demo API is not a production service. If `VERCEL_ENV` is absent
or is `production`, the adapter returns 404 rather than exposing demo data.

Vercel does not deploy the .NET API or SignalR hub. For real cloud data, deploy
the backend behind the identity-aware gateway described in
[SECURITY.md](../../SECURITY.md#gateway-and-deployment-safeguards) and configure
same-origin routing at the gateway. Do not use the demo adapter as a production
backend. The local demo API can be explored with `npm run preview:demo`.

If an old deployment URL returns `NOT_FOUND`, check that the deployment still
exists and that your Vercel account can access protected deployments. A new
build creates a new immutable deployment URL; use the project alias for the
current deployment.

### Optional Azure OpenAI preview assistant

By default the preview uses a deterministic local guide. To enable the optional
AI assistant, create an Azure OpenAI resource and a compatible chat-completions
model deployment (for example, a compatible GPT-4o deployment). In Vercel
Project Settings → Environment Variables, add these **server-side, Preview-only**
variables and redeploy the preview:

- `CLOUDSCOPE_PREVIEW_AZURE_OPENAI_ENDPOINT`: the resource endpoint, in the form
  `https://YOUR-RESOURCE.openai.azure.com` (no path or trailing query string).
- `CLOUDSCOPE_PREVIEW_AZURE_OPENAI_DEPLOYMENT`: your model deployment name.
- `CLOUDSCOPE_PREVIEW_AZURE_OPENAI_API_KEY`: the Azure OpenAI API key, entered
  directly in Vercel's secret settings. Do not put it in Git, browser code, or chat.

Also enable Vercel's system environment variables so `VERCEL_ENV=preview` is
available. AI is enabled only when all settings are valid in a Preview deployment;
production and the local mock do not invoke this preview integration. The endpoint
must be an Azure OpenAI `*.openai.azure.com` hostname. The integration uses the
Azure `2024-08-01-preview` chat-completions API; model deployments must support
that API and `max_tokens`. Azure configuration and quota are operator-managed.
If the call fails or times out, the UI labels a limited local fallback; the
configuration badge alone does not prove the model is reachable.

**Privacy and cost:** your question, up to three previous exchanges, a curated
CloudScope guide and fictional inventory are sent to Azure OpenAI. Users must not
enter credentials, secrets or sensitive information. Provider data handling and
retention are governed by your Azure configuration and agreements. Configure
Azure quotas and budget alerts, keep Vercel Deployment Protection enabled and
configure platform rate limits; the application has no built-in user rate limit.
Conversation context is held in the current browser session, not persisted by the
preview. Refreshing or clearing chat loses it.

This first version supplies a fixed guide and demo snapshot, not a search index,
verified citations, live web browsing or real cloud data. AI can make mistakes;
verify important answers. It has no infrastructure-changing tools and must not
be used as a production backend. The .NET backend has a separate query engine.
