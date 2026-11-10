# System autonomy and business capability audit

Audit date: 2026-10-13. Repository baseline: `7ee28be`.

## Verdict

**Overall capability readiness for the requested mix: 50/100.** Athena has a substantial governed engineering and research foundation. It is not yet demonstrated as a reliable autonomous business operator, branding studio, marketing operator, or social media manager. Business execution has confirmed governance defects that should block unattended external mutations until repaired and tested.

This is a repository assessment, not a penetration-test certificate or measurement of a running deployment. Registered agent names, declared capabilities, migrations, dashboard panels, and deterministic test-provider success are not proof of external execution. Owner approval remains an intentional boundary; a higher score must not mean removing it.

## Method and scope

Inventoried the repository (1,250 files returned by `rg --files`) and examined relevant instructions, architecture and phase documentation, shared contracts, production bootstrap/provider wiring, governance/identity boundaries, engineering runtime/orchestration/integration/delivery, workforce/objectives, business/commercial integrations, management read models, research provenance, Electron isolation, deployment and CI. Ran automated checks and isolated synthetic provider/service probes. This was broad system coverage with targeted code inspection, not a line-by-line review of every file.

No live credentials, production accounts, registered real-device operations, database migrations, deployment, publishing, application launching, camera, microphone, or macOS mutation were used. Synthetic probes used mocked HTTP responses and in-memory stores. Production application code was not changed.

Scores are judgment-based maturity estimates, not empirical success rates. Scale: 0–2 missing/declarations; 3–4 partial execution; 5–6 substantial implementation with gaps; 7–8 integrated implementation with meaningful local tests; 9–10 repeated live acceptance with measured reliability and governed recovery. Security findings can block operational use even where implementation maturity scores are higher.

| Requested section      | Score / 10 | Weight | Assessment                                                                                                                |
| ---------------------- | ---------: | -----: | ------------------------------------------------------------------------------------------------------------------------- |
| Autonomous engineering |          7 |    30% | Integrated local delivery pipeline; live trusted-Mac acceptance and production release path remain unproven/out of scope. |
| Research               |          7 |    20% | Real provider web-search path and deterministic retrieval provenance checks; live quality/coverage not measured here.     |
| Business operations    |          4 |    20% | Strong coordination/read models; incomplete live adapter coverage and confirmed business-execution governance defects.    |
| Branding               |          3 |    10% | Specialist identities and general drafting/review substrate; dedicated brand asset pipeline not located.                  |
| Marketing              |          3 |    10% | Content/analytics role metadata, email drafts and test-account ad reads; campaign execution loop incomplete.              |
| Social media           |          1 |    10% | Dedicated account, scheduling, publishing and engagement adapters not located in the reviewed runtime/contracts.          |

Weighted total: `(7×0.30 + 7×0.20 + 4×0.20 + 3×0.10 + 3×0.10 + 1×0.10) × 10 = 50`.

## Confirmed findings, ordered by priority

### A1 — P1: business dispatch omits central policy and emergency-stop enforcement

Evidence: [business runtime](../apps/api/src/integrations/business-runtime.ts), especially `request`, [integration routes](../apps/api/src/routes/integrations.ts), [integration service](../apps/api/src/integrations/service.ts), and [production app composition](../apps/api/src/app.ts).

The business route checks authentication, company context, exact origin and CSRF. The runtime checks integration permissions, bindings, provider capabilities, approvals and some commercial limits. It does not evaluate the central PolicyEngine or consult emergency-stop state before provider dispatch. Its construction does not receive a policy/emergency-stop authorizer. Authentication and CSRF do not supply that missing governance decision.

Reproduced at the service boundary: with the governance store's emergency stop active, a synthetic approved email-send action reached the deterministic provider and returned `VERIFIED`; the governance store contained zero policy evaluations. This is not a live Gmail send or a complete HTTP exploit demonstration. The production route calls the same service and no route-level stop check was found.

Repair: route finite business operations through existing server-owned governance; check stop and policy immediately before the external effect and relevant reconciliation; fail closed if state cannot be read; persist/audit the decision. Do not introduce another executor or accept caller-supplied authority.

