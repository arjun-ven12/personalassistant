# Audit-driven hardening — 2026-09-05

This is a deliberately bounded implementation of the repository audit, not a
claim that all audit findings are closed. PostgreSQL, the existing scheduler,
AIRouter, governance and company boundaries remain the canonical architecture.

## Selected changes

- **Sandbox artifact containment:** descriptor-based no-follow/nonblocking opens,
  regular-file and link-count checks, flat names, exclusive input creation,
  bounded reads, and whole-batch validation before artifact writes. Collection
  has a 16 MiB aggregate cap even when the requested disk budget is larger.
- **Sandbox lifecycle:** server-generated container names; explicit removal on
  success/failure/timeout; an absence check when removal fails. Unconfirmed
  removal retains the disposable mount for operator recovery and fails closed.
  `destroyed` is now a boolean: failed execution cannot assert destruction merely
  because the process runner returned. This is additive for old persisted true
  records and requires no database migration.
- **Governor decisions:** expected status, revision count, lease owner and lease
  generation participate in decision CAS. Expired leases cannot commit. Workers
  pass generations to renewal/release, abort evaluation on heartbeat failure,
  and count renewal failures without logging payloads. This does not make the
  separate objective creation, portfolio rollup and audit transactions atomic.
- **Redis:** removed the homegrown RESP encoder/parser and use node-redis under
  the existing service. A reusable connection, bounded command queue, connection
  and request deadlines, explicit TLS verification, no offline queuing/replay,
  sanitized errors and shutdown disposal replace the old per-command socket.
  Upstash responses are validated and requests have deadlines. Redis remains
  ephemeral; this is not a replacement for durable PostgreSQL fencing.
- **Provider results:** HTTP-200 error envelopes cannot become verified reads.
  Shopify additionally validates the requested response shape and returned node
  identity/type. These are boundary fixes, not completed canonical business-data
  adapters for every advertised capability.
- **Legacy retrieval:** removed incompatible fabricated vectors and paid query
  embedding calls. Keyword/hybrid requests use an explicitly reported keyword
  fallback, exclude expired/foreign-owner records and require lexical relevance
  before recency/importance boosts. Lexical candidates are preserved. Vector-only
  requests fail with `VECTOR_RETRIEVAL_UNAVAILABLE` until a compatible stored-vector
  query is wired into this legacy path. Existing company pgvector storage is unchanged.
- **Shutdown:** await telemetry shutdown rather than discarding its promise.

## Regression evidence

Tests cover output symlinks/hard links/directories/traversal/size limits, named
container removal after timeout, Redis fragmented replies and multibyte values,
failed NX locks, reused connections, malformed Shopify envelopes, expired-memory
exclusion, zero embedding calls during fallback, stale Governor generations,
heartbeat failure cancellation and competing PostgreSQL decision writes.

Tests use synthetic artifacts, local protocol fixtures and isolated PostgreSQL
schemas. No live provider credentials, physical-device operation or real Docker
containment test is claimed. Full validation results are reported in the task.

## Important remaining release work

1. Sandbox admission still needs the complete canonical effective-grant/policy
   intersection. Definition requirements must not become grants.
2. The writable Docker output bind mount still lacks an aggregate runtime disk
   quota. Bounded artifact collection is not runtime disk isolation. A real
   Docker/image acceptance test, reviewed digest pinning and an operator cleanup
   runbook are still required before production sandbox enablement.
3. Portfolio rollup, objective creation, audit/outbox and reserve-funding replay
   need a separate transaction-level hardening pass. CAS protects proposal
   decisions, not the entire multi-record business operation.
4. Explicit owner/company/department/assignment scope must replace implicit
   widening in legacy memory paths. Authorized end-to-end vector retrieval and
   sensitivity propagation remain unfinished; lexical fallback is intentional.
5. Complete provider-specific canonical business payloads, recoverable circuits,
   verified database TLS defaults and cloud retention policy remain open.
6. Android company-switch generation fencing, metric comparison identity,
   evidence-backed UI/cognition health and dashboard batching remain open.

No model was granted additional authority, no new scheduler/vector database was
introduced, and no Android or native-device runtime behavior was changed.

## Final validation — 2026-09-14

- `pnpm lint`: passed.
- `pnpm typecheck`: passed across all workspace projects.
- `pnpm test`: 163 files passed, 850 tests passed, two live-provider acceptance
  tests skipped (Gmail and Stripe); final run completed in 266.28 seconds.
- `pnpm build`: passed, including Mac Electron and the four native Swift helpers.
  Existing Web runtime-config and large-chunk warnings remain.
- `git diff --check`: passed. Regenerated tracked Mac build artifacts were
  excluded from this source patch.
- PostgreSQL integration fixtures exercised migrations and decision fencing.
  The existing 100-company / 200-runnable-execution benchmark reported 64 claims,
  zero duplicate claims and 32 failed claim attempts. This is a bounded synthetic
  contention check, not proof that all 200 executions completed or a production
  throughput improvement.
- Android was unchanged; Gradle was not run. No production migration, deployment,
  physical-device, live-provider or real Docker acceptance is claimed.

Verdict: selected changes are code-validated; the remaining release work above
prevents claiming system-wide optimization is complete.
