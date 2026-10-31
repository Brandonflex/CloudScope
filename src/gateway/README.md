# Experimental identity-aware gateway

**Not deployed or production-ready.** This component is a security prototype,
not a complete real-Azure integration. It is not connected to the Vercel demo.
Do not configure it with real credentials or expose it to the internet until the
remaining integration, security review and deployment gates are complete.

## Intended design

- Vercel would continue hosting the frontend; a separate single-instance Render
  free service would run the gateway and .NET API together. Only the gateway
  listens on Render's public port; the API is forced to `127.0.0.1:8081` and
  requires a shared gateway key. No Azure key belongs in Vercel.
- Microsoft Entra OIDC authorization code flow uses PKCE, state, nonce, signed
  ID-token verification, a tenant-specific issuer and an explicit allowed user
  object ID. A regenerated secure, HTTP-only, SameSite=Lax cookie holds only an
  opaque session ID. Session data is bounded, short-lived, in memory and lost
  on restart. Azure and sign-in secrets are kept out of each other's processes.
- Only explicitly allowlisted GET inventory/graph routes are proxied. Costs,
  AI, compliance, discovery writes and SignalR are intentionally unavailable.
  The backend uses in-memory storage, demo seeding and external AI are disabled,
  and live Cosmos storage is blocked pending provenance work. Existing Azure
  discovery upserts and does not reconcile removals, so inventory can be stale.
- Local tests use mock identity and signed tokens; they do **not** establish
  that an actual Entra registration, real Azure access, Vercel routing, Render
  identity isolation, or cost controls work. The browser currently expects demo
  routes and the live dashboard still needs honest unavailable-data states.

## Outstanding gates

1. Implement and test same-origin Vercel-to-gateway routing and an explicit
   browser sign-in flow. Do not proxy Vercel authentication cookies to Render.
2. Establish an Azure service identity with only the minimum read-only scope,
   plus a separate tenant-restricted sign-in application. Verify permissions,
   provider API behavior, billing and consent before using a real subscription.
3. Independently review authentication, reverse-proxy headers, CSRF, session
   behavior, TLS termination, access control, rate limiting, local backend
   isolation and logging. Verify startup and denial paths end to end.
4. Update the UI to show unavailable billing, compliance and AI rather than
   synthetic data; ensure the dashboard can render an actual empty inventory.
5. Confirm Render's no-card signup and free-plan terms for the actual account.
   Free services may sleep, lose in-memory data, or be suspended at quota; they
   are not recommended for production. Never create a paid instance or submit
   payment details. See [Render free services](https://render.com/docs/free).
6. Only after approval, configure secrets privately in the host dashboard—not
   in the repository, Vercel demo, logs or chat—and test with the empty Azure
   subscription. The app cannot verify the service identity's RBAC scope.

## Local tests

From this directory run `npm ci && npm test`. The image is built from the repo
root with `docker build -f src/gateway/Dockerfile .`. The supervisor fails
closed unless `CLOUDSCOPE_ENABLE_EXPERIMENTAL_GATEWAY=true` and all required
settings are supplied; that flag is for controlled testing only and is not
permission to deploy the prototype with real data.
