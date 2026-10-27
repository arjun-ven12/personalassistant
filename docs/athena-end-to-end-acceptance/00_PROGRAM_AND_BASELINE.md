# Athena phone-directed engineering acceptance program

2026-10-27 · Internal review source · Overall workflow **NOT ACCEPTED**.

The product promise is a supervised engineering outcome initiated on Android, executed by the existing governed engineering system, and returned with inspectable evidence. A model response, an assigned agent, a successful Linux fixture, or a preview URL does not establish that promise.

## Source reconciliation

The latest fetched GitHub `main` and this worktree's base HEAD are `90c77ecceb35682e0b64bcc512b8d83ae23a78d1`. This candidate is uncommitted. Its implementation identity is the base revision plus the inherited MCP-1B snapshot and `evidence/source-manifest.json`; HEAD alone is insufficient.

The original `/workspace/personalassistant` remains at `7ee28be9de093a0446dfbe95b7145278b9087ea9` with existing changes. MCP-1B resides separately at `/tmp/athena-mcp-1b`, also based on `90c77ec`, with uncommitted dependency, test and evidence changes. Those changes were inspected and copied into this new worktree, `/tmp/athena-e2e-acceptance`, without modifying either earlier tree. Before/after hashes verify preservation. No reset, stash, force checkout, commit, push or deployment is part of this work.

The historical institutional audit describes an earlier dirty workspace. Its absence-of-MCP and unrun-PostgreSQL statements have bounded later evidence, not a blanket retrospective upgrade. MCP-1B established local fixture acceptance on disposable PostgreSQL while leaving dependency and platform gates open. Its referenced candidate snapshot remains historical; the changed test toolchain in this run requires current reruns.

## Investigation coverage and boundaries

Inventory covers repository apps, packages, migrations, deployment/build/CI and relevant documentation. Behavioral tracing concentrates on Android repository/network/security/UI/lifecycle, API identity/company/routes/composition, objectives, workforce/Agent OS, engineering runtime/orchestration/integration/delivery, signed execution and Mac dispatcher/provider/validation/result outbox, notifications and PostgreSQL adapters. `evidence/transition-register.json` records sixteen transitions with contracts, persistence, authority, models, cancellation, audits, tests and gaps. A path/hash inventory does not imply every line was behaviorally verified.

Two source paths cited by the historical audit remain absent from GitHub: `apps/api/src/launch-workflow/service.ts` and `docs/phase-28-acceptance-matrix-2026-10-14.md`. Their earlier local existence is not evidence of a merged feature. Prior MCP-1B source-review flags and UNKNOWN classification are retained.

## First implementation boundary

The mandatory safety prerequisite is taken first, as **E2E-0: critical test/development-toolchain remediation**. Existing critical paths were root Vitest → tinypool and Mac concurrently → shell-quote. The candidate replaces the test runner through a reviewed parent-version migration, applies a compatible shell-quote override, preserves existing assertions and adds pure-data security regression tests. See `slices/00_CRITICAL_TOOLCHAIN_PREREQUISITE.md`.

No mobile/backend execution authority, model routing, worker, sandbox, device permission or production configuration is expanded. The next product slice is explicit signed engineering ingress into the existing engineering delivery system; it is specified, not silently implemented in this prerequisite change. Broader execution acceptance remains blocked on real devices and remaining release gates.

## E2E-1 continuation

The current candidate is `/tmp/athena-engineering-drafts` on `engineering/signed-drafts-2026-10-27`, based on `90c77ec` plus the preserved E2E-0 work. The signed inert draft backend is now implemented and verified within its exact scope; the former candidate remains unchanged. Current hashes/evidence are in `evidence/drafts/`. Android wiring and all activation/native execution remain separate unaccepted dependencies. See the updated acceptance report; original inventory/test snapshots above remain historical.
