# Phase 25.6 — Durable Cross-Company Execution

## Architectural outcome

Alexa owns the service contract, workflow meaning, policy checkpoints, company scope, output boundary, and audit trail. External execution infrastructure is replaceable plumbing and never an authorization authority.

The implemented path is:

`source company → explicit service contract → destination policy/approval → workforce resolution → Agent Economy reservation → atomic PostgreSQL lease → reviewed activity adapter → reconciliation/verification → economy settlement → bounded result`

There is no shared cross-company memory, credential, dataset namespace, agent definition, or direct company-to-company query path.

## External research and decisions

### Temporal

Inspected local `external-research/temporal` at research revision `c044bf16b1cc`, focusing on workflow history, activity/worker separation, retry and cancellation semantics, idempotency, and worker recovery.

Adopted natively:

- deterministic workflow keys and explicit durability classes;
- append-only, ordered execution history;
- workflow/activity separation;
- bounded retry with permanent/transient/policy failure classification;
- cancellation, deadlines, external waits, pause and archive handling;
- activity receipts and reconciliation before retrying an uncertain external commitment.

Decision: **native PostgreSQL durable backend, Temporal-compatible boundary, no Temporal runtime deployment in Phase 25.6**. A Temporal cluster, SDK, namespace, worker fleet, visibility store, and operational runbook would add a major dependency before Alexa's current scale requires it. The `backend` discriminator preserves a migration path. Trivial workflows remain native. Alexa workflow records remain the product source of truth.

Not adopted: Temporal's server, persistence stack, frontend service, matching service, namespace administration, and per-SDK workflow APIs.

### E2B

Inspected local `external-research/E2B` at research revision `5a56c87e9db0`, focusing on short-lived sandbox lifecycle, templates, explicit file transfer, resource limits, timeout, and destruction.

Decision: **local equivalent, not the E2B cloud service**. Alexa uses a fixed, reviewed Docker invocation with an ephemeral directory, `--network none`, read-only root and input mount, a single writable output mount, non-root UID, dropped capabilities, no-new-privileges, CPU/memory/PID/tmpfs limits, bounded timeout, opaque company artifact references, output-size enforcement, output redaction, and unconditional teardown.

Not adopted: E2B cloud control plane, API keys, templates, internet-enabled sandboxes, arbitrary package installation, persistent sandbox sessions, and direct secret injection. The result model retains `E2B` as a future provider discriminator, but no E2B runtime is claimed.

### LiteLLM

Inspected local `external-research/litellm` at research revision `4ba851713481`, focusing on normalized provider calls, retry/fallback, cooldown, health, budgets, and proxy routing.

Decision: **adapter-only optional integration**. `LiteLLMGatewayProvider` can connect AIRouter to an explicitly configured, server-controlled LiteLLM deployment. AIRouter still selects the exact model, enforces locality/data policy, owns fallback, and records economics/telemetry. The adapter allows only configured hosts and models, requires HTTPS except loopback, uses bounded timeouts and rate-limit cooldown, and never accepts a client-selected endpoint. No LiteLLM process is deployed by this phase.

Not adopted: LiteLLM as the policy authority, unrestricted aliases, client-selected providers, its internal fallback as an alternative to AIRouter, or a separate cost ledger.

## Persistence and migration

Migration `0088_phase_25_6_durable_cross_company_execution.sql` creates the shared logical infrastructure. Additive migration `0089_phase_25_6_production_acceptance.sql` adds scheduler leases, due times, economy references, activity evidence, and consistency constraints for:

- collaboration policies;
- cross-company service contracts;
- durable executions and ordered events;
- activity idempotency/reconciliation receipts;
- sandbox execution results.

Every record carries `owner_id`; every company record carries `company_id`; composite foreign keys prevent cross-owner company, request, execution, and event relationships. PostgreSQL stores bounded structured records, not secrets or arbitrary payload logs. Apply the ordinary database migration before enabling routes. Rollback is application-level disablement and record preservation; destructive rollback is intentionally not supplied.

## Security and operations

