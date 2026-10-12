import {
  UniversalToolProviderSchema,
  UniversalToolReviewSchema,
  UniversalToolResultSchema,
  UniversalToolSchema,
  type UniversalTool,
  type UniversalToolProvider,
  type UniversalToolReview,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { ToolInvocationReceipt, UniversalToolStore } from "./store.js";

const receipt = (row: { invocation_id: string; owner_id: string; company_id: string | null; tool_id: string; request_digest: string; status: ToolInvocationReceipt["status"]; result: unknown }): ToolInvocationReceipt => ({
  invocationId: row.invocation_id,
  ownerId: row.owner_id,
  companyId: row.company_id,
  toolId: row.tool_id,
  requestDigest: row.request_digest,
  status: row.status,
  result: row.result === null ? null : UniversalToolResultSchema.parse(row.result),
});

export class PostgresUniversalToolStore implements UniversalToolStore {
  constructor(readonly pool: Pool) {}

  async saveProvider(value: UniversalToolProvider) {
    const item = UniversalToolProviderSchema.parse(value);
    const result = await this.pool.query(
      `INSERT INTO universal_tool_providers(owner_id,id,company_id,status,updated_at,record)
       VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(owner_id,id) DO UPDATE SET company_id=EXCLUDED.company_id,
       status=EXCLUDED.status,updated_at=EXCLUDED.updated_at,record=EXCLUDED.record
       WHERE universal_tool_providers.company_id IS NOT DISTINCT FROM EXCLUDED.company_id`,
      [item.ownerId, item.id, item.companyId, item.status, item.updatedAt, item],
    );
    if (result.rowCount !== 1) throw new Error("Provider company scope conflict.");
  }

  async findProvider(ownerId: string, providerId: string) {
    const rows = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM universal_tool_providers WHERE owner_id=$1 AND id=$2",
      [ownerId, providerId],
    );
    return rows.rows[0] ? UniversalToolProviderSchema.parse(rows.rows[0].record) : null;
  }

  async saveTools(ownerId: string, providerId: string, values: UniversalTool[]) {
    const provider = await this.findProvider(ownerId, providerId);
    if (!provider) throw new Error("Unknown tool provider.");
    for (const value of values) {
      const item = UniversalToolSchema.parse(value);
      if (item.ownerId !== ownerId || item.providerId !== providerId || item.companyId !== provider.companyId)
        throw new Error("Tool scope mismatch.");
      const result = await this.pool.query(
        `INSERT INTO universal_tool_definitions(owner_id,id,provider_id,company_id,enabled,schema_digest,updated_at,record)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT(owner_id,id) DO UPDATE SET enabled=EXCLUDED.enabled,
         schema_digest=EXCLUDED.schema_digest,updated_at=EXCLUDED.updated_at,record=EXCLUDED.record
         WHERE universal_tool_definitions.provider_id=EXCLUDED.provider_id
           AND universal_tool_definitions.company_id IS NOT DISTINCT FROM EXCLUDED.company_id`,
        [ownerId, item.id, providerId, item.companyId, item.enabled, item.schemaDigest, item.updatedAt, item],
      );
      if (result.rowCount !== 1) throw new Error("Tool identity or company scope conflict.");
    }
  }

  async findTool(ownerId: string, toolId: string) {
    const rows = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM universal_tool_definitions WHERE owner_id=$1 AND id=$2",
      [ownerId, toolId],
    );
    return rows.rows[0] ? UniversalToolSchema.parse(rows.rows[0].record) : null;
  }

  async listTools(ownerId: string) {
    const rows = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM universal_tool_definitions WHERE owner_id=$1 ORDER BY id LIMIT 1000",
      [ownerId],
    );
    return rows.rows.map((row) => UniversalToolSchema.parse(row.record));
  }

  async saveReview(value: UniversalToolReview) {
    const item = UniversalToolReviewSchema.parse(value);
    const tool = await this.findTool(item.ownerId, item.toolId);
    if (!tool || tool.companyId !== item.companyId || tool.providerId !== item.providerId)
      throw new Error("Review scope mismatch.");
    const result = await this.pool.query(
      `INSERT INTO universal_tool_reviews(owner_id,tool_id,company_id,provider_id,schema_digest,status,updated_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(owner_id,tool_id) DO UPDATE SET schema_digest=EXCLUDED.schema_digest,
         status=EXCLUDED.status,updated_at=EXCLUDED.updated_at,record=EXCLUDED.record
       WHERE universal_tool_reviews.company_id=EXCLUDED.company_id
         AND universal_tool_reviews.provider_id=EXCLUDED.provider_id
         AND universal_tool_reviews.status<>'REVOKED'`,
      [item.ownerId, item.toolId, item.companyId, item.providerId, item.schemaDigest, item.status, item.updatedAt, item],
    );
    if (result.rowCount !== 1) throw new Error("Review scope conflict or revocation.");
  }

  async findReview(ownerId: string, toolId: string) {
    const rows = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM universal_tool_reviews WHERE owner_id=$1 AND tool_id=$2",
      [ownerId, toolId],
    );
    return rows.rows[0] ? UniversalToolReviewSchema.parse(rows.rows[0].record) : null;
  }

  async reserve(value: ToolInvocationReceipt) {
    const rows = await this.pool.query<Parameters<typeof receipt>[0]>(
      `INSERT INTO universal_tool_invocation_receipts
       (owner_id,invocation_id,company_id,tool_id,request_digest,status,result)
       VALUES($1,$2,$3,$4,$5,'RESERVED',NULL)
       ON CONFLICT(owner_id,invocation_id) DO UPDATE SET invocation_id=EXCLUDED.invocation_id
       RETURNING *`,
      [value.ownerId, value.invocationId, value.companyId, value.toolId, value.requestDigest],
    );
    return receipt(rows.rows[0]!);
  }

  async claim(ownerId: string, invocationId: string) {
    const result = await this.pool.query(
      `UPDATE universal_tool_invocation_receipts SET claimed_at=now(),updated_at=now()
       WHERE owner_id=$1 AND invocation_id=$2 AND status='RESERVED' AND claimed_at IS NULL`,
      [ownerId, invocationId],
    );
    return result.rowCount === 1;
  }

  async complete(value: ToolInvocationReceipt) {
    if (value.status === "RESERVED") throw new Error("A completed receipt requires a terminal status.");
    const result = await this.pool.query(
      `UPDATE universal_tool_invocation_receipts SET status=$6,result=$7,updated_at=now()
       WHERE owner_id=$1 AND invocation_id=$2 AND company_id IS NOT DISTINCT FROM $3
         AND tool_id=$4 AND request_digest=$5 AND claimed_at IS NOT NULL AND status IN ('RESERVED','INDETERMINATE')`,
      [value.ownerId, value.invocationId, value.companyId, value.toolId, value.requestDigest, value.status, value.result],
    );
    if (result.rowCount !== 1) throw new Error("Invocation receipt is missing, changed, or already completed.");
  }

  async findReceipt(ownerId: string, companyId: string, invocationId: string) {
    const rows = await this.pool.query<Parameters<typeof receipt>[0]>(
      "SELECT * FROM universal_tool_invocation_receipts WHERE owner_id=$1 AND company_id=$2 AND invocation_id=$3",
      [ownerId, companyId, invocationId]);
    return rows.rows[0] ? receipt(rows.rows[0]) : null;
  }

  async listReceipts(ownerId: string, companyId: string, limit: number) {
    const rows = await this.pool.query<Parameters<typeof receipt>[0]>(
      "SELECT * FROM universal_tool_invocation_receipts WHERE owner_id=$1 AND company_id=$2 ORDER BY created_at DESC LIMIT $3",
      [ownerId, companyId, Math.min(Math.max(limit, 0), 500)]);
    return rows.rows.map(receipt);
  }

  async setOwnerAcceptance(ownerId: string, companyId: string, invocationId: string, acceptance: "ACCEPTED" | "REJECTED") {
    const result = await this.pool.query(
      `UPDATE universal_tool_invocation_receipts
       SET result=jsonb_set(result,'{ownerAcceptance}',to_jsonb($4::text),true),updated_at=now()
       WHERE owner_id=$1 AND company_id=$2 AND invocation_id=$3 AND status='COMPLETED'
         AND result->>'status'='SUCCEEDED' AND COALESCE(result->>'ownerAcceptance','')=''`,
      [ownerId, companyId, invocationId, acceptance]);
    return result.rowCount === 1;
  }
}