### A2 — P1: an approval that expires during lookup can authorize business dispatch

Evidence: [ApprovalService.findMatchingApproved / expireIfNeeded](../apps/api/src/governance/approval-service.ts) and `request` in [business runtime](../apps/api/src/integrations/business-runtime.ts).

The lookup retrieves an `APPROVED` record, then can transition it to `EXPIRED` and return that record. The business runtime checks only whether the return value is present. An expired record remains truthy.

Reproduced using a one-second approval TTL and a synthetic clock advance: the approval became `EXPIRED`, yet the business action reached the provider and returned `VERIFIED`. No stored approval was illicitly edited for this reproduction.

Repair: return only a currently valid approval from the shared lookup, require explicit valid status at dispatch, preserve digest/company binding, and test expiry at the lookup-to-dispatch boundary. Review other callers of the shared lookup for the same assumption.

### A3 — P1: provider result caches are not scoped to company or credential binding

Evidence: [Gmail provider](../apps/api/src/integrations/gmail-provider.ts), [Stripe provider](../apps/api/src/integrations/stripe-provider.ts), and singleton provider wiring in [index.ts](../apps/api/src/index.ts).

Both adapters key their result maps using only `action.idempotencyKey`. The same adapter instance serves multiple company bindings. The integration execution store is company-scoped, but the provider cache beneath it is not. Cache lookup also does not compare the canonical action digest.

Reproduced separately for both providers: company A executes an action; company B uses the same key with a different resource; B receives A's cached external reference, and only one mocked HTTP request occurs. This proves incorrect reference reuse and skipped execution, not disclosure of full provider content.

Repair: bind cache/provider idempotency identity to authenticated company, credential binding, capability and canonical action digest; reject conflicting reuse and preserve separation across owner/company/account boundaries and worker restarts.

### A4 — P1: high-risk email/support actions do not uniformly require recent authentication

Evidence: `HIGH_RISK`, `STEP_UP_REQUIRED` and approval construction in [business runtime](../apps/api/src/integrations/business-runtime.ts), plus [approval route](../apps/api/src/routes/approvals.ts).

`email.send_draft`, `email.reply`, `email.forward` and `support.reply` are classified high risk, but are absent from the step-up set. Approval construction can therefore create a high-risk approval with requirement `explicit`. The approval endpoint consumes a recent-auth grant only for requirement `recent_authentication`.

Reproduced for email send: approval risk was `high`, requirement was `explicit`, and it was approved without a recent-auth grant. The reply/forward/support cases are static code findings; live support execution is not wired in the inspected bootstrap.

Repair: enforce the shared high-risk recent-auth baseline server-side, allowing overrides only to strengthen requirements; test all high-risk capabilities and ensure voice/gesture cannot approve them.

### A5 — P1 before production payments: Stripe verifies acknowledgement rather than completion

Evidence: [Stripe provider execute/reconcile](../apps/api/src/integrations/stripe-provider.ts).

The generic object schema permits an optional status. Execute returns `VERIFIED` after a parse without capability-specific terminal-state verification. Reconciliation can report verification simply because a resource can be fetched; refund lookup selects a refund without proving it is the exact requested mutation.

Reproduced: a mocked payment-intent response with `status: requires_action` for `payments.execute_charge` returned `VERIFIED`. This adapter rejects production Stripe keys, so the demonstrated defect is in test-mode execution, not a proven live-money loss.

Repair: bind verification to exact account/resource/action, expected amount/currency and capability-specific state. Return pending/uncertain/failure when completion cannot be proven; match reconciliation to the original mutation identity rather than any existing resource.

### A6 — P2: commercial read adapters discard their validated business data

Evidence: [commercial read providers](../apps/api/src/integrations/commercial-read-providers.ts), [provider result contract](../apps/api/src/integrations/business-providers.ts), and business runtime metric/outcome handling.

Xero, Google Ads, GA4 and Shopify adapters validate response records, then return a summary/reference. GA4 does not populate the optional metric result or expose typed rows. The runtime's metric update path cannot consume an absent metric result.

