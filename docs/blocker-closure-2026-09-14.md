# System-wide blocker closure — 2026-09-14

This pass builds on `audit-hardening-2026-09-05.md`. It does not claim that
all HIGH/CRITICAL audit findings have been closed.

## Implemented invariants

- PostgreSQL portfolio operations use an explicit owner-keyed unit of work.
  Existing stores share its checked-out connection, so portfolio creation,
  Governor decisions, objective draft creation, rollups, funding/allocation and
  canonical audit writes commit or roll back together in the standard backend.
  No second scheduler or outbox was added: these operations have no external
  side effect requiring an outbox. Activation remains a separate governed action.
- Nested operations must use the same transaction key; independent connections
  within the unit of work are denied. Query/lock deadlines are bounded. Stale
  Governor generation/lease CAS checks remain in force.
- Funding/allocation replay checks run under an owner-keyed database lock.
  Changed economic terms under the same replay key are conflicts, not success.
- Legacy PostgreSQL memory and executive reads without company context select
  only the registered default company, rather than all sibling companies.
  A mismatched ambient owner throws. Mutable legacy memory upserts cannot replace
  another owner/company record. This is not a claim about every legacy store.
- Company semantic queries authorize company and assignment before embedding.
  Unknown/inactive assignments deny instead of becoming owner access. Assignment
  queries exclude confidential/restricted documents until a document-level grant
  exists. Typed registered scopes are required on ingestion; unsupported task,
  conversation and owner scope claims deny.
- Company vectors are finite, nonzero 1536-dimensional vectors and query against
  a matching embedding version. Scope/sensitivity filters precede cosine ranking.
  Index and query use the same server-configured provider. Cloud query embedding
  is governed conservatively as restricted data. Lexical fallback is labelled;
  vector-only requests never fabricate similarity. Legacy memory's separate
  lexical-only retrieval path has not been migrated to this contract.
- Real local Docker execution is disabled because its output bind mount lacks
  an enforceable disk quota. Missing effective-grant resolution denies before
  provider execution. Injected runners remain synthetic test seams only.
- Commercial adapters reject generic HTTP-200 objects as success. Xero checks
  collection/report identity and payload shape; Google Ads checks streaming
  results and period constraints; GA4 checks metric/dimension identity, numeric
  values and complete row count. Unsupported Shopify inventory/customer-search/
  fulfillment/returns claims were removed from this representative adapter.
- Remote PostgreSQL verifies TLS identity, including the compatibility `require`
  spelling. URL overrides cannot disable certificate verification. Plaintext
  is loopback-only; production config rejects disabled TLS.
- Old runtime evidence becomes UNKNOWN after 15 minutes. Stale/empty data cannot
  establish healthy business/data state. Cost alone does not establish economy
  health, credentials alone do not establish provider health, and integration
  bindings alone do not establish a healthy live connection.

## Evidence and limits

Focused tests exercise PostgreSQL rollback/retry, concurrent funding/allocation,
portfolio creation replay, competing/stale proposal writes, owner/company vector
isolation, wrong embedding versions, legacy graph memory isolation, sandbox
default denial, malformed provider payloads, TLS settings and stale health.

Provider shape references reviewed:
- https://developers.google.com/google-ads/api/rest/common/search
- https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/RunReportResponse
- https://developer.xero.com/documentation/api/accounting/accounts

## Still blocking verified-complete status

1. A reviewed, canonical sandbox grant resolver and quota-backed runtime are not
   implemented. Execution is denied, not claimed operational. Real Docker/image
   verification is still necessary before enablement.
2. Several other legacy stores retain optional-company predicates. They require
   caller-by-caller scope review; changing all SQL mechanically would break
   intentional owner-level governance and background recovery paths. This pass
   closed the affected memory/executive paths, not the entire legacy surface.
3. Legacy memory vector retrieval remains unavailable. Company vector retrieval
   now has an authorized pipeline, but its provider must be explicitly permitted;
   there is no configured local embedding adapter added by this pass.
4. Transaction tests do not yet exhaust every accepted-objective fault point,
   alternate injected-store topology, or pre-existing partial record repair.
   In-memory development stores do not provide PostgreSQL rollback semantics.
5. Commercial adapter validation is stricter but not a complete canonical
   business-data adapter acceptance. Live provider and production-cloud behavior
   have not been exercised.

Android changes, cosmetic work, bundle optimization and new product features
were deliberately excluded. No physical-device or production acceptance is claimed.

## Validation record

- `pnpm lint`, `pnpm typecheck`, and `pnpm build` completed successfully.
  The build includes Electron and four native Swift helpers. Existing Web
  runtime-config and bundle-size warnings remain.
- The final health changes also passed focused tests, API typecheck/build and
  ESLint. `git diff --check` passed.
- Focused PostgreSQL transaction, funding, portfolio, company-vector, isolation,
  provider, sandbox, TLS and health regressions passed.
- `pnpm test` was run once for this pass. Its final terminal summary was lost
  across context continuation and the process handle is no longer available;
  therefore this report does not assert a final full-suite count or exit code.
  The Vitest cache contains no failed entry in the configured test scope, but
  cache contents are not a substitute for a captured final run result. Its one
  failed entry is an old whisper.cpp dependency test excluded by current config.
- The synthetic 100-company / 200-runnable scheduler check reported 64 claims,
  zero duplicate claims and 24 failed claim attempts. This is contention evidence,
  not production throughput or proof that every runnable execution completed.
- No Android changes, production migration/deployment, real Docker containment,
  live Gmail/Stripe, or physical-device acceptance was performed.

Verdict remains conditional: the implementation blockers above are not merely
missing acceptance evidence.
