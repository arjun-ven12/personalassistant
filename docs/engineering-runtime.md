# Governed engineering runtime (Phase 27.1)

Phase 27.1 adds the bounded repository/worktree substrate used by future coding
agents. It is not an Engineering Manager, worker pool, merge service, pull-request
creator, deployment system, or model router.

## Architecture

The runtime extends existing Alexa boundaries instead of creating another agent
platform:

1. Agent OS or workflow code selects an engineering repository and workspace by
   registered ID.
2. The engineering service checks owner, company, assigned agent, capability
   profile, protected-path approval, and the durable workspace lease. The
   authorizer returns a separate `protectedPathApproved` decision; an approval
   ID's mere presence never grants protected-path access.
3. The service resolves the repository through the existing governed workspace
   registry. Callers and models never submit repository roots or worktree paths.
4. The existing execution service binds company, repository, engineering
   workspace, registered workspace locator, agent/task, capability, operation,
   request, and idempotency identity into a server-signed Ed25519 envelope.
5. The trusted Mac Agent verifies the pinned server key, device binding,
   timestamp, expiry, and one-time nonce before its finite engineering
   dispatcher invokes the native runtime. Results return through the existing
   device-signed result, replay protection, lifecycle, and audit path.
6. Postgres stores repository registration, workspace identity/base commit,
   lifecycle, fenced lease state, validation summaries, executions, and bounded
   learning/cost attribution. Redis may accelerate short-lived coordination but
   is never durable truth.
7. Meaningful operations emit existing governance audit events without source
   bodies, command output, secrets, or sensitive action arguments.

AIRouter remains above this runtime. The contracts contain optional provider,
model, request, token, and cost attribution, but the runtime never chooses a
model and has no Codex dependency.

## Repository registration

`EngineeringRepository` is owner- and company-scoped and points to a registered
workspace locator. Registration checks the locator, Git checkout, default branch,
active command profile, and deterministic repository metadata. The default branch
is always protected. An explicit list limits which agents may receive the repo.

Metadata detection is deterministic and bounded: tracked filenames identify
TypeScript/JavaScript, Python, JVM/Gradle, package managers, common framework
hints, and important config files. Repository contents are not copied to
Postgres.

Command and capability profiles are governance records. Engineering capability
requests cannot create profiles, register executables, grant repository access,
or weaken protected paths.

## Worktree lifecycle

Creation records the source `HEAD`, derives an opaque worktree locator, and
creates a deterministic `alexa/<task>-<slug>` branch with fixed Git arguments.
The provider derives the on-disk path from its administrator-configured worktree
root. It never accepts a caller path or branch. Creation is idempotent for
`owner + company + repository + idempotency key`.

The source checkout must be clean and on its registered default branch. The
runtime never stashes, commits, resets, or overwrites human work. Each task gets a
separate Git worktree. Cleanup refuses dirty worktrees and never uses `--force`,
so cancelled or failed changes remain inspectable in normal IDE tooling.

Durable states are `CREATING`, `READY`, `DIRTY`, `VALIDATING`, `COMPLETED`,
`FAILED`, `CANCELLED`, `CLEANING_UP`, and `ARCHIVED`. Recovery reconciles
Postgres records with actual worktrees after restart. Missing worktrees become
`FAILED`; dirty worktrees become `DIRTY`.

## Repository capabilities

The capability registry declares finite operations for inspect, search, bounded
read, create, patch, recoverable delete, Git status/diff/log, worktree
create/remove, registered command execution, and validation. The initial service
implements search, read, create, patch, recoverable delete, status, diff,
worktree lifecycle, commands, and validation. Git log is declared for forward
compatibility but deliberately not dispatched until its bounded result contract
and signed transport mapping are implemented.

Text search uses fixed `git grep` arguments; filename search uses `git ls-files`.
Both are bounded and exclude dependency/build directories. Reads support bounded
line ranges, reject binary/invalid UTF-8 content, and redact common secret forms.
Large semantic indexing is intentionally out of scope.

Edits use expected SHA-256 plus bounded line hunks and an atomic same-directory
temporary-file replacement. Creation is separate and rejects existing targets.
Deletion is also separate, requires an approval ID through policy, verifies the
expected hash, and moves the file into an administrator-controlled recovery area
outside the worktree. No permanent-delete capability exists.

All relative paths are Zod-validated. Absolute paths, `..`, wildcards, null
bytes, dependency/build locations, static symlink traversal, and canonical paths
outside the worktree are denied. Protected path patterns are checked by both the
service authorization boundary and provider.

## Command profiles and validation

Callers select a registered command ID only. A profile owns the executable,
argument vector, operation kind, timeout, output bound, network policy, and
validation order. The initial executable vocabulary supports pnpm, npm, pytest,
ruff, mypy, and Gradle without accepting raw shell text.

Arguments are restrictive tokens and execution always uses `spawn` with
`shell: false`. Shell chaining, substitution, redirection, `sudo`, arbitrary
executables, caller cwd, caller environment, and executable paths are
unavailable. The process receives a minimal environment without inherited
server secrets. Timeouts and cancellation terminate the process group, and
stdout/stderr are bounded and redacted.

Commands fail closed unless a runner attests network isolation. The provided
Docker runner uses `--network none`, a fixed local image name, no implicit image
pull, memory/CPU/PID limits, dropped capabilities, and `no-new-privileges`.
Administrators must build and review these local images:

- `alexa-engineering-node:1` with Node, npm, and pnpm;
- `alexa-engineering-python:1` with Python, pytest, ruff, and mypy;
- `alexa-engineering-gradle:1` with the approved JDK/Gradle toolchain.

Validation runs the repository profile's ordered subset and stops on the first
failure. Results distinguish pass/fail/error/cancelled, retain bounded raw output,
and provide lightweight file/message extraction for common compiler/test output.

## Persistence, leases, and recovery

Migration `0096_phase_27_1_engineering_runtime.sql` creates company-scoped
repository, command-profile, workspace, execution, and validation tables.
Workspace acquisition uses an atomic expiring Postgres lease with a monotonically
increasing generation fence. Only the matching worker and fence may release it.
Expired leases can be reclaimed after worker failure. An in-memory store exists
only for unit tests and explicit development use.

## Security boundary and limitations

- No public shell or arbitrary filesystem endpoint was added.
- No push, commit, force-push, merge, PR, deploy, or production release exists.
- No production credentials are injected; inherited environment variables are
  discarded.
- Source/diff output is bounded and secret-redacted, but lightweight pattern
  scanning is not a substitute for a dedicated secret-scanning review.
- Static symlink escapes are rejected. A hostile local process racing directory
  replacement requires OS-level filesystem sandboxing beyond this phase's trusted
  Mac Agent boundary.
- Engineering operations use the existing signed Mac Agent polling transport;
  no second socket, daemon, shell endpoint, or direct model-to-OS path exists.
- The Docker runner requires prebuilt reviewed local images and never downloads
  toolchains at execution time. The minimum Node image recipe and review steps
  are in `deploy/engineering-sandbox/README.md`. Keep the runtime disabled until
  that image is locally provisioned and smoke-tested.
- Git log is registered but not dispatched in this first implementation.

The focused transport test covers server signing, pinned-key verification,
device binding, scope rejection, request/idempotency binding, timestamp/expiry,
Mac-side nonce replay rejection, native dispatch, structured output, device
result signing, and backend result acceptance. PostgreSQL integration coverage
exercises racing lease claims, expiry, crashed-holder recovery, and stale-fence
mutation/release rejection.