Reproduced: a valid GA4 response containing numeric value `42` returned `VERIFIED`, with neither `metric` nor `rows` in the result. No conclusion is drawn that all company metrics are broken; webhook/manual/canonical observation paths are separate.

Repair: add bounded shared schemas for provider-specific semantic results, preserve period/unit/currency/provenance, and connect validated values to existing canonical metric storage. Keep sensitive raw content out of audit/logs.

### A7 — P2: repository checks are not portable or fully green

The corpus tests read a hardcoded absolute file under a developer's macOS Downloads directory. Four tests fail when that private fixture is absent. Application-discovery coverage also fails on this Linux environment because the macOS discovery behavior is not suitably isolated/gated.

Root build invokes the Mac agent's native Swift build unconditionally. The CI validation workflow runs on Ubuntu and invokes that same root build. Here it fails with missing `swiftc`; providing Linux Swift would still not supply macOS Speech/AppKit frameworks. Native acceptance should run on a macOS job; Linux should have an explicit supported build boundary.

Evidence: [corpus tests](../apps/api/src/human-understanding/corpus.test.ts), [application-discovery tests](../apps/mac-agent/electron/application-discovery.test.ts), [Mac package scripts](../apps/mac-agent/package.json), [CI](../.github/workflows/ci.yml).

Repair: repository-owned synthetic fixtures, platform-independent mocks, and appropriately gated native tests/builds. Do not conceal failures by skipping governance tests.

### A8 — P2 pending reachability review: production dependency advisories

`pnpm audit --prod --json` reported one high and one low advisory in locked `@grpc/grpc-js@1.14.4`. Both are patched in 1.14.5 for this version line. The high issue concerns certificate authorization via `getAuthContext`; the low issue concerns handler-error disclosure. Exploitability in Athena was not demonstrated and requires dependency-path and configuration review.

