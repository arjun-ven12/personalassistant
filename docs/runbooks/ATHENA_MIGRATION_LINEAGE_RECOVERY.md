# Athena production migration lineage recovery

Status: **REVIEW REQUIRED — NO PRODUCTION MUTATION PERFORMED**.

## Evidence

- Production uses Neon via the existing Railway API environment; Railway's
  separate empty Postgres service is not the API database.
- Read-only production inventory: 116 ledger entries, including 115 known SQL
  versions through 0114 plus `0090_repair_cross_device_execution_tables`.
  0115 and 0116 remain pending. No stored migration checksums are present.
- Owner-created recovery branch: `athena-before-lineage-reconciliation`,
  `br-green-star-azqy7jsy`. Its creation is owner-reported; do not claim tested
  restoration or independent backup verification.
- Diagnostic label recorded 2026-09-02T07:57:49.216852Z; canonical
  `0077a_repair_cross_device_execution_tables` recorded at
  2026-09-02T08:03:35.010588Z. The Phase 25.7H report documents an earlier
  diagnostic label. This corroborates context, not original SQL identity.
- Original diagnostic SQL was absent from tracked history, 4,263 discarded Git
  trees and recovered successful deployment source. Its bytes remain unknown.
- Owner supplied column/constraint/index metadata matching the checked-in
  repair and subsequent command company isolation. Runtime rechecks columns,
  types, nullability, primary keys, valid non-partial indexes and company FK.
- Last successful Railway API deployment `8b4bd5f7-c8c1-4bc3-991d-94e28abdb401`
  references commit `7ee28be9de093a0446dfbe95b7145278b9087ea9`, recovered from
  origin without changing checkout. **110** canonical files match byte-for-byte.
  Files **0110–0114 are absent** from that Git commit and the preceding deployed
  commit. A Git commit is not proof of untracked source in CLI-uploaded images.
  Those five lack original execution-source proof. Read-only production metadata
  was compared to an isolated database derived from the candidate SQL: all nine
  tables,75columns,29constraints and19indexes match exactly. These five scripts
  contain table/index DDL only, no data transformation. Owner review may accept
  this explicit schema baseline; it must not claim original bytes are proven.
  Do not silently adopt the files merely because they hash successfully.

Review pack: `docs/evidence/MIGRATION_LINEAGE_REVIEW_20261012.json` contains the
exact current-source SHA-256 list and provenance gaps. It is inert and rejected
by the approved-manifest schema. It is not a production approval.

## Narrow software repair

No historical file is invented, row deleted/renamed, or checksum fabricated.
An operator-only review may annotate the one documented diagnostic row with
`legacy_repair_review`, leaving `content_sha256` NULL. The receipt stores exact
version/timestamps, canonical source digest, recovery branch and explicit
`UNAVAILABLE_NOT_CONTENT_VERIFIED`. Receipts cannot be silently overwritten.

Ordinary migration/status still denies unrelated unknown versions, absent review,
changed timestamps/canonical digest, fabricated diagnostic hash or missing schema
controls. Existing known-migration checksum validation remains in force.
There is no HTTP/model/public route. The fixed operator command uses the existing
infrastructure session/database authority; not a worker or model credential.

## Operator procedure — only after the source/recovery review is completed

1. Keep `node dist/database.js deploy` as the Railway pre-deploy command.
   Do not bypass it to publish the image.
2. Review the canonical applied files against actual deployed source/release
   evidence; explicitly review the five 0110–0114 schema-baseline gaps above. Independently confirm the
   recovery branch is retained and recovery procedure is available.
3. Obtain explicit owner approval for the finite legacy diagnostic annotation
   despite unavailable original SQL. This is a provenance exception, not proof
   that the two repair scripts were identical.
4. Produce `apps/api/.local/approved-migration-history.json` only from reviewed
   canonical applied entries, with shape:

   ```json
   {
     "acknowledgement": "OWNER_REVIEWED_HISTORICAL_SQL_AND_RECOVERY",
     "migrations": [{"version": "each actually applied known version", "digest": "exact reviewed source SHA-256"}],
     "legacyRepairReview": {
       "acknowledgement": "OWNER_REVIEWED_LEGACY_REPAIR_SCHEMA_AND_RECOVERY",
       "originalSqlStatus": "UNAVAILABLE_NOT_CONTENT_VERIFIED",
       "recoveryBranchId": "br-green-star-azqy7jsy"
     }
   }
   ```

   Include all and only the 115 applied canonical versions, not pending 0115/0116
   or the unverified diagnostic name. Never paste database secrets into this file.
   This example is not a complete manifest and grants no approval.
5. From `apps/api`, an authenticated infrastructure operator can run:

   ```sh
   railway run --project 8838a205-159f-4f4a-bd04-10a47eba0aeb --service b258a862-9a6e-4356-89ae-7a1d6eacbeee --environment production --no-local -- pnpm exec tsx src/scripts/database.ts record-reviewed-history
   ```

   This is the **first production mutation** and must not be run before steps2–4.
   It locks the migration ledger, checks exact manifest membership, rechecks the
   finite repair effects/timestamps, annotates that one diagnostic row and fills
   only NULL canonical hashes. It runs no pending application migrations.
   Its final status can be `outdated`/exit1 because0115/0116 are still pending;
   inspect receipt/status before deciding whether the transaction committed.
6. Separately review pending0115/0116 compatibility/data constraints, actual API
   environment and recovery. Deploy reviewed source using the retained pre-deploy
   command only after that review. Do not claim a successful deploy from image
   build success or history annotation alone.

## Read-only preparation

The following command was executed without printing environment secrets and
without database mutation:

```sh
railway run --project 8838a205-159f-4f4a-bd04-10a47eba0aeb --service b258a862-9a6e-4356-89ae-7a1d6eacbeee --environment production --no-local -- pnpm exec tsx src/scripts/database.ts prepare-history-review
```

It writes only `.local/migration-history-review-candidate.json` locally using
exclusive create. Review candidates do not authorize adoption and never set
acknowledgements automatically. To refresh, archive the previous local candidate;
do not overwrite reviewed evidence or delete database history.

## Validation

Isolated PostgreSQL: 11 tests pass, covering old checksum guards and finite
reconciliation; no production schema mutation, SQL execution or history adoption
was performed. Full repository gate results are recorded in the handoff.

Additional read-only command `inspect-history-schema` writes fixed metadata for
those nine tables to `.local/migration-history-schema.json`. Production inspected
through the existing CLI environment; no application rows/credentials printed.
Reference derived in an isolated test schema and then cleaned up.
`docs/evidence/MIGRATION_LINEAGE_SCHEMA_20261012.json` preserves the actual
metadata. Their exact equality supports schema-baseline review, not historic
execution authenticity. Reading the running deployment's five source-file hashes
via existing Railway SSH was denied with `no_ssh_key`; no key was registered
and no broader access was requested.

Validation (2026-10-12):fullserialsuite253files/1,457tests pass,4opt-inlive
files/tests skipped,664.32s,exit0. Eleven focusedisolatedPostgreSQLtests pass.
Fullworkspace lint rerun passes0errors/1existingFastRefreshwarning after
fixingtypedtestreads. Fullworkspace typecheck/build pass; finalAPItypecheck
andbuildpassafterCLImetadataadditionandstrictrowguards. No privileged
workstationoperationorproductionmutationperformed. Sixpre-existingMac
generatedoutputsrestoredtoinitiallycleanHEADbytesafterbuild.
