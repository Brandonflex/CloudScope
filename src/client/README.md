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

### Preview assistant

The preview's assistant is a deterministic, rule-based guide, not a connected
LLM. It can explain CloudScope features, demo data, deployment responsibilities
and common concepts, and answer a selection of questions about the fictional
inventory. Suggested follow-ups are standalone questions: the demo does not
remember conversation context. It cannot connect accounts, make infrastructure
changes or answer arbitrary questions. Do not enter secrets or sensitive data.
The .NET backend has a separate query engine; these preview-specific explanations
and suggestions do not change its behaviour.