Evidence: [lockfile](../pnpm-lock.yaml), [high advisory](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [low advisory](https://github.com/advisories/GHSA-f596-whhp-79r4). The registry findings were independently checked against the published advisories on the audit date.

## Capability assessment by section

### Autonomous engineering — 7/10

Implemented: registered repository/workspace identities; bounded reads and edits; isolated Git worktrees; fixed reviewed command profiles; Docker-isolated validation; signed server requests and signed device results; task dependencies/concurrency; model escalation; Agent OS sessions; independent review; integration candidates; governed local fast-forward merge; project initialization; finite dependency changes; localhost previews; pause/retry/cancel and lease fencing.

Evidence: [runtime](../apps/api/src/engineering-runtime/service.ts), [manager](../apps/api/src/engineering-orchestration/service.ts), [AI worker](../apps/api/src/engineering-orchestration/ai-worker.ts), [integration](../apps/api/src/engineering-integration/service.ts), [delivery](../apps/api/src/engineering-delivery/service.ts), [Mac implementation](../apps/mac-agent/electron/engineering-runtime/runtime.ts).

Limits: manager decomposition is bounded deterministic/category-based logic; difficult conflicts escalate; source/redaction coverage is bounded; combined review diffs are bounded; live trusted-Mac acceptance was not run. Reviewed images, trusted device, registered profiles, providers and migrations are prerequisites. Automatic PR publication, production deployment and cloud previews are outside the documented delivery boundary. Earlier phase-specific documents can describe limitations superseded by later phases; current code and composition take precedence.

Suitable target: supervised feature implementation through a validated local candidate. A release-ready score requires repeated real-device runs, measured acceptance against owner criteria, and governed release adapters if publication is desired.

### Research — 7/10

Implemented: explicit `web.research` capability; provider web-search requests; search-call/source extraction; task result receipts; retrieved/cited URL matching; refusal to accept research solely from model prose; bounded objective verification and evidence-gap recovery; existing memory/knowledge infrastructure.

Evidence: [OpenAI provider](../apps/api/src/ai/providers/openai.ts), [workforce research execution](../apps/api/src/workforce-runtime/service.ts), [objectives](../apps/api/src/objectives/service.ts).

Limits: a source URL proves retrieval, not correctness of every assertion. Live breadth, freshness, conflicting-source handling, primary-source quality and recommendation usefulness were not benchmarked. Counted research results reuse a lead-like record structure, which may constrain richer reports. This audit did not invoke paid models or external research workflows.

Suitable target: bounded sourced research for owner review; benchmark factual support, requested-subject coverage, uncertainty and source freshness before calling it autonomous research quality.

### Business operations — 4/10

Implemented: company/owner scopes, workforce assignments, objective decomposition, budgets and reservations, durable cross-company coordination, KPI read models, management reviews, attention feeds, commercial limits and outcome attribution. These are substantial coordination/control surfaces.

Actual bootstrap adapters: Gmail; Stripe test mode; Xero sandbox reads; Google Ads test-account reads; GA4 reads; Shopify development-store reads. They are conditionally installed only when configured. CRM, support, documents, projects and GitHub business-operation providers start unavailable and have no concrete provider wired in the reviewed bootstrap. Existing engineering integration descriptors do not themselves establish those business-operation implementations.

Evidence: [provider wiring](../apps/api/src/index.ts), [unavailable defaults](../apps/api/src/integrations/business-runtime.ts), [management](../apps/api/src/company-management/service.ts), [business read model](../apps/api/src/business-os/service.ts), [durable production composition](../apps/api/src/durable-execution/production.ts).

Limits: management is largely advisory; forecasts use a sparse two-observation continuation; third-party live acceptance and safe recovery are not demonstrated here. Findings A1–A6 block confidence in unattended business effects. Company strategy, staffing and budget metadata do not equate to running sales, support, bookkeeping and fulfilment.

### Branding — 3/10

Implemented substrate: content strategist and brand reviewer catalog identities, generic AI drafting/review, company context and knowledge. Those names and role descriptions are not a verified brand production workflow.

Evidence: [workforce catalog](../apps/api/src/agent-workforce/catalog.ts), [department capability grants](../apps/api/src/agent-workforce/service.ts).

Not located as a dedicated governed pipeline: versioned brand brief/voice/style rules, approved asset library, image/video generation adapters, design-export workflow and deterministic brand acceptance checks. Text advice may be possible through generic reasoning; consistent ready-to-use visual brand delivery was not established.

Next capability: owner-reviewed brand brief, bounded versioned asset references, shared output contracts and finite approved generation/export tools.

### Marketing — 3/10

Implemented substrate: marketing/content/growth role identities, email draft capability, objective/experiment records, and test-account campaign reads. The marketing department's explicit business grants include `analytics.read_metric` and `email.create_draft`; the real GA4 adapter exposes `analytics.query_*`, which further illustrates that declared role access and a live provider need explicit alignment.

Not established: usable end-to-end campaign analytics from these read adapters, live campaign/creative write adapters, distribution and conversion feedback across channels, or a measured campaign optimization loop. Declared ad budget/draft operations and deterministic tests are not live ad management.

Next capability: one reviewed campaign path from owner brief to draft, approval, finite provider dispatch, independent verification and canonical outcomes. Spending and publishing must remain risk-governed.

### Social media — 1/10

No dedicated LinkedIn/Instagram/Facebook/X/TikTok account or publishing adapters, versioned post queue, publish scheduler, engagement retrieval or platform reconciliation path was located in the reviewed integration contracts/provider wiring. Generic content drafting and agent labels do not prove social management.

Next capability: one explicitly registered platform/account, bounded draft/media references, digest-bound approval, scheduled dispatch through the existing durable system, provider idempotency and independent publish reconciliation. Incoming posts/comments remain untrusted evidence.

## Other system areas

| Area                            | Assessment                                                                                                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity and central governance | Strict shared schemas, hashed sessions/recovery codes, scoped recent auth, deny-default policy and audit are substantial. Business dispatch fails to compose several of these controls correctly.                                               |
| Memory and learning             | Existing owner-scoped memory, knowledge graph and advisory learning infrastructure; no measured retrieval-quality benchmark or live privacy inspection performed.                                                                               |
| Desktop/native operations       | Finite reviewed providers and signed transport exist; capability coverage is explicitly uneven. Unavailable capabilities should remain denied, not receive generic automation fallbacks.                                                        |
| Voice and gestures              | Persistent input/runtime architecture, bounded metadata and local processing boundaries are documented/implemented. Input must remain separate from approval authority. Sensor behavior was not live-tested.                                    |
| Dashboard/mobile                | Many operating views and responsive web surfaces exist. Web production build passes with large-chunk warnings. Actual owner-task usability and native/mobile device behavior were not evaluated.                                                |
| Production operations           | PostgreSQL migrations, scheduler/lease code, telemetry and private/cloud configuration parsers exist. Passing synthetic configuration validation is not checking this deployment, migration state, backups, credential bindings or live health. |

## Verification results

The preinstalled default Node was 20, outside the repository's declared range. Supported Node 22.23.3 and the repository-pinned pnpm 11.17.0 were used for final checks via a temporary tool path; package manifests and lockfile were not changed.

| Check                          | Result                                                                                                                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`               | PASS across shared, config, API, Mac agent and web.                                                                                                                                                                                      |
| `pnpm lint`                    | PASS on supported Node with an increased heap; the first default-runtime attempt aborted.                                                                                                                                                |
| `pnpm test` on supported Node  | FAIL: 1,062 passed, 5 failed, 53 skipped; 167 test files passed, 2 failed, 25 skipped. Failures are four missing corpus fixture tests and one application-discovery test. PostgreSQL/live-account suites require explicit prerequisites. |
| Root `pnpm build`              | FAIL at Mac-native Swift step on Linux (`swiftc` unavailable); shared/config/API and Mac JS bundles built first.                                                                                                                         |
| Web build separately           | PASS; Vite reports large output chunks.                                                                                                                                                                                                  |
| API repository security check  | PASS; this is a narrow invariant scanner, not proof that business governance is correctly composed.                                                                                                                                      |
| Production-config verification | PASS for hardcoded private/cloud example profiles; does not validate actual deployment credentials/network/database.                                                                                                                     |
| Production dependency audit    | FAIL: one high and one low advisory in `@grpc/grpc-js`.                                                                                                                                                                                  |
| Synthetic probes               | Reproduced A1–A6's explicitly described behavior; no real external side effects.                                                                                                                                                         |

The native build modified generated tracked artifacts as part of its package script; those audit-generated changes were restored. Only this audit document is intended to remain changed.

## Prioritized completion plan

1. **Close the business governance gaps first.** Existing policy/stop enforcement, valid approval status, high-risk recent-auth requirements and scoped idempotency caches. Acceptance must include stop asserted after approval, approval expiry during dispatch, company/account key collisions, and no provider call on denied/unknown state.
2. **Make verification and data real.** Capability-specific Stripe terminal states and exact reconciliation; bounded typed read results; canonical metric lineage. Exercise pending, timeout, malformed, stale and wrong-account responses.
3. **Make checks portable and finish live acceptance.** Own test fixtures in the repository; split Linux and macOS jobs; run migrated PostgreSQL concurrency/recovery suites and reviewed Mac/Docker acceptance. Review and update the vulnerable dependency through the normal change process.
4. **Prove one complete owner workflow per useful domain.** Engineering request to reviewed candidate; research request to evidence-backed answer; email brief to approved verified send. Record completion, acceptance quality, human intervention, cost, retry and recovery outcomes; do not assign success from prose.
5. **Extend business coverage through existing finite adapters.** Prioritize one actual CRM/support/project provider according to the owner's workflow. Reuse registries, schemas, policy, approvals, durable execution and audit.
6. **Build branding/marketing/social workflows on that substrate.** Versioned brand context and assets, reviewed campaign drafts, one social platform, scheduling and outcome collection. Each new effect requires a declared trusted capability and verification; no arbitrary browser, shell or application-control endpoints.

The practical next milestone is a dependable supervised engineering/research assistant with a small number of verified business workflows. Fully unattended business operations are not supported by the evidence collected here.
