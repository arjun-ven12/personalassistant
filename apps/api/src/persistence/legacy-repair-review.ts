import { z } from "zod";
import type pg from "pg";

/** One documented diagnostic ledger entry, never a wildcard migration alias. */
export const LEGACY_REPAIR = "0090_repair_cross_device_execution_tables";
export const CANONICAL_REPAIR = "0077a_repair_cross_device_execution_tables";
export const LegacyRepairReviewSchema = z
  .object({
    acknowledgement: z.literal("OWNER_REVIEWED_LEGACY_REPAIR_SCHEMA_AND_RECOVERY"),
    originalSqlStatus: z.literal("UNAVAILABLE_NOT_CONTENT_VERIFIED"),
    recoveryBranchId: z.string().regex(/^br-[a-z0-9-]{5,100}$/),
  })
  .strict();
const Receipt = LegacyRepairReviewSchema.extend({
  version: z.literal(LEGACY_REPAIR),
  canonicalVersion: z.literal(CANONICAL_REPAIR),
  canonicalSha256: z.string().regex(/^[a-f0-9]{64}$/),
  legacyAppliedAt: z.literal("2026-09-02T07:57:49.216852Z"),
  canonicalAppliedAt: z.literal("2026-09-02T08:03:35.010588Z"),
}).strict();
type Query = Pick<pg.PoolClient, "query">;

/** Check current repair effects; never infer or fabricate original SQL bytes. */
async function verifyRepairEffects(client: Query) {
  const result = await client.query<{ valid: boolean }>(`
    WITH expected(table_name,column_name,data_type,nullable) AS (VALUES
      ('cross_device_clients','id','uuid','NO'),
      ('cross_device_clients','owner_id','uuid','NO'),
      ('cross_device_clients','session_id','text','NO'),
      ('cross_device_clients','client_type','text','NO'),
      ('cross_device_clients','record','jsonb','NO'),
      ('cross_device_clients','lease_expires_at','timestamp with time zone','NO'),
      ('cross_device_clients','updated_at','timestamp with time zone','NO'),
      ('cross_device_commands','id','uuid','NO'),
      ('cross_device_commands','owner_id','uuid','NO'),
      ('cross_device_commands','source_client_instance_id','uuid','NO'),
      ('cross_device_commands','target_id','uuid','YES'),
      ('cross_device_commands','status','text','NO'),
      ('cross_device_commands','idempotency_key','uuid','NO'),
      ('cross_device_commands','record','jsonb','NO'),
      ('cross_device_commands','created_at','timestamp with time zone','NO'),
      ('cross_device_commands','updated_at','timestamp with time zone','NO'),
      ('cross_device_commands','expires_at','timestamp with time zone','NO'),
      ('cross_device_commands','company_id','uuid','NO')
    ), required_indexes(table_name,index_name,definition) AS (VALUES
      ('cross_device_clients','cross_device_clients_pkey','UNIQUE INDEX cross_device_clients_pkey USING btree (id)'),
      ('cross_device_clients','cross_device_clients_owner_idx','INDEX cross_device_clients_owner_idx USING btree (owner_id, lease_expires_at DESC)'),
      ('cross_device_commands','cross_device_commands_pkey','UNIQUE INDEX cross_device_commands_pkey USING btree (id)'),
      ('cross_device_commands','cross_device_commands_source_idx','INDEX cross_device_commands_source_idx USING btree (owner_id, source_client_instance_id, updated_at DESC)'),
      ('cross_device_commands','cross_device_commands_target_idx','INDEX cross_device_commands_target_idx USING btree (owner_id, target_id, status, created_at)'),
      ('cross_device_commands','cross_device_commands_company_idempotency_idx','UNIQUE INDEX cross_device_commands_company_idempotency_idx USING btree (owner_id, company_id, source_client_instance_id, idempotency_key)')
    )
    SELECT
      NOT EXISTS(SELECT 1 FROM expected e WHERE NOT EXISTS(
        SELECT 1 FROM information_schema.columns c WHERE c.table_schema=current_schema()
        AND c.table_name=e.table_name AND c.column_name=e.column_name
        AND c.data_type=e.data_type AND c.is_nullable=e.nullable))
      AND NOT EXISTS(SELECT 1 FROM required_indexes e WHERE NOT EXISTS(
        SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid
        JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
        WHERE n.nspname=current_schema() AND t.relname=e.table_name AND ix.relname=e.index_name
        AND i.indisvalid AND i.indisready AND i.indpred IS NULL
        AND split_part(pg_get_indexdef(ix.oid),' ON ',1) || ' ' ||
            split_part(pg_get_indexdef(ix.oid),' USING ',2) = 'CREATE ' ||
            split_part(e.definition,' USING ',1) || ' ' || split_part(e.definition,' USING ',2)))
      AND (SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
        JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema()
        AND t.relname IN ('cross_device_clients','cross_device_commands')
        AND c.contype='p' AND c.convalidated AND pg_get_constraintdef(c.oid)='PRIMARY KEY (id)')=2
      AND EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
        JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_class f ON f.oid=c.confrelid
        JOIN pg_namespace fn ON fn.oid=f.relnamespace WHERE n.nspname=current_schema()
        AND fn.nspname=current_schema() AND t.relname='cross_device_commands' AND f.relname='companies'
        AND c.contype='f' AND c.confdeltype='r' AND c.convalidated
        AND pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY (company_id) REFERENCES %companies(id) ON DELETE RESTRICT') AS valid
  `);
  if (result.rows[0]?.valid !== true)
    throw new Error("LEGACY_REPAIR_SCHEMA_REVIEW_DENIED");
}

