# Small reviewable slices

Order reflects actual missing acceptance, not a proposal for another coding platform. The safety prerequisite is implemented first; subsequent entries are plans, not granted authority.

## E2E-0 — Critical test/development-toolchain prerequisite (implemented)

Problem: MCP-1B retained two critical tinypool entries through Vitest 3 and a critical shell-quote entry through the Mac development launcher. An engineering acceptance program cannot ignore its own test/tooling execution surface.

Change only parent runner/compatible dependency policy and necessary test adaptations: Vitest 4.1.12, shell-quote 1.11.0 for concurrently's existing range, one typed mock and two setup-call-history resets preserving recovery assertions, plus four pure-data quoting regressions. Tinypool leaves the graph through its parent update; no incompatible transitive major is forced. No executor/endpoint/profile/permission/migration changes. See the separate prerequisite record and patch.

Accept: frozen installation; no affected critical paths in current audit; quoting regression fails on inherited dependency and passes without executing text; strict types/lint pass; full suite introduces no new failure beyond independently reproduced baseline; MCP and selected engineering PostgreSQL regressions pass. A passing scoped prerequisite is not approval to enable the overall workflow.

## E2E-1 — Signed inert backend engineering drafts (implemented and verified)

The backend portion now passes 27 new assertions inside a 96-pass local/disposable regression run. `POST /api/v1/device/engineering-drafts` reuses existing identity/company/origin/CSRF/signature/nonce/network checks, finite policy metadata, transactional PostgreSQL, existing delivery/manager services and mandatory audit. Existing-repository metadata only; immutable markers deny all legacy execution paths. No model, task, Mac, validation, merge or deployment is dispatched. No new SQL migration is required. See [API contract](13_SIGNED_DRAFT_API.md), [slice record](slices/01_SIGNED_ENGINEERING_DRAFTS.md) and [acceptance report](09_ACCEPTANCE_REPORT.md).

### E2E-1A — Android command submission (next dependency)

Wire Android's existing key/session/company/CSRF facilities to the finite draft endpoint. Keep a stable business key across timeout, retry and appropriate state recreation; sign an exact company/repository/request and use fresh envelopes for retries. Show saved/inert state truthfully, retain company-safe responses and never fall back to the old auto-driving create path. No execution activation, new-project initialization, self-improvement, merge, push or deployment belongs in this slice.

Acceptance requires a supported Android SDK build/unit suite and a real trusted Android request, including tampering/replay, revocation, company switch, response loss and duplicate cases. Backend fixture signatures are not Android Keystore evidence. Preserve origin/CSRF/network requirements. This client dependency is not implemented by the backend increment.

Rollback stops new submissions and retains immutable metadata/audit. Strict shared readers need coordinated versioning; old code must fail closed on new draft fields/status rather than making them executable.

## E2E-2 — Explicit activation and joined cancel/revocation fence (planned)

Reuse manager/delegation/signed gateway and existing owner controls. Bind activation to the reviewed draft/version and current policy/approval state. Execute only registered finite operations through the trusted Mac channel. Test cancel/revoke/stop before queue, after poll, before effect, during validation and before result acceptance; record distributed acknowledgment timing and retain uncertain outcome. Scope to one registered repository and task chain, not autonomous push or broad fleet scheduling.

Deliverables: bounded activation/control contract, current authority rechecks, deterministic fault barriers, disposable PostgreSQL cases and real Mac interruption receipts. Never claim that a UI cancel alone stopped remote work. Use no new transport. Rollback stops new activation and preserves worktrees/audit; uncertain operations remain blocked for reconciliation.

## E2E-3 — Accepted validation and independent review (planned)

Use reviewed existing command profiles/images, actual task-local and integration receipts, separate authorized reviewer and exact candidate head. Verify missing/failed tests, wrong reviewer, provider outage and stale head deny success. No candidate/head-changing repair may reuse stale validation or approval. No benchmark or code correctness claim from model prose.

## E2E-4 — Owner decisions and Android terminal evidence (planned)

Accept foreground/background/reconnect, approval inbox with real recent authentication where required, reject/revise/cancel and canonical terminal evidence. Push is optional; if tested, use existing notification infrastructure without putting secrets in reports. A delivery-ready state and local merge outcome must be distinguished. No mobile executor or automatic public action.

## E2E-5 — Real-device normal/fault demonstration (planned)

Run the scenario in `04_SCENARIO_SPECIFICATION.md` with actual enrolled Android/Mac, retained synthetic DB and exact revisions/build IDs. Complete every required fault row with no unauthorized subsequent effect, persistent recovery and correct terminal status. Security/dependency review must explicitly resolve remaining material findings before calling this a release. No slice automatically begins merely because the previous test suite passes.
