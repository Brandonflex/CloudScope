# Real cloud data: readiness and no-cost boundary

The existing demo estate is fictional. A Render test gateway has been started
with an intentionally invalid Azure inventory credential; health and unauthenticated
access denial were reported, but real sign-in, Vercel routing and Azure discovery
have not been verified. Do not add provider credentials to Vercel or demo code.
See [production release](production-release.md) for the remaining gates.

## Current constraints

- An active provider subscription and appropriate authorization are required for
  real cloud inventory. An empty subscription is valid: successful discovery may
  return zero resources. No payment method or paid service should be added
  without a new, explicit decision. Trial credits can expire; free offers, quotas
  and card-verification requirements vary by provider, region and account. Do not
  promise that a real-cloud deployment will be free.
- The existing Azure/Bicep infrastructure and deployment guide describe services
  that can incur costs. **Do not run those deployments** under a strict-zero-cost
  requirement without independently checking every resource and getting approval.
- The .NET backend has Azure Resource Graph and AWS Config discovery code. Azure
  can use `DefaultAzureCredential` (including a suitable managed identity); the
  current AWS implementation uses configured access keys. A secure, short-lived
  role/identity-based AWS integration still needs to be designed and tested.
  AWS Config and cost services may incur charges.
- The preview AI sends fictional context and questions to Groq/Gemini. It must
  not be connected to real inventory or secrets. A real-data assistant would need
  a separate data-sharing, access-control and provider-privacy review.

## Required gates before connecting an account

1. **Owner decision:** choose the cloud provider, review current free-tier and
   billing terms, and decide whether the required account and services satisfy
   the no-card, no-payment requirement. Stop if they do not.
2. **Protected backend:** deploy the .NET API only behind an identity-aware
   gateway that authenticates and authorizes users, strips incoming gateway
   headers, injects a private shared secret, and supports SignalR. Restrict direct
   backend access. See [SECURITY.md](../SECURITY.md#gateway-and-deployment-safeguards).
   The existing gateway secret identifies the gateway, not the individual user;
   per-user or tenant authorization and isolation still need a concrete design.
3. **Read-only identity:** grant only the minimum provider permissions required,
   limit scope, prefer short-lived workload identity, and review costs. Never put
   credentials in browser code, the repository, Vercel demo variables, or chat.
4. **Separate storage:** disable demo seeding and use a new, empty storage
   namespace for real data. Existing discovery upserts resources and does not
   automatically remove a previously seeded demo estate; never reuse a demo store
   for live data. The backend now refuses to start with both a configured live
   provider and Cosmos storage, because stored data has no provenance marker. A
   process that has loaded the demo cannot switch to live discovery. Use a new
   in-memory store for initial testing; it is lost on restart. Do not delete
   existing data automatically. A migration and provenance strategy must be
   designed before enabling persistent live storage.
5. **Integration and proof:** route browser API calls through the protected
   gateway, not directly to a private backend or a browser-visible secret. Verify
   provider identity and authorization, actual discovery and provenance, error
   handling, data isolation, rate limits and observability. Distinguish a
   successful empty result from authentication, permission or provider failure;
   test both cases. Discovery currently upserts rather than reconciling deleted
   resources, so inventory may become stale. Test with a small read-only scope
   before expanding access.
6. **Cost data integrity:** the cost service can fall back to computed estimates
   when live cost data is unavailable; per-resource values and trends are not
   necessarily actual billing data. Before showing live costs, separately
   identify verified billing data, estimates and unavailable values; never present
   missing billing access as proof of zero charges. The provider portal remains
   authoritative for billing.
7. **AI consent:** independently approve whether any real inventory can be sent
   to an AI provider, review that provider's data use and billing terms, and
   enforce per-user access and data minimization. Backend startup now rejects
   configured Azure OpenAI alongside live providers until this is implemented.
   Keep the preview demo isolated.

None of these gates authorizes spending or proves a live Azure connection. The
Vercel production demo function remains disabled by design.

## Hosting constraint

The Vercel demo is not a .NET backend or identity-aware gateway. A separately
protected, reachable backend is still required to connect its UI to real data;
the dummy-credential Render deployment has not been validated end to end. An experimental Entra
identity gateway, Vercel proxy and inventory-only view are under development in
[`src/gateway`](../src/gateway/README.md); they are not ready for real credentials. Any self-hosted option
requires a running device and network connection. Do not use a public quick
tunnel as an authentication gateway. Cloudflare's documentation states that
[Zero Trust onboarding requires payment details even on its Free plan](https://developers.cloudflare.com/cloudflare-one/setup/),
so that option does not satisfy a strict no-card requirement as documented.
A different no-card identity-aware solution and end-to-end Vercel routing remain
unverified; free quotas or trials are not a guarantee of permanent no-cost service.

Render offers free web services, but they sleep on inactivity, have limited
monthly quotas, may suspend on exceeding limits, and do not support private
inbound networking on the free plan. A single-container loopback backend and
OIDC gateway and Vercel routing have mock end-to-end tests, but neither their
security nor their compatibility with a deployed Render/Vercel setup has been
established. See [Render's free-plan documentation](https://render.com/docs/free).
