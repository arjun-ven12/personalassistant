# Four Foundations / MCP-1A completion report

2026-10-26 · Release recommendation: **REQUIRES_ADDITIONAL_VALIDATION**.

## A. Investigated

Reviewed the mandatory institutional audit documents/register, root/toolchain/CI, API bootstrap/composition, shared contracts, identity/security/network/replay, company context, governance/risk/approval, integration/workspace stores and SQL constraints, Agent OS/workforce/economics, canonical AI/model registry/router/context/benchmark, local inference, engineering outcomes/validation/integration/delivery, advisory learning/skill promotion, existing experiments and signed Mac boundaries. The new protocol uses official specification/SDK sources listed in the foundation plan.

Reuse: existing integration permissions/store, registered workspace as project-resource scope, authenticated company context, finite tool metadata, policy evaluation, signed request/replay and governance audit. No second identity, policy, permission store, generic Tool Gateway, planner or native channel was created.

Audit reconciliation: MCP was absent at the audited baseline and now has a narrow local implementation; broader universal compatibility remains partial. Inference model registries existed already and are reused in the MODEL design; they do not implement weight promotion. Skill promotion is not model deployment. Existing experiments do not implement optimization. Current dependency advisories contradict any use of historical zero-advisory findings as current evidence. All changes refer to the recorded dirty workspace HEAD and content hashes, not an assumed latest remote checkout.

## B. Implemented

New source: `packages/shared/src/mcp.ts`; `apps/api/src/mcp/{errors,protocol,transport,fixture-server,service}.ts`; finite routes in `apps/api/src/routes/mcp.ts`. New tests: MCP protocol/service/transport/API/PostgreSQL suites plus config guard tests.

Modified source: API manifest/lockfile (SDK exact 1.32.2), shared barrel/integration provider vocabulary, built-in tool/integration descriptors, API composition/context/bootstrap, config parser and tsup fixture entry. Existing changes in these files were preserved. Migration `0111_mcp_local_fixture_provider.sql` adds a finite provider value to the existing CHECK; it creates no tables or permissions and was not run against a database. `source-change-summary.json` lists exact changed/new files and preserved baseline hashes.

Contracts: strict bounded local request/response/status/discovery schemas, fixed server/tool/protocol IDs and reviewed input/output JSON Schemas. Runtime: real SDK handshake/list/call over pre-parse bounded stdio; exact schema/version/identity checks; no caller process/URL/env, no remote credentials, no side-effect tool. One local read-only fixture is the accepted scope.

Documentation: thirteen program architecture/roadmap files with threat/data flow, reuse ADRs, four foundation plans, cross-foundation references, phase/acceptance/rollback/resource/hardware/cost plans. Institutional register preserves existing IDs, adds `ATHENA.MCP.LOCAL_READ_ONLY` and MODEL lifecycle design, narrows the universal MCP claim, records architecture-only coder/quantum designs and flags changed historical source evidence for review. No approved public prose is silently regenerated.

## C. Verification

Test-first RED: initial protocol/transport/service suites failed because implementation modules were absent. After implementation and corrections, focused checks pass **47 tests**, with **one disposable PostgreSQL test skipped**. Actual local Node child and signed API calls are included, not only mocks.

Final full `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, API `security:check` and `pnpm verify:production-config` pass. Full suite: **1,139 passed, 0 failed, 59 skipped, 203 test files**. Baseline before this slice: **1,092 passed, 0 failed, 58 skipped**, with the same primary code gates passing. A first implementation lint pass found new test typing/async and cleanup-finally errors; these were fixed and the complete gates rerun. Supported Node 22.16.0/pnpm 11.17.0 were used.

`pnpm audit --prod --json` fails with **one high, four moderate and five low advisory entries**. Zod 4.4.3, Fastify 5.12.5 and fast-uri 3.1.8/4.1.5 also occur in HEAD lockfile; the SDK adds paths to existing Zod/fast-uri versions. The dependency graph is not claimed secure. The current audit and patched ranges are retained separately; no unrelated broad dependency upgrade was attempted.

New/changed documentation and clean source are format checked; pre-existing app/integration source formatting is preserved. Repository-wide `pnpm format:check` remains FAIL on the same 445 pre-existing files. `git diff --check` passes. Strict register/reference/accepted-assertion checks pass; 79 historical evidence hashes affected by source changes are explicitly flagged for review rather than silently replaced. All thirteen requested program documents are present; Mermaid fences were checked structurally but diagrams were not rendered.

NOT_RUN: disposable PostgreSQL migration/isolation/reconstruction (no TEST_DATABASE_URL selected); real third-party/remote MCP; production; Mac native helpers/permissions; Android devices; training/weights/GPU/paid compute; model hosting/promotion; optimization/quantum experiments. Linux build explicitly skips Mac native helpers and reports the existing large-web-chunk warning. No skipped suite is counted as accepted.

## D. Security assessment

Preserved authority: authenticated owner/session, company membership, registered workspace read permission, exact company integration grant, trusted signed device request/nonce/expiry, existing deterministic policy and stronger approval rules, current stop/revocation and safe audit. Read-only policy allow is insufficient without the adapter’s fixed schema/server binding and all independent checks. No renderer/native privilege path changed.

Denied cases include missing context/identity/CSRF, wrong origin, foreign company/workspace, unknown tool, caller process/approval fields, revoked/expired session/device/permission, disabled integration, stronger approval, missing security/audit state, active stop, replay, concurrent/rate-exhausted work, invalid/malicious schemas/output, protocol downgrade, unauthorized notifications, timeout/cancellation and transport errors. Real process teardown is awaited; cleanup failure cannot be returned as successful operation.

New surface: SDK dependencies and a first-party Node child. The child gets no inherited credentials or arbitrary launch inputs; bytes/frame counts and schema depth are bounded before/around protocol handling. Output is validated inert data, never instructions. This is not a sandbox claim for third-party local code. Per-process resource limits are not fleet quotas. Existing dependency advisories and unrun PostgreSQL acceptance are outstanding risks. Production fixture enablement is rejected by both config and service composition.

## E. Capability status

- IMPLEMENTED_AND_VERIFIED: exact local read-only MCP-1A SDK/stdin/stdout and signed API/security fixture scope only.
- PARTIALLY_IMPLEMENTED: wider universal MCP client/runtime; remote registration/connectivity/side effects/current modern revision absent.
- ARCHITECTURE_ONLY / PLANNED: AthenaCoder data/training, model artifact/serving lifecycle and classical-first optimization program. Existing adjacent services retain their own classifications.
- UNKNOWN / NOT_RUN: production/live third-party compatibility and DB/native/device acceptance; distillation implementation and experimental outcomes.

## F. Recommended next slice

**MCP-1B: persistence and dependency hardening before broader registration.** Dependencies: explicitly disposable PostgreSQL with pgvector/migration prerequisites; reviewed patch plan for inherited Zod/Fastify/fast-uri ranges. Deliverables: migration 0111 acceptance, permission/audit/replay reconstruction and competing-operation tests, process restart/cancel evidence, dependency remediation regression checks and updated claim/release record. Acceptance: no cross-company leakage or duplicate/continued denied dispatch after restart/revocation; no unresolved required security gate. Remote production tools, arbitrary local executables and side effects remain excluded.

## G. Release recommendation

**REQUIRES_ADDITIONAL_VALIDATION.** The bounded change is available for code review and has passing local functionality/regression evidence. PostgreSQL acceptance and inherited dependency-security findings prevent a production-ready recommendation. No commit, push, merge, publication, deployment, production permission change, model promotion, training or paid quantum job was performed.
