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

### Optional free-tier AI preview assistant

The preview can use **Groq first, then Gemini** if Groq times out, is rate-limited
or has a server/network error. It falls back to the local rule-based guide when
neither is usable. You can configure either provider or both; no Azure account is
needed. Some provider errors are not retried to avoid bypassing safety restrictions.

1. Create a free account with [Groq](https://console.groq.com/) and/or a free-tier
   project in [Google AI Studio](https://aistudio.google.com/apikey). Confirm that
   the account and model are on the **free tier** and leave billing disabled. If
   prompted for a card, stop rather than enable a paid plan.
2. In Vercel Project Settings → Environment Variables, add each key separately,
   for **Preview only**. Add only the providers you want:
   - `CLOUDSCOPE_PREVIEW_GROQ_API_KEY` — Groq API key.
   - `CLOUDSCOPE_PREVIEW_GEMINI_API_KEY` — Gemini API key.
3. Enable Vercel system variables so `VERCEL_ENV=preview` is available, then
   redeploy. Enter keys directly into Vercel's secret settings, never in Git,
   client-side code, screenshots or chat. The preview will show which provider
   answered; “AI provider configured” alone does not confirm it is reachable.

The app currently uses `openai/gpt-oss-20b` through Groq and
`gemini-3.5-flash-lite` through Gemini. Provider free-tier models, quotas and
regional availability can change. Free tiers are not unlimited and may stop
working when limits are reached. The application **cannot check your provider
billing plan or guarantee zero charges**; only connect free-tier accounts with
billing disabled. Do not use paid models or add a payment method. The older
Azure preview settings are no longer used by this integration.

**Privacy and security:** Your question, up to three previous exchanges, a
curated CloudScope guide and fictional inventory are sent to Groq and may also
be sent to Gemini when Groq fails. Google states that free-tier content may be
used to improve its products; see each provider's privacy terms. Do not enter
credentials, secrets or sensitive information. Keep Vercel Deployment Protection
enabled and configure platform rate limits; the app has no built-in per-user rate
limit. Conversation context is held in the current browser session and is lost
on refresh or clearing chat.

This supplies a fixed guide and demo snapshot, not a search index, verified
citations, live web browsing or real cloud data. AI can make mistakes; verify
important answers. It has no infrastructure-changing tools and must not be used
as a production backend. The .NET backend has a separate query engine.
