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

Vercel serves only the frontend in this configuration. It does not run the .NET
API or SignalR hub, and `/api` requests are deliberately not rewritten to the SPA.
For live data, deploy the backend behind the identity-aware gateway described in
[SECURITY.md](../../SECURITY.md#gateway-and-deployment-safeguards) and configure
same-origin routing at the gateway. The local demo API can be explored with
`npm run preview:demo`; it is not a production backend.

If an old deployment URL returns `NOT_FOUND`, check that the deployment still
exists and that your Vercel account can access protected deployments. A new
build creates a new immutable deployment URL; use the project alias for the
current deployment.
