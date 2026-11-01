# Experimental identity-aware gateway

**Not production-ready.** The owner reported successful production-domain
sign-in and shared a screenshot of a successful zero-resource Azure discovery.
Unauthenticated API access was denied in a direct check. Unauthorized-user
rejection, session expiry, log safety, RBAC scope, cold-start recovery and
credential isolation are not established by those observations; see
[production release](../../docs/production-release.md).

## Intended design

- Vercel continues hosting the frontend; a separate single-instance Render
  free service can run the gateway and .NET API together. Only the gateway
  listens on Render's public port; the API is forced to `127.0.0.1:8081` and
  requires a shared gateway key. No Azure key belongs in Vercel.
- Microsoft Entra OIDC authorization code flow uses PKCE, state, nonce, signed
  ID-token verification, a tenant-specific issuer and an explicit allowed user
  object ID. A regenerated secure, HTTP-only, SameSite=Lax cookie holds only an
  opaque session ID. Session data is bounded, short-lived, in memory and lost
  on restart. Azure and sign-in secrets are omitted from each other's process
  environments, but this is **not process isolation**: both processes share the
  same container and user, and the supervisor receives all secrets. A process
  compromise could expose credentials via shared OS access. Do not treat the
  environment filtering as a security boundary.
- Only explicitly allowlisted GET inventory/graph routes are proxied. Costs,
  AI, compliance, discovery writes and SignalR are intentionally unavailable.
  The backend uses in-memory storage, demo seeding and external AI are disabled,
  and live Cosmos storage is blocked pending provenance work. Existing Azure
  Azure-only in-memory discovery replaces the cache after a validated complete
  query; other modes remain upsert-only. Azure Resource Graph is eventually
  consistent, and the cache can be stale or limited by the identity's permissions.
- The opt-in Vercel proxy forwards only the gateway session cookie and approved
  read-only routes. Invalid or unavailable gateway configuration never falls
  back to fictional demo data. A dedicated inventory-only UI distinguishes a
  successful empty result from a failed or pending sync. The proxy cannot supply
  Azure credentials or the backend gateway key.
- Local tests use mock identity and signed tokens; they do **not** establish
  all production security properties, full Azure access, Render credential
  isolation, or cost controls work. In-memory rate limits are
  per instance and do not replace platform-level protection or DDoS mitigation.

## Outstanding gates

1. Verify the same-origin Vercel-to-gateway routing and Microsoft sign-in in
   an authenticated browser against a controlled deployment. Vercel platform
   cookies must not be proxied to Render. Keep Vercel Deployment Protection on.
2. Establish an Azure service identity with only the minimum read-only scope,
   plus a separate tenant-restricted sign-in application. Verify permissions,
   provider API behavior, billing and consent before using a real subscription.
3. Establish and independently review an adequate credential-isolation threat
   model for the same-container supervisor, gateway and API. Review authentication,
   reverse-proxy headers, CSRF, session behavior, TLS termination, access control,
   rate limiting, local backend isolation and logging. Verify startup and denial
   paths end to end; process environment filtering alone is not an isolation boundary.
4. Verify the inventory-only UI's empty, failed, expired-session and cold-start
   behavior. Live billing, compliance, AI and SignalR are deliberately disabled.
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

## Opt-in routing

When the deployment and security gates are met, Vercel's server-side variable
`CLOUDSCOPE_LIVE_GATEWAY_ORIGIN` can be set to the exact HTTPS `*.onrender.com`
origin, without a path. This is a host address, **not an Azure credential**. It
selects the live gateway instead of the preview demo for that deployment; an
invalid value or unavailable gateway returns an error, not synthetic data. The
Vercel system variable `VERCEL_ENV` must be exposed. The gateway's configured
public origin must exactly match the Vercel URL used for sign-in and the Entra
redirect URI. Do not enable this until the gateway, identity and RBAC have been
reviewed and verified. No automatic migration of existing data is performed.
