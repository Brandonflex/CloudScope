# Production release: protected, read-only Azure inventory

This is a release checklist, not a claim that CloudScope is production-ready.
As of this work, a Render Free test service has started with an intentionally
invalid Azure inventory credential. A user reported that health succeeded and
unauthenticated inventory was denied. Actual Microsoft sign-in, Vercel routing,
Azure discovery, and production deployment have not been verified.

## Boundaries and prerequisites

- Preserve the strict no-payment/no-card constraint. Confirm the actual Render
  workspace has no payment method and the service shows Free/$0 before any deploy.
  Free instance hours, build minutes and bandwidth are workspace-wide; services
  may sleep, lose in-memory data or be suspended. Render Free is not an always-on
  production SLA. Review [Render free limits](https://render.com/docs/free) and
  [Vercel Hobby terms](https://vercel.com/docs/plans/hobby) for the account.
- Obtain approval before merging PR #40. It overlaps the still-open PR #39; the
  overlapping changes must not be merged twice without review. Branch deployments
  are not a substitute for a user-approved release to the production branch.
- Production must use one exact, stable HTTPS production domain. The gateway's
  `CLOUDSCOPE_PUBLIC_ORIGIN`, the Entra **Web** redirect URI ending in
  `/auth/callback`, and the browser URL must match the same origin. Review all
  old preview redirect URIs and remove unused ones when no longer needed.
- Enable Vercel Authentication for **All Deployments**, including the production
  domain, and verify it from a signed-out browser before making any live data
  available. Standard Protection alone excludes production domains. Do not use
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

1. Keep the intentionally invalid inventory secret and `Discovery__Enabled=false`
   for the first controlled production-domain sign-in test. The backend may
   attempt startup discovery once; failure is expected, not evidence of zero
   resources. Confirm `/healthz`, unauthenticated API denial, successful sign-in
   only for the allowed Microsoft user, denied sign-in for an unauthorized user,
   logout, expired sessions, no leaks in logs, and same-origin browser routing.
2. After owner approval and these checks, replace the dummy secret **privately in
   Render** with the Inventory Reader app's actual client-secret value. The user
   configured the Reader role for the chosen subscription; confirm its scope
   directly in Azure, as the app cannot verify RBAC. Set `Discovery__Enabled=true`
   for periodic discovery and redeploy. Never put the secret in the PR or Vercel.
3. Verify a real successful Azure Resource Graph discovery. An empty inventory is
   shown as zero only after success; failures and pending discovery remain errors.
   Confirm restart/cold-start recovery and sign-out. Check the Azure portal for
   billing independently; the app does not currently provide verified live costs.
4. Monitor quota consumption and secret expiry. Remove test credentials when no
   longer needed, rotate compromised or expired secrets, and remove unused OAuth
   redirect URIs. Keep Vercel protection and the Render gateway enabled.

## Still not full product capability

Live mode currently provides paginated Azure inventory only. Persistence,
reconciliation of deleted resources, live costs, compliance, AI over real data,
AWS, SignalR, robust production rate limiting and real-provider end-to-end tests
remain unfinished. Do not label estimates or unavailable billing as actual costs,
or send real inventory to external AI without an explicit privacy review and
consent. The production site must not be represented as a fully functional cloud
assistant until these features and their safeguards are implemented and verified.
