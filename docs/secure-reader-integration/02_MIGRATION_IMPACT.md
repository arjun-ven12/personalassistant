# Secure Reader migration impact report

Proposed migration: `apps/api/migrations/0119_secure_reader_namespace.sql`, based on Athena `90c77ecceb35682e0b64bcc512b8d83ae23a78d1` and Reader `aa42c01cda2ac1d7bd3c94c271405fc87e8f51ff`. **Production status: not applied.** The dirty `/workspace/personalassistant` branch has different uncommitted migration numbers and must be reconciled before merging this worktree.

## Objects and effect

The migration creates `secure_reader` and nine tables: `users`, `challenges`, `sessions`, `documents`, `grants`, `page_tickets`, `audit_events`, `rate_buckets`, and `document_versions`, plus two Reader indexes. All Reader foreign keys point within `secure_reader`. It does not alter, delete, rename, truncate, or reference Athena tables. It uses `CREATE SCHEMA` without `IF NOT EXISTS` so an unexpected existing namespace fails closed and requires operator inspection. Athena's migration runner applies pending SQL under an advisory lock in one transaction and records a SHA-256 digest in the existing migration ledger. The existing Railway startup checks migration currency; deploying the source before safely applying this migration would prevent startup.

Disposable PostgreSQL 18 checks used a fresh database with an unrelated `public.athena_fixture` row. The migration applied transactionally; nine Reader tables existed afterward, no Reader foreign key crossed into `public`, and the fixture marker remained unchanged. Integration tests then exercised Reader inserts, grants, tickets, revocation, audit, and restart against another disposable database. This is **not** evidence of compatibility with the live Neon schema or full Athena migration history. No production `DATABASE_URL` was read or used.

## Pre-deployment procedure

1. Reconcile the integration branch against the latest Athena `main` and reserve a non-conflicting migration number. Preserve the existing dirty worktree and review every migration already applied in Neon.
2. Restore a disposable copy or Neon branch of the current production schema and data, without exposing credentials in logs. Verify Athena's migration ledger and digest history, apply pending migrations through the existing runner, and compare pre/post objects and representative Athena records.
3. Confirm backup and rollback path. The SQL transaction rolls back automatically on failure. After successful application, the old Athena image cannot restart because its migration verifier rejects an unknown future version. Prepare and test a rollback image that knows this migration but keeps Reader disabled; retain the additive Reader schema for reviewed later cleanup, since permanent deletion is prohibited.
4. Apply the migration through Athena's existing `db:migrate:deploy` command only after the production preflight passes. Do not reset or recreate Neon. Confirm `/ready`, existing Athena routes, and Reader health after deployment.

The exact production connection string and migration state could not be inspected because Railway CLI authentication expired. The existing `DATABASE_URL` remains the only intended database connection string.
