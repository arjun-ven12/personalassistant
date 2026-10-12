# Phase 28.3 Self-Improvement Mode

## Registered identity and control flow

`ALEXA_SELF_IMPROVEMENT_REPOSITORIES` is a server-only bounded JSON array of
`{companyId, repositoryId}` UUID pairs, with one binding per company. Each run
rechecks an ACTIVE owner/company Engineering repository. An empty, duplicate,
revoked or unknown binding denies self execution. Nothing searches the host
filesystem or trusts repository names as authorization. Generic Engineering
creation against a bound Athena repository must use the self-improvement path.

`POST /api/self-improvement` accepts only request, acceptance criteria and an
idempotency key. Existing company authentication, trusted origins, CSRF and
private-network guards apply. Voice recognizes clear Athena-targeted changes
through the existing Engineering gateway. The Engineering dashboard has a compact
self-improvement entry and existing status/files/validation/review/candidate views.
Phone clients reuse GET status/list, pause/resume/recover/cancel, instructions,
clarification and rejection contracts; full mobile UX belongs to 28.4.

## Risk and execution

Deterministic request/criteria/relative-target-path rules classify LOW, MEDIUM or
HIGH before inference. Authority and protected paths cannot be downgraded by a
model. Actual changed-file checks run at integration, repair/prepared commit and
merge boundaries. A routine objective that changes authority is blocked for a
separate stronger objective rather than silently continuing with its old policy.

FAST creates one scoped coding worker, reusing Agent OS, AIRouter, the signed Mac
Agent transport, finite registered capabilities, isolated worktrees and existing
validation. Independent integration review still runs. FULL reuses Engineering
Manager decomposition and dependency scheduling. Existing cheap-first routing,
bounded context/memory, proposal batches, repair limits, validation freshness,
leases and replay protections remain active. High risk requires stronger
implementation, independent security review and the canonical recent-authenticated
owner merge approval. No model or agent can approve its own authority change.

Candidates use existing Phase 27 integration records: head/base, exact validation
and review heads, changed files, acceptance evidence, warnings and preview.
Implementation does not mutate a protected default branch or running production.
There is no automatic self-deployment, restart, cloud worker, local coder,
training pipeline or second executor. The existing explicit owner merge operation
is separate from candidate creation. Rejection blocks the candidate and preserves
its worktree, costs and evidence.

## Recovery and evidence

Pause/resume/cancel/clarification and incremental instructions reuse existing
Engineering controls. Instructions cannot expand a low-risk run into authority
work; a separate objective is required. Existing leases, task/worktree identities,
validation hashes and integration recovery preserve completed work without blind
patch replay. Self creation uses the existing transaction boundary and resumes
execution after commit; interrupted planning becomes a bounded owner Resume checkpoint.

GET `/:deliveryId/telemetry` projects exact linked model ledger and signed
execution requests. POST `/:deliveryId/benchmark/capture` persists a snapshot in
existing Engineering events; terminal delivery notifications also capture it.
Recorded milestones include persisted acceptance/objective/task, actual ledger
model start, signed patch completion, validation and candidate timestamps. Missing
or saturated source evidence remains partial/null. Models, providers, tokens,
known USD costs, worker/review/repair calls and finite capability counts reuse
existing economics; no new ledger exists. Recorded owner interventions cover
pause/resume/clarification events only. Unrecorded human work is unknown.

POST `/:deliveryId/benchmark/comparison` accepts the shared benchmark contract
only with OWNER_ENTERED provenance, a non-Athena system and this exact delivery
identity. This cannot fabricate runtime Athena evidence or grant execution.

## Accepted-update memory

Self task artifacts are excluded from early memory promotion. After a governed
merge, exact-head validation and independent passing reviews gate promotion of
bounded stable artifact types through the existing scoped Memory Indexer. Failed
promotion is audited without rewriting a successful merge; same-key retries
reuse existing duplicate checks. Cross-process atomic promotion remains unproven.

## Live acceptance still required

Register Athena itself through existing Engineering setup and configure its
company binding; confirm reviewed validation commands, agents and the trusted Mac
workspace. Run an owner-authenticated safe UI/bug change through Athena, without
manually implementing that acceptance feature in Codex. Record the actual model,
provider, first patch, validation, review, candidate, cost and timing evidence.
Then run three trivial, three small and two medium tasks using the same harness.
No sandbox timestamps count as performance evidence. Routine targets (<2 minutes
for a small edit and approximately <=1.25 times comparable Codex completion)
remain unmeasured targets. Automatic affected-command selection and a material
frontier-cost advantage require live evidence/configured reviewed profiles.

Phase 28.2 creative/landing live acceptance remains carry-over only; rollout is
deferred to 28.6 unless needed earlier. Do not reopen Marketing architecture.
