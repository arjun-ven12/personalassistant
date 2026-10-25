# Phase 28 business repairs: local verification before hosted rollout

## Current boundary

Owner direction (2026-10-19): repair and verify localhost first; only then deploy
and verify hosted Athena. Local fixtures do not establish provider acceptance.
Keep API/web on the existing Railway services. Keep EC2, preview and AthenaCoder
live acceptance conditional. Do not alter cloud isolation or approval controls.

## Local environment used by this audit

- Web: http://localhost:5173
- API: http://127.0.0.1:3001
- Database: `athena_business_local` at loopback port 55434.
- Container: `athena-business-test-pgvector`, pgvector 0.8.1 / PostgreSQL 17; the app and regression suite use separate database names.
- Image digest: `sha256:3e8b3adfd27b5707128f60956f62a793c3c9326ea8cfaf0eab7adccb5d700b21`.
- Database port is bound to 127.0.0.1 only. Local test database uses trust auth;
  it is disposable development data and must never hold production data/secrets.
- Database storage is the local Docker volume `athena-business-regression-pgdata`.
  It survives container stop/start. It contains local data only, not a production backup.
- All 118 migrations applied with `state: current` and no pending versions.

**Local configuration corrected on 2026-10-19:** `apps/api/.env` now defaults to
the isolated localhost database. The previous environment is retained privately
under ignored `apps/api/.local/env-before-local-database-20261019`. Do not print,
commit or upload it. Explicit DATABASE_URL overrides below remain recommended
for migration commands. No production application data was copied.

From repository root, after the isolated container is available:

```sh
DATABASE_URL='postgresql://postgres@127.0.0.1:55434/athena_business_local?sslmode=disable' pnpm --filter @alexa-control/api db:migrate
DATABASE_URL='postgresql://postgres@127.0.0.1:55434/athena_business_local?sslmode=disable' STORE_MODE=postgres DATABASE_SSL_MODE=disable NODE_ENV=development API_HOST=127.0.0.1 API_PORT=3001 NETWORK_VERIFIER_MODE=unknown PRIVATE_NETWORK_REQUIRED=false TAILSCALE_REQUIRED=false AUTH_ALLOW_OWNER_BOOTSTRAP=true pnpm --filter @alexa-control/api dev
```

In a separate terminal:

```sh
pnpm dev:web
```

Use a separate local owner account. Do not enter production credentials into
scripts. Local account creation does not authorize any tools, provider grants,
paid calls, security changes or production access. Network verification stays
unknown; the existing development loopback rules and emergency stop still apply.

Local regression command:

```sh
TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55434/athena_regression_test?sslmode=disable' pnpm test --no-file-parallelism
```

Run heavyweight gates sequentially on this Mac: serial tests, typecheck, build,
then Android gates. Concurrent compilers and database migrations exhausted the
initial 1 CPU/768 MiB database allocation and caused setup timeouts. The local
replacement disk-backed container uses 2 CPU/768 MiB with bounded WAL; no worker/runtime limits were changed.

## Local owner/browser review

Open localhost:5173 and create/sign into the development owner account. Verify:

1. Company scope is visible and exact; no production records appear.
2. Marketing campaign intake persists one canonical objective and deliverables.
3. Repeating intake with the same request identity returns that campaign.
4. Pause/resume/cancel and rejected/stale reviews fail safely.
5. Artifact/version/digest, department, blocker and known/unknown cost projections
   agree with API records. No completion is claimed before package persistence.
6. Research remains unavailable until its exact finite manifest is reviewed and
   activated through existing owner governance. Never enable it from a fixture.
7. Use a public, owner-selected product brief for real provider dry runs. Provider
   credentials, scopes and budget authorization must be configured securely.

Codex browser opening currently reports `Local browser use is disabled in Work
settings`; owner browser access/sign-in is required before UI acceptance.

## Hosted rollout gates, after local verification

1. Confirm a retained production recovery point in Neon. The historical branch
   `athena-before-lineage-reconciliation` / `br-green-star-azqy7jsy` must exist and
   have auto-deletion disabled. If absent/expired, create a new data-and-schema
   branch from production; retain it and record its non-secret branch ID. Do not
   substitute schema-only for recovery of production data.
2. Follow `ATHENA_MIGRATION_LINEAGE_RECOVERY.md`. Recheck all 115 approved source
   hashes, finite legacy repair/schema evidence and the recovery branch binding.
   A changed recovery ID requires updating the reviewed manifest consistently;
   never silently reuse an expired branch reference.
3. Apply the already owner-approved fixed history reconciliation only after
   recovery is confirmed. Do not delete history, invent original SQL hashes or
   disable lineage checks. Pending migrations are a separate step.
4. Review/apply 0115–0117 via the retained pre-deploy command
   `node dist/database.js deploy`; run production security/config validation.
5. Deploy the exact locally validated source to existing Railway API/web. Record
   deployment IDs and source revision/content identity. Do not treat build success
   as deployment success. If deployment fails, inspect pre-deploy stderr safely.
6. Verify hosted health, authenticated company scope, migration state, canonical
   campaign/objective projection, persistence/restart, approvals and actual draft
   provider scenarios. Record real costs/timings; UNKNOWN remains UNKNOWN.
7. Update the audit and Phase 28 handoff with exact gates and live evidence.

No production reconciliation, schema migration or deployment has been performed
by the local-first checkpoint. Do not claim hosted verification from local tests.

Branch/expiration console steps checked against [Neon Manage branches](https://neon.com/docs/manage/branches) on 2026-10-19. No production branch was inspected or modified by this local-first step.


### Production migration gate completed

Owner confirmed recovery branch `br-green-star-azqy7jsy` retained with automatic
deletion OFF. Approved reconciliation and migrations completed on 2026-10-19:
current, 119 applied ledger entries including the preserved historical diagnostic,
no pending migrations/issues. See the lineage runbook execution receipt. This
does not by itself establish a successful application deployment.


### Application rollout completed

API deployment `5a8d047e-7c09-472e-b611-46274344fcee` and frontend deployment
`efbda7f6-dc45-487f-b759-87119762f939` both report SUCCESS. Post-deploy migrations
remain current. Hosted frontend, runtime-config, new bundle and proxied API health
were checked over HTTPS; protected session/campaign routes deny unauthenticated
requests. Owner password login and broader business workflows remain separate
acceptance checks. See `../evidence/PHASE_28_DEPLOYMENT_20261019.json`.

## 2026-10-24 local database selection

Owner explicitly chose a fresh local development account/database after an
unsuccessful login to the preserved October 19 local account. Current local
API target is `athena_business_local_20261024` at loopback port 55434, with
118 migrations and normal owner-bootstrap registration. Previous database
`athena_business_local` remains intact. Use current local configuration, not
the historical commands above targeting the old database. Configuration backup
is ignored/private: `apps/api/.local/env-before-fresh-local-20261024`.
Do not print or upload it. Owner enters new credentials through localhost UI.
