# Small reviewable slices

Order reflects actual missing acceptance, not a proposal for another coding platform. The safety prerequisite is implemented first; subsequent entries are plans, not granted authority.

## E2E-0 — Critical test/development-toolchain prerequisite (implemented)

Problem: MCP-1B retained two critical tinypool entries through Vitest 3 and a critical shell-quote entry through the Mac development launcher. An engineering acceptance program cannot ignore its own test/tooling execution surface.

Change only parent runner/compatible dependency policy and necessary test adaptations: Vitest 4.1.12, shell-quote 1.11.0 for concurrently's existing range, one typed mock and two setup-call-history resets preserving recovery assertions, plus four pure-data quoting regressions. Tinypool leaves the graph through its parent update; no incompatible transitive major is forced. No executor/endpoint/profile/permission/migration changes. See the separate prerequisite record and patch.

Accept: frozen installation; no affected critical paths in current audit; quoting regression fails on inherited dependency and passes without executing text; strict types/lint pass; full suite introduces no new failure beyond independently reproduced baseline; MCP and selected engineering PostgreSQL regressions pass. A passing scoped prerequisite is not approval to enable the overall workflow.

## E2E-1 — Signed, durable, existing-repository engineering ingress (next product slice)

Reuse existing Android signing, server signed-request middleware, shared `CreateSoftwareObjectiveRequestSchema`, company context, engineering delivery/manager stores and audit. Adapt the mobile engineering entry without changing the general objective service or creating a second planner. Choose a finite signed operation with an exact company/repository/request binding; company selection is validated against server-derived membership and session context, never accepted as authority.

Bound the initial slice to an existing registered disposable repository. Exclude new-project initialization, self-improvement, drive/run, merge, push, deployment and arbitrary tools. Reuse the delivery service's internal deferred-drive concept so receipt of signed metadata cannot silently begin execution. Any option/interface change must preserve self-improvement protection and keep deferred execution server-owned, not a caller permission flag. Expose “persisted, execution not started” truthfully in Android.

Use the existing idempotency concept with exact canonical request digest and owner/company binding. Inspect the current check-then-create/store boundary and add the smallest transaction/constraint support actually required; do not assume a unique delivery record alone prevents an orphan objective or repeated planning. Do not design a new generic idempotency platform. Resolve crash/timeout/concurrent duplicate behavior and changed-body conflict in disposable PostgreSQL. No migration is assumed until existing store constraints are examined.

Acceptance: real authenticated signed Android request to the existing governed backend, one durable engineering objective/delivery and bounded reviewable plan, no dispatch or host effect. Deny revoked/expired/untrusted device/session, foreign company/repository, tampering, replay, stop and extra authority/command fields. Retries use the same operation key and return the same draft; Android SDK build/unit tests and an actual device request are required. Retain exact route/origin/CSRF/network policy; signatures do not justify weakening it.

Rollback: disable/revert only the new finite entry; retain persisted audit/draft evidence; do not delete records or enable a legacy unsigned path as a silent fallback for the new operation. Existing clients must have an explicit compatibility decision.

## E2E-2 — Explicit activation and joined cancel/revocation fence (planned)

Reuse manager/delegation/signed gateway and existing owner controls. Bind activation to the reviewed draft/version and current policy/approval state. Execute only registered finite operations through the trusted Mac channel. Test cancel/revoke/stop before queue, after poll, before effect, during validation and before result acceptance; record distributed acknowledgment timing and retain uncertain outcome. Scope to one registered repository and task chain, not autonomous push or broad fleet scheduling.

Deliverables: bounded activation/control contract, current authority rechecks, deterministic fault barriers, disposable PostgreSQL cases and real Mac interruption receipts. Never claim that a UI cancel alone stopped remote work. Use no new transport. Rollback stops new activation and preserves worktrees/audit; uncertain operations remain blocked for reconciliation.

## E2E-3 — Accepted validation and independent review (planned)

Use reviewed existing command profiles/images, actual task-local and integration receipts, separate authorized reviewer and exact candidate head. Verify missing/failed tests, wrong reviewer, provider outage and stale head deny success. No candidate/head-changing repair may reuse stale validation or approval. No benchmark or code correctness claim from model prose.

## E2E-4 — Owner decisions and Android terminal evidence (planned)

Accept foreground/background/reconnect, approval inbox with real recent authentication where required, reject/revise/cancel and canonical terminal evidence. Push is optional; if tested, use existing notification infrastructure without putting secrets in reports. A delivery-ready state and local merge outcome must be distinguished. No mobile executor or automatic public action.

## E2E-5 — Real-device normal/fault demonstration (planned)

Run the scenario in `04_SCENARIO_SPECIFICATION.md` with actual enrolled Android/Mac, retained synthetic DB and exact revisions/build IDs. Complete every required fault row with no unauthorized subsequent effect, persistent recovery and correct terminal status. Security/dependency review must explicitly resolve remaining material findings before calling this a release. No slice automatically begins merely because the previous test suite passes.
