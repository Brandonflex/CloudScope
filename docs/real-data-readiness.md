# Real cloud data: readiness and no-cost boundary

The protected Vercel preview uses a fictional estate and **cannot connect real
cloud accounts**. This document is preparation, not a claim that a live cloud
integration or identity-aware gateway has been deployed. Do not add provider
credentials to the Vercel demo function.

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
   for live data. Do not delete existing data automatically. A migration and
   provenance strategy must be designed before reusing a persistent store.
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
   enforce per-user access and data minimization. Keep the preview demo isolated.

None of these gates creates a cloud account, authorizes spending or proves a
live deployment. The Vercel production demo function remains disabled by design.
