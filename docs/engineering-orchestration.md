# Engineering Manager and parallel coding workforce

Phase 27.2 extends the existing Agent OS and Phase 27.1 engineering runtime. It
does not introduce a second agent framework or a model-owned executor.

## Architecture

An engineering objective is owner-, company-, and repository-scoped. The
existing `engineering_manager` logical agent creates a deterministic bounded
repository summary before decomposition. A normal objective produces 3–12
tasks with explicit dependency IDs and a maximum depth of one in this phase.
The scheduler starts at most 3–6 ready tasks and immediately evaluates newly
unlocked dependencies after completion; it does not poll a manager model for
status.

Existing company agent assignments are reused as execution identities. Backend,
frontend, database, mobile, testing, security, native, infrastructure, and
generalist roles are matching profiles, not resident model processes. Dormant
agents have no process or model allocation. Repository authorization compares
the company assignment UUID, not a caller-provided role name.

Every leased task is represented by the existing Agent OS isolated-delegation
session. The session binds the company, repository, objective, task, logical
agent assignment, capability-grant profile, bounded memory references, selected
model tier, sandbox profile, and execution state. The session is completed or
failed with the AIRouter provider/model identity and the structured validation
outcome. Engineering agents remain logical identities; a session does not create
a resident model process.

Candidate ordering delegates to the existing Workforce Runtime scorer after
company and repository authorization have established the eligible set. Skills,
capabilities, reputation, calibration, availability, active workload, and cost
efficiency are reused. A department identifier is not inferred from an
engineering role name, so department affinity remains neutral when the task has
no real department ID. Workforce scoring never weakens the repository or company
hard gates.

Mutating tasks receive separate Phase 27.1 workspaces. Read-only architecture
tasks may operate from deterministic registered repository metadata; read-only
tasks that need search, file, status, or diff capabilities receive an isolated
snapshot worktree. Dependency outputs are bounded typed artifacts such as API contracts,
schema summaries, test expectations, and migration notes; raw conversations and
private reasoning are not persisted.

Implementation agents add focused tests in the same isolated worktree as their
change. The dependent QA task reviews the prior test and validation evidence
read-only; it does not write feature tests against a separate clean-base
worktree. The combined integration candidate still must pass the full registered
validation profile and independent review. Legacy blocked QA tasks can reuse
prior test evidence only when every dependency has a passing persisted TEST
report and at least one dependency changed a test file. The failed QA worktree
is excluded from integration and the reuse is recorded as a task event.

When a registered command profile names a dependency manager, worktree setup
uses the signed, governed dependency-install capability before marking the
workspace ready. The reviewed dependency container installs from the lockfile
without lifecycle scripts. Offline validation checks the persisted preparation
state and prepares older worktrees before another model call or offline check.
A failed install leaves a creating worktree recoverable with the same identity;
it never relaxes validation network isolation.

Before execution, the existing memory store supplies at most twelve stable
repository/semantic/procedural/agent summaries from the same company and
repository scope. After passing governed validation, only bounded stable typed
artifacts (architecture decisions, API/schema contracts, test expectations, or
migration notes) may be promoted. Blockers, transcripts, chain-of-thought,
transient error output, and speculative reasoning are not promoted. Promotion is
deduplicated and audited.

## Model and execution boundary

`AIRouterEngineeringTaskWorker` is the only production reasoning adapter. The
task policy maps routine work to a cheap CODER route, complex work to a stronger
route, and security/critical work to deep reasoning. Provider and concrete model
selection remains AIRouter's responsibility. Repeated meaningful failures may
escalate Luna → Terra → Sol, with Astra reserved for critical unresolved work.
The router's existing economy context attributes provider usage to company,
objective, task, and agent assignment.

Model output is a strict, bounded proposal of finite engineering capabilities.
`SignedExecutionEngineeringGateway` rejects undeclared capabilities, resolves
registered command IDs server-side, replaces protected-path policy fields with
server-owned values, and enqueues operations through the existing
`ExecutionService.createEngineeringExecution` signed Mac-agent channel. It does
not accept raw commands, executable paths, repository roots, environments, or
caller-computed approval/risk state. Mutating tasks cannot complete without a
passing registered validation sequence.

