# Production release: protected, read-only Azure inventory

This is a release checklist, not a claim that CloudScope is production-ready.
The owner reported a successful production-domain Microsoft sign-in and shared a
screenshot showing a successful Azure discovery with zero resources visible in
the configured scope. This is evidence of a working path, not independent proof
of subscription-wide permissions, completeness, unauthorized-user rejection, or
full production readiness. Previously, an unauthenticated Render API request
was denied and the production domain redirected to Vercel Authentication.

## Boundaries and prerequisites

- Preserve the strict no-payment/no-card constraint. The optional Azure
  infrastructure workflow can provision billable resources and is not used for
  the Vercel/Render setup. Confirm the actual Render
  workspace has no payment method and the service shows Free/$0 before any deploy.
  Free instance hours, build minutes and bandwidth are workspace-wide; services
  may sleep, lose in-memory data or be suspended. Render Free is not an always-on
  production SLA. Review [Render free limits](https://render.com/docs/free) and
  [Vercel Hobby terms](https://vercel.com/docs/plans/hobby) for the account.
- PR #40 was merged with owner approval. PR #39 overlaps its changes and remains
  open; do not merge or close it without review and owner approval. Future
  changes still require a PR and explicit merge approval.
- The owner confirmed `https://cloud-scope-six.vercel.app` as the intended
  production domain. Production must use one exact, stable HTTPS origin. The gateway's
  `CLOUDSCOPE_PUBLIC_ORIGIN`, the Entra **Web** redirect URI ending in
  `/auth/callback`, and the browser URL must match the same origin. Review all
  old preview redirect URIs and remove unused ones when no longer needed.
- Keep Vercel Authentication enabled for **All Deployments**, including the
  production domain, and verify it remains enabled before making any live data
  available. An unauthenticated check reached Vercel login. Standard Protection alone excludes production domains. Do not use
  paid Password Protection under the no-payment constraint. See [Vercel
  Deployment Protection](https://vercel.com/docs/deployment-protection).
- The public Render endpoint is protected separately by the Entra gateway. The
  .NET API listens on loopback and uses a shared gateway key. Both processes and
  the supervisor share a container and user: environment filtering is **not** a
  security boundary, and a process compromise could expose credentials. An owner
  reported review; this repository cannot verify the review or its conclusions.
  A documented, acceptable risk decision and end-to-end authentication/security
  testing remain prerequisites. Per-instance rate limits are not DDoS protection.
- Keep cloud keys, session secrets and gateway secrets out of Vercel, the browser,
  Git, screenshots and chat. Set `CLOUDSCOPE_LIVE_GATEWAY_ORIGIN` only as a Vercel
  **server-side Production** environment variable to the exact HTTPS Render
  origin (no path); expose Vercel system environment variables so `VERCEL_ENV`
  is available. An absent production gateway does not enable a demo API, and an
  invalid configured gateway fails closed. Settings require a new deployment.

## Verification sequence

1. The owner observed successful sign-in and a successful zero-resource discovery
   on the production domain after replacing the dummy secret. The app cannot verify
   RBAC scope; confirm the Inventory Reader's subscription role directly in Azure.
   Zero means no resources visible in the configured scope, not proof of complete
   access. Never put secrets in the PR or Vercel.
2. Still verify unauthorized-user rejection, logout, expired sessions, absence of
   credential leaks in logs, and restart/cold-start recovery. An unauthenticated
   API denial and the owner's authorized sign-in do not establish those properties.
3. Failures and pending discovery must not be presented as an empty inventory.
   Check billing in Azure independently; the app does not provide verified costs.
4. Monitor quota consumption and secret expiry. Remove test credentials when no
   longer needed, rotate compromised or expired secrets, and remove unused OAuth
   redirect URIs. Keep Vercel protection and the Render gateway enabled.

## Still not full product capability

Live mode currently provides paginated Azure inventory only. An Azure-only
in-memory snapshot is replaced after a validated complete discovery; this changes
the local cache, not Azure resources. Resource Graph is eventually consistent,
and a completed query is limited to what the configured identity can see.
Persistent storage, multi-provider reconciliation, live costs, compliance, AI
over real data, AWS, SignalR, robust production rate limiting and additional
real-provider end-to-end tests remain unfinished. Do not label estimates or unavailable billing as actual costs,
or send real inventory to external AI without an explicit privacy review and
consent. The production site must not be represented as a fully functional cloud
assistant until these features and their safeguards are implemented and verified.
