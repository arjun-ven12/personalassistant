# Autonomous software delivery and Engineering Control Center

Phase 27.4 composes the existing Engineering Manager, Agent OS sessions,
Workforce matching, signed Mac Agent transport, Engineering Runtime, integration,
review, and governed merge records into one company-scoped delivery view. It does
not add a second agent runtime, generic command endpoint, deployment path, or Codex
dependency.

## Owner flow

An authenticated owner can open **Engineering**, describe software in ordinary
language, and select either an existing engineering project or a registered
development root. Alexa converts the request into a bounded engineering objective,
shows actual task and agent state, integrates completed task work, runs configured
validation and independent review, and starts a localhost preview only after a
READY candidate exists. Voice requests use the same delivery service and security
context. Follow-up instructions create bounded child work through the existing
Engineering Manager; they do not restart an objective or mutate completed work.

The API surface is `/api/engineering-deliveries`. Reads require authentication and
company scope. Mutations additionally require trusted origin, CSRF, and verified
private transport. Request identities and follow-up instruction identities are
idempotent.

## New projects and dependencies

A new project must be placed under an enabled, registered development-root
workspace with explicit write, create, modify, script, branch, and commit
permissions. The destination name is derived from the project name; clients and
models cannot supply a path. Existing destinations, broad or blocked roots, and
symlink escape are denied. Initialization uses a reviewed deterministic template,
installs pinned template dependencies in the reviewed engineering Docker image,
creates a Git repository, and records the initial commit before the repository can
become ACTIVE.

Dependency operations are finite `pnpm` or `npm` capabilities. Package names and
versions are schema validated; URLs, Git sources, executable paths, lifecycle
scripts, caller-provided commands, auth configuration, and secret injection are
not accepted. Add and remove remain explicit-approval capabilities. Registry
network access currently uses Docker's ordinary bridge network; domain-level
egress allowlisting is a future hardening item. A failed initial install leaves the
INITIALIZING directory for owner inspection instead of deleting or overwriting it.

## Preview lifecycle

Development servers are selected from the repository's reviewed command profile.
They run in the reviewed sandbox image with dropped capabilities,
`no-new-privileges`, bounded CPU, memory, output, startup time, and total lifetime.
Only a loopback host port in the reserved 4173–4273 range is published. The runtime
performs an HTTP health check and returns structured process, port, URL, health,
and expiry state. Status, restart, and stop reuse the signed transport and exact
preview identity. Preview is development-only: it does not publish, deploy, push,
merge, or expose a public tunnel.

## Model policy and evidence

Routine implementation begins at Luna. Terra is used for harder work, Sol for
security-sensitive or complex work, and Astra only through the existing critical
escalation policy. Engineering identities remain logical agents backed by isolated
Agent OS sessions and isolated worktrees. The Control Center presents persisted
task progress, active assignments, attempts, model tier, tokens and cost, changed
files, validation, review, warnings, and timing. It does not synthesize terminal
output or claim activity absent from the underlying records.

## Recovery and limitations

Phase 27.4 reuses Phase 27.1 leases and Phase 27.2 task retry/replanning limits.
Pause, resume, cancellation, clarification, crash recovery, conflict repair, and
merge continue through their existing governed services. A trusted, enrolled,
online Mac Agent and the reviewed sandbox image are required for real execution;
the API fails closed when either is unavailable. The dashboard currently refreshes
bounded state every three to five seconds because the repository has no canonical
engineering realtime event stream. Production deployment, cloud preview hosting,
automatic PR publication, and unrestricted shell or Git remain out of scope.

## Local verification

Focused coverage includes natural-language voice routing, company isolation and
idempotency, Luna-first composed delivery, integration/review/preview completion,
new-project initialization, dependency validation, isolated worktrees, preview
lifecycle, governed merge, repair, leases, and stale-holder fencing. Run the focused
tests first, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
`git diff --check`.
