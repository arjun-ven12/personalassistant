# Railway backend migration recovery — handover

Prepared 2026-10-12, Asia/Singapore. **Production reconciliation has NOT run.**

## Start here: exact next task

Finish the existing Railway backend's migration-history reconciliation, then
review pending migrations and restore deployment. Do not redesign the worker,
move the database, bypass pre-deploy checks, invent historical SQL, or delete
migration-history rows. Read AGENTS.md and the files listed below first.

The owner explicitly approved the history reconciliation in this conversation:

> Approve the migration-history reconciliation, including the unknown original
> `0090` SQL and the verified schema baseline for 0110–0114.

That approval covers preparing the approved manifest and the narrowly reviewed
history reconciliation. **It does not authorize applying0115/0116 or redeploying
without the separate pending-migration/release review.** This chat told the owner
production administration would be performed by the human infrastructure
operator. Preserve that boundary: AGENTS.md rule19 prohibits Codex administrator
operations. Do not request raw passwords, database URLs or cloud tokens.

## Actual failure

The backend Docker image builds successfully. Railway fails in pre-deploy:

```text
node dist/database.js deploy
Error: MIGRATION_LINEAGE_DENIED
```

Keep that command unchanged. The production ledger contains the extra version
`0090_repair_cross_device_execution_tables`, absent from checked-in migrations.
It also lacks the newly required reviewed SHA-256 history. Removing the lineage
check would hide the problem, not repair it.

## Verified environment — non-secret identifiers only

- Repository: `arjun-ven12/personalassistant`, current checkout `main`.
- Railway project: `modest-clarity`, ID
  `8838a205-159f-4f4a-bd04-10a47eba0aeb`.
- Environment: `production`, ID `39b05b7b-ad0d-4465-b4bf-a49e7116b05b`.
- API service: `personalassistant`, ID
  `b258a862-9a6e-4356-89ae-7a1d6eacbeee`.
- API database: **Neon**, database `neondb`, parent branch `production`.
  The separately deployed Railway Postgres is empty and is NOT the backend DB.
  Do not change DATABASE_URL to it.
- Owner-created Neon recovery branch:
  `athena-before-lineage-reconciliation`, ID `br-green-star-azqy7jsy`.
  Creation is owner-reported. Independent recovery verification/restore rehearsal
  was not performed. Retain it; do not auto-delete it during release work.
- A database password was pasted earlier. It is deliberately omitted here.
  Rotation was advised but not verified. Never reuse a value copied from chat.
  Use the configured secure integration/session instead.

## Production evidence established read-only

A valid existing Railway CLI session allowed fixed read-only database scripts to
run with the production service environment. No variables were printed and no
production SQL mutation was performed.

- **116 applied ledger rows**:115canonical SQL versions through0114, plus the
  extra diagnostic0090 label. Pending:0115 and0116.
- Diagnostic row:2026-09-02T07:57:49.216852Z.
- Canonical `0077a_repair_cross_device_execution_tables`:
  2026-09-02T08:03:35.010588Z.
- `docs/phase-25-7h-management-intelligence-hardening.md` documents an earlier
  diagnostic repair label alongside0077a. The report corroborates the incident,
  but does not prove the two SQL scripts were identical.
- Original0090 SQL was not recovered from current Git history,4,263discarded
  Git trees, or recovered deployed source. **Original SQL remains unknown.**
- Owner supplied cross-device column/constraint/index metadata. It matches the
  canonical repair plus later company-scoped command constraints/indexes.
- Last successful API deployment:
  `8b4bd5f7-c8c1-4bc3-991d-94e28abdb401`, created2026-10-06T23:07:16.217Z.
  Its referenced Git commit is
  `7ee28be9de093a0446dfbe95b7145278b9087ea9`, fetched from origin without changing
  the checkout. **110canonical migration files match this commit exactly.**
- Canonical0110–0114 files are absent from that Git commit and preceding
  deployment commit279f131. They may have been CLI-uploaded/untracked source;
  that explanation is not proof. Their scripts are DDL-only, with no data
  transformation. A fixed read-only production metadata query was compared to
  an isolated database derived from candidate SQL: all9tables/75columns/
  29constraints/19indexes match exactly. This supports the owner-approved
  schema baseline. **It does not prove original execution-source bytes.**
- Railway SSH refused a read-only source-hash attempt with `no_ssh_key`. No
  SSH key was generated/registered; do not broaden access to bypass this.

## Prepared implementation — not yet committed/pushed/deployed

Inspect the current Git status; these were local changes at handover:

1. `apps/api/src/persistence/legacy-repair-review.ts` — finite receipt for only
   the documented0090 occurrence. Exact version/timestamps, canonical digest,
   recovery branch and explicit `UNAVAILABLE_NOT_CONTENT_VERIFIED` are bound.
   Required columns/types/nullability, primary keys, valid indexes and company
   foreign key are rechecked. No unknown-version wildcard exists.
2. `apps/api/src/persistence/database.ts` — existing status/migrate/history
   adoption routes integrate that receipt. Other unknown migrations, missing
   review, changed canonical hashes, schema drift and fabricated0090 checksum
   continue to deny. Existing known-migration checksum guard remains.
3. `apps/api/src/persistence/migration-review-schema.ts` — fixed nine-table
   metadata-only inventory; does not read application rows.
4. `apps/api/src/scripts/database.ts` — retains `deploy` and existing fixed
   `.local/approved-migration-history.json` operator adoption path; adds
   read-only `prepare-history-review` and `inspect-history-schema`. No public
   API/model tool, arbitrary path or executable endpoint was introduced.
5. `apps/api/src/persistence/legacy-repair-review.integration.test.ts` — isolated
   PostgreSQL regression/security tests.