- Both companies must be active, both collaboration policies must name the peer, and both Phase 25.4 data policies must explicitly permit external transfer.
- Service type, sharing scope, capabilities, budget, confidentiality, output types, deadline, and assignments are validated server-side.
- Approval is company-scoped and digest-bound. Restricted and high-budget transfers require approval; dataset sharing also requires approval.
- Policy and assignment state are revalidated before the first side effect. Revocation becomes a durable policy failure.
- Workforce resolution reuses an active assignment, lazily activates a dormant assignment, or assigns a matching reusable catalog definition. It never creates a duplicate definition. Missing readiness fails as `DESTINATION_CAPABILITY_GAP` after catalog options are exhausted.
- Agent Economy reserves the selected paying assignment's approved budget before durable execution exists. Successful verified work settles actual cost idempotently; pre-effect failure/cancellation releases the reservation. Unsupported shared/portfolio payment modes fail explicitly.
- Production PostgreSQL workers atomically claim due executions with `FOR UPDATE SKIP LOCKED`, expiring renewable leases, bounded global/per-company concurrency, and short per-company advisory locks. No public/manual advance endpoint bypasses the scheduler.
- The reviewed `company.artifact.report` adapter performs a real, non-destructive, company-scoped artifact write. Its provider key is idempotent and its reconciliation result is explicitly `COMMITTED`, `NOT_COMMITTED`, or `UNKNOWN`.
- A committed activity receipt is reused. A started-but-uncertain activity is reconciled and parked if commitment cannot be proven.
- Company pause/suspension parks execution; archive cancels it; owner cancellation prevents future activities.
- Output filtering occurs against the original permitted-output contract. Destination private memory and credentials are never part of the executor input or result model.
- OTel spans correlate owner, destination company, workflow/execution, request, and service request without payloads or secrets. Phase 25.5 AI telemetry remains owned by AIRouter/provider execution.

## Deployment requirements

Required:

- PostgreSQL migrations 0088 and 0089;
- the single centralized scheduler starts automatically for PostgreSQL production deployments; horizontal API workers share database lease authority;
- registered cross-company activity adapters with idempotency and reconciliation implementations;
- a reviewed Docker binary and pre-pulled fixed Node/Python images to enable local sandbox execution;
- an artifact resolver backed by existing company-scoped storage.

Optional:

- a controlled LiteLLM deployment, server-only API key, HTTPS endpoint, host allowlist, and explicit model list;
- a later Temporal deployment if measured durability throughput/operability justifies it;
- a later E2B provider if local isolation cannot meet a reviewed workload.

## Completion-patch acceptance

The completion patch proves the previously missing operational path:

- PostgreSQL multi-worker claim races produce one lease owner per execution; expired leases are reclaimed with an incremented generation.
- Scheduler activity leases heartbeat during work. Receipts and provider idempotency protect the external effect if a worker dies after commit.
- A production-like end-to-end test persists an approval wait, reconstructs API and scheduler instances, simulates a crash after the artifact effect commits, reconciles it from a new worker, returns a filtered verified result, and settles Agent Economy once.
- Component tests cover lazy workforce activation/release, reusable definition selection, explicit capability gaps, paying-company isolation, settlement idempotency, output filtering, lifecycle/policy revocation, sandbox bounds, and owner isolation.
- The synthetic workforce test creates 100 logical companies, 119 reusable definitions, 2,000 assignments across five department slots per company, and 200 bounded runnable executions without per-company workers.
- The PostgreSQL benchmark creates 100 companies and 200 runnable executions, then runs eight concurrent claimers over four bounded polling rounds with zero duplicate claims. A representative focused run claimed 76 executions in 442.24 ms (171.85 claims/s), with 13.82 ms average batch-query latency and 895.32 ms total setup/claim time. Twenty-two empty contention batches backed off safely; no duplicate lease ownership occurred. Process RSS increased by 3,211,264 bytes during the measured fixture/claim window; CPU was 249,768 µs user and 48,333 µs system.
- Operator histories are bounded to the latest 500 events per execution in the dashboard while the append-only database/audit evidence is preserved. Lease expiry, stale external waits, overdue approval, and retry exhaustion are exposed as structured warnings.

## Remaining deployment limitations

- The production-like artifact adapter is enabled only when the deployment supplies Alexa's approved company-scoped artifact resolver. Without one, the registry fails closed and execution parks rather than fabricating success.
- The acceptance test uses a real PostgreSQL migration/claim path and a deterministic in-process artifact store; it does not call a third-party production account or credential.
- Governed manual resolution of `UNKNOWN` receipts is deferred. The safe current behavior is to park indefinitely with an owner-visible reconciliation warning; there is no unaudited force-complete route.
- Local Docker remains the sandbox implementation. Its focused tests do not require live Docker or OS mutation; deployment must separately verify reviewed images and Docker availability.
- LiteLLM remains optional and disabled by default. AIRouter remains authoritative.
- Native PostgreSQL durability meets the measured Phase 25.6 scale target. Temporal remains a later operational migration option if substantially longer workflows, richer timer visibility, or much higher worker scale create a measured need.