async function receiptFor(client: Query, canonicalSha256: string, review: unknown) {
  const rows = await client.query<{ version: string; at: string }>(
    `
    SELECT version,to_char(applied_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at
    FROM schema_migrations WHERE version IN ($1,$2) ORDER BY version`,
    [LEGACY_REPAIR, CANONICAL_REPAIR],
  );
  return Receipt.parse({
    ...LegacyRepairReviewSchema.parse(review),
    version: LEGACY_REPAIR,
    canonicalVersion: CANONICAL_REPAIR,
    canonicalSha256,
    legacyAppliedAt: rows.rows.find((r) => r.version === LEGACY_REPAIR)?.at,
    canonicalAppliedAt: rows.rows.find((r) => r.version === CANONICAL_REPAIR)?.at,
  });
}

export async function acceptLegacyRepairReview(
  client: Query,
  canonicalSha256: string,
  review: unknown,
) {
  const receipt = await receiptFor(client, canonicalSha256, review);
  await verifyRepairEffects(client);
  await client.query(
    "ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS legacy_repair_review jsonb",
  );
  const existing = await client.query<{
    content_sha256: string | null;
    legacy_repair_review: unknown;
  }>(
    "SELECT content_sha256,legacy_repair_review FROM schema_migrations WHERE version=$1 FOR UPDATE",
    [LEGACY_REPAIR],
  );
  if (existing.rows[0]?.content_sha256 !== null)
    throw new Error("LEGACY_SQL_DIGEST_MUST_REMAIN_UNKNOWN");
  const prior = existing.rows[0]?.legacy_repair_review;
  if (
    prior !== null &&
    JSON.stringify(Receipt.parse(prior)) !== JSON.stringify(receipt)
  )
    throw new Error("LEGACY_REPAIR_RECEIPT_CANNOT_BE_REWRITTEN");
  await client.query(
    "UPDATE schema_migrations SET legacy_repair_review=$2 WHERE version=$1 AND legacy_repair_review IS NULL",
    [LEGACY_REPAIR, receipt],
  );
}

/** Called by ordinary deploy/status; absent operator review fails closed. */
export async function verifyLegacyRepairReview(
  client: Query,
  hashes: Map<string, string>,
  applied: string[],
) {
  const unknown = applied.filter((version) => !hashes.has(version));
  if (!unknown.length) return new Set<string>();
  if (
    unknown.length !== 1 ||
    unknown[0] !== LEGACY_REPAIR ||
    !applied.includes(CANONICAL_REPAIR)
  )
    throw new Error("MIGRATION_LINEAGE_DENIED");
  const column = await client.query<{ present: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='schema_migrations' AND column_name='legacy_repair_review') AS present",
  );
  if (!column.rows[0]?.present)
    throw new Error("LEGACY_REPAIR_OPERATOR_REVIEW_REQUIRED");
  const row = await client.query<{
    content_sha256: string | null;
    legacy_repair_review: unknown;
  }>(
    "SELECT content_sha256,legacy_repair_review FROM schema_migrations WHERE version=$1",
    [LEGACY_REPAIR],
  );
  const receipt = Receipt.parse(row.rows[0]?.legacy_repair_review);
  if (row.rows[0]?.content_sha256 !== null)
    throw new Error("LEGACY_SQL_DIGEST_MUST_REMAIN_UNKNOWN");
  const actual = await receiptFor(client, hashes.get(CANONICAL_REPAIR)!, {
    acknowledgement: receipt.acknowledgement,
    originalSqlStatus: receipt.originalSqlStatus,
    recoveryBranchId: receipt.recoveryBranchId,
  });
  if (receipt.canonicalSha256 !== actual.canonicalSha256)
    throw new Error("LEGACY_REPAIR_CANONICAL_DIGEST_CHANGED");
  await verifyRepairEffects(client);
  return new Set([LEGACY_REPAIR]);
}