The ordinary deploy remains non-executable against this legacy history until
an authenticated human infrastructure operator records the approved manifest.
The historical0090 row and timestamp remain intact; its SQL content_sha256
staysNULL. A separate legacy_repair_review JSON receipt records the exception.
No fabricated0090 SQL file was added. No SQL files were rewritten.

## Approval artifact ready to transfer

Portable, non-secret approved file:

`docs/evidence/MIGRATION_HISTORY_APPROVED_20261012.json`

SHA-256 of exact file bytes:

```text
3675fc5a460beb1ca6c28e52aa62475138c1b431bf98e6470cf2ac151d48a87c
```

It contains all and only115known applied canonical versions/current reviewed
source hashes, and the approved finite legacy review. It excludes pending
0115/0116 and never assigns a content hash to0090. All115source hashes were
rechecked against current files when this artifact was prepared. Reject stale
hashes if another chat changes migrations; do not silently regenerate approval.

The same manifest was prepared locally at:

`apps/api/.local/approved-migration-history.json` (mode0600, ignored by Git).

On another checkout, copy the portable file to that exact local path. Do not
commit `.local` or `.env`. The portable file contains no credentials.

Supporting evidence:

- `docs/evidence/MIGRATION_LINEAGE_REVIEW_20261012.json`
- `docs/evidence/MIGRATION_LINEAGE_SCHEMA_20261012.json`
- `docs/runbooks/ATHENA_MIGRATION_LINEAGE_RECOVERY.md`
- `docs/PHASE_28_HANDOFF.md`

## Exact next operator steps

1. Ensure this handover, all new/modified implementation files, tests and
   portable evidence files are present in the next checkout. They are NOT
   automatically transferred by cloning unless committed/pushed. Inspect/review
   source and current diffs before publication; avoid triggering Railway Git
   deployment before the history operation and pending-migration review.
2. Confirm the recovery branch is retained, the intended production environment
   is selected, and the secure database credential is current. Do not print
   secrets or place them in shell arguments.
3. In the repository, put the approved manifest at
   `apps/api/.local/approved-migration-history.json`, preserving the approved
   bytes/hash. Read the runbook before this mutation.
4. The **human infrastructure operator** runs from `apps/api`:

   ```sh
   railway run --project 8838a205-159f-4f4a-bd04-10a47eba0aeb --service b258a862-9a6e-4356-89ae-7a1d6eacbeee --environment production --no-local -- pnpm exec tsx src/scripts/database.ts record-reviewed-history
   ```

   This is the first production mutation. It performs a locked transaction,
   exact applied-version/source checks and finite schema/timestamp validation,
   adds the explicit0090 receipt and fills onlyNULL canonical hashes. It runs
   no pending application migrations and deletes/renames no history row.

   **Expected:** final state `outdated`, pending0115/0116, with no integrity
   issues. The existing script returns exit1 for `outdated`; that does not mean
   its committed history transaction failed. Inspect final state/issues and
   read-only status before retrying. A thrown error rolls back the transaction.
   Do not loosen the guard if it rejects the artifact/schema/source.
5. Obtain actual result metadata from that operator run. Do not infer success.
6. Separately review0115/0116 constraints/data compatibility and actual production
   security configuration; ensure forward recovery. The history approval alone
   does NOT authorize these migrations or a redeploy. If further authorization
   is needed, ask for that concrete release after all review work is complete.
7. When authorized, deploy reviewed backend source with the original pre-deploy
   command unchanged. Verify migration result, startup, safe readiness and
   authenticated scoped flows. Docker image build success is not acceptance.

Do not run a new raw SQL DELETE/UPDATE against schema_migrations as a shortcut.
Do not switch databases, disable migration pre-deploy, fill unknown digests with
invented values, or register broad infrastructure permissions.

## Validation completed

- Focused isolated PostgreSQL:11tests/2files passed, covering old checksum guards
  and new reconciliation. Final6-test reconciliation rerun passes in14.10s.
- Full serial suite:253files/1,457tests passed;4opt-in live files/tests skipped;
 664.32s,exit0.
- Fullworkspace typecheck/build pass; finalAPItypecheck/build pass after fixed
  metadata inspection command and strict test row guards.
- Full lint rerun passes0errors/1existing Fast Refresh warning; targeted final
  schema/test/CLI lint passes. Earlier new-test unsafe reads were corrected.
- `git diff --check` passes.
- Six generated Mac outputs were restored byte-for-byte to initially cleanHEAD
  after the local build. No Mac worker participated in a cloud acceptance.
- No production history adoption,0115/0116 execution, deploy or runtime activation
  was performed. No production readiness claimed.

## Phase acceptance boundaries

28.4/28.5/28.6 remain conditional with their existing live gates. This migration
repair does not release an AMI, establish a READY EC2 worker, run a genuine cloud
build, prove HTTPS preview, benchmark AthenaCoder or establish a training result.
API/web remain on Railway; ordinary cloud worker containment must not be weakened.

## Starter prompt for the new Codex chat

> Read AGENTS.md and docs/RAILWAY_BACKEND_MIGRATION_HANDOVER.md. Continue the
> existing Railway backend migration-lineage recovery. The owner approved the
> finite history reconciliation, including unknown original0090 SQL and the
> verified schema baseline for0110–0114. The approved manifest is prepared but no
> production mutation ran. Preserve all guards and data, verify artifacts/source
> and current status, guide the human infrastructure operator through the exact
> reviewed history command, then review pending0115/0116 and production release
> separately. Do not bypass pre-deploy, change databases, invent SQL/checksums or
> claim any inherited Phase28 live acceptance.