The worker returns bounded capability observations to AIRouter between up to six
read-only or twelve mutating proposal rounds, with the original objective and
remaining round budget. File patches must reference a hash observed from a real read of
that path; invented hashes never reach execution. Mutations invalidate prior
validation, and task completion still requires passing registered checks. Tool
observations are untrusted data, not execution authority. Cancellation and the
task cost ceiling are checked between rounds.

## Recovery and control

Objectives and task graphs are durable in PostgreSQL migration `0097`. Task
claims use expiring leases and monotonically increasing fencing generations.
Fenced updates require the matching worker, generation, and an unexpired lease.
After a crash, expired active tasks become retryable without blindly replaying a
mutation; the stable task idempotency key recovers the same worktree. Cancellation
stops new scheduling, requests cancellation of eligible signed executions, and
preserves worktrees and diffs. Pause prevents new task starts; resume performs an
event-driven scheduler evaluation.

Failure categories drive bounded retry, wait, escalation, reassignment, or owner
clarification. Policy denial never retries around governance. Missing capability
records a governance request event and never self-grants. Database,
infrastructure, security, and critical work require an independent company- and
repository-eligible reviewer.

Clarification uses the authenticated company API rather than a second
conversation system. A pending clarification has a stable ID. The owner's
bounded answer is version-fenced and idempotency-bound, added to objective
constraints, audited, revalidated against active repository authorization, and
then resumes the existing scheduler. Changed duplicate, stale, cancelled, and
cross-company answers fail closed; the same answer identity cannot start a
second execution.

## Production prerequisites

- Migrations `0096` and `0097` must be applied.
- Phase 27.1 production-security validation, server signing key, trusted Mac
  agent, private-network verifier, registered repository/workspace locator,
  repository capability profile, and reviewed command profile must be active.
- The reviewed local Docker image for each registered validation command must be
  provisioned; the Mac agent never pulls an image implicitly.
- AIRouter must have approved role mappings and economics/pricing configuration.
- Repository `authorizedAgentIds` must explicitly contain the eligible company
  agent assignment UUIDs; an empty list grants no engineering agent access.

Unknown transport, provider, repository, command, capability, policy, network,
or lease state fails closed.

Routine isolated-worktree creation, lockfile-only dependency preparation, and
registered LINT/TYPECHECK/TEST/BUILD commands honor their registered
session-approval baseline when the enabled
workspace grants the corresponding permissions. Execution still verifies the
company, repository, agent, capability profile, exact registered command, signed
device transport, and emergency stop. Explicit tool overrides remain stronger;
other commands, package add/remove, protected changes, merge, and push do not
inherit this exception. Owner Retry rechecks policy without discarding completed
tasks or granting capabilities.

## Deliberate limitations

- Phase 27.2 prepares independent validated workspaces; it does not merge,
  resolve multi-worktree conflicts, commit, push, create PRs, or integrate them.
- It does not deploy or perform production database operations.
- It does not train routing models. Durable engineering-memory promotion is
  restricted to validated stable typed facts.
- Deterministic decomposition covers the bounded initial task categories; a
  bounded replan can replace only a failed or blocked task description.
- Repository context is limited to registered metadata, important-file refs,
  dependency artifacts, constraints, prior failure summaries, and bounded
  existing-memory summaries. Full semantic indexing is deferred.
- The lightweight Phase 27.1 secret redaction/scanning scope is unchanged.
- A live end-to-end coding run still depends on configured AIRouter providers,
  an online trusted Mac agent, and reviewed repository command profiles; unit
  tests use deterministic workers and a mocked signed-transport completion.

## Verification coverage

Focused tests cover deterministic feature decomposition, dependency ordering,
10-task/four-way concurrency, unique execution, retry classification, Luna to
Terra escalation, high-risk Sol routing, reviewer independence, missing
capability denial, clarification, cancellation with workspace preservation,
crash recovery, cross-company rejection, cost attribution, stale lease fencing,
AIRouter request construction, undeclared-operation denial, server-side
registered-command resolution on the signed gateway, Agent OS session lifecycle,
Workforce Runtime candidate scoring, scoped memory retrieval and promotion,
idempotent clarification resume, and cancelled/stale clarification rejection.
