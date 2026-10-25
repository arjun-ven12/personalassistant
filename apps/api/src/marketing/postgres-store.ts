import {
  MarketingArtifactSchema, MarketingCampaignSchema,
  type MarketingArtifact, type MarketingCampaign,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import { validMarketingArtifactTransition, type MarketingStore } from "./store.js";

export class PostgresMarketingStore implements MarketingStore {
  constructor(readonly pool: Pool) {}

  async createCampaign(value: MarketingCampaign) {
    const item = MarketingCampaignSchema.parse(value);
    const result = await this.pool.query<{ record: unknown }>(
      `INSERT INTO marketing_campaigns(owner_id,company_id,id,objective_id,idempotency_key,status,version,updated_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(owner_id,company_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
       RETURNING record`,
      [item.ownerId,item.companyId,item.id,item.objectiveId,item.idempotencyKey,item.status,item.version,item.updatedAt,item],
    );
    return MarketingCampaignSchema.parse(result.rows[0]?.record);
  }
  async findCampaign(ownerId: string, companyId: string, campaignId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM marketing_campaigns WHERE owner_id=$1 AND company_id=$2 AND id=$3",
      [ownerId,companyId,campaignId],
    );
    return result.rows[0] ? MarketingCampaignSchema.parse(result.rows[0].record) : null;
  }
  async findByKey(ownerId: string, companyId: string, key: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM marketing_campaigns WHERE owner_id=$1 AND company_id=$2 AND idempotency_key=$3",
      [ownerId,companyId,key],
    );
    return result.rows[0] ? MarketingCampaignSchema.parse(result.rows[0].record) : null;
  }
  async listCampaigns(ownerId: string, companyId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM marketing_campaigns WHERE owner_id=$1 AND company_id=$2 ORDER BY updated_at DESC LIMIT $3",
      [ownerId,companyId,Math.min(Math.max(limit,0),100)],
    );
    return result.rows.map((row) => MarketingCampaignSchema.parse(row.record));
  }
  async listActiveCampaigns(limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM marketing_campaigns WHERE status='ACTIVE'
         AND record->'automationContext' IS NOT NULL AND record->'automationContext' <> 'null'::jsonb
       ORDER BY updated_at ASC LIMIT $1`,
      [Math.min(Math.max(limit, 0), 50)],
    );
    return result.rows.map((row) => MarketingCampaignSchema.parse(row.record));
  }
  async updateCampaign(value: MarketingCampaign, expectedVersion: number) {
    const item = MarketingCampaignSchema.parse(value);
    if (item.version !== expectedVersion + 1) return false;
    const result = await this.pool.query(
      `UPDATE marketing_campaigns SET status=$5,version=$6,updated_at=$7,record=$8
       WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND version=$4`,
      [item.ownerId,item.companyId,item.id,expectedVersion,item.status,item.version,item.updatedAt,item],
    );
    return result.rowCount === 1;
  }
  async createArtifact(value: MarketingArtifact) {
    const item = MarketingArtifactSchema.parse(value);
    const result = await this.pool.query<{ record: unknown }>(
      `INSERT INTO marketing_artifacts(owner_id,company_id,id,campaign_id,deliverable_id,version,status,content_digest,created_at,record)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
       WHERE EXISTS (SELECT 1 FROM marketing_campaigns c WHERE c.owner_id=$1 AND c.company_id=$2 AND c.id=$4
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.record->'deliverables') d
           WHERE d->>'id'=($5::uuid)::text AND d->>'type'=$11))
       ON CONFLICT(owner_id,company_id,deliverable_id,version) DO UPDATE SET id=marketing_artifacts.id
       RETURNING record`,
      [item.ownerId,item.companyId,item.id,item.campaignId,item.deliverableId,item.version,item.status,item.contentDigest,item.createdAt,item,item.type],
    );
    const stored = MarketingArtifactSchema.parse(result.rows[0]?.record);
    if (stored.contentDigest !== item.contentDigest || stored.campaignId !== item.campaignId) throw new Error("Artifact version conflict.");
    return stored;
  }
  async updateArtifactStatus(ownerId: string, companyId: string, campaignId: string, artifactId: string,
    expectedStatus: MarketingArtifact["status"], status: MarketingArtifact["status"], approvalRequestId: string | null) {
    if (!validMarketingArtifactTransition(expectedStatus, status)) throw new Error("Invalid artifact review transition.");
    const result = await this.pool.query<{ record: unknown }>(
      `UPDATE marketing_artifacts SET status=$6,
         record=jsonb_set(jsonb_set(record,'{status}',to_jsonb($6::text)),
           '{approvalRequestId}',COALESCE(to_jsonb($7::text),'null'::jsonb),true)
       WHERE owner_id=$1 AND company_id=$2 AND campaign_id=$3 AND id=$4 AND status=$5
         AND ($5='DRAFT' OR record->>'approvalRequestId'=$7)
       RETURNING record`,
      [ownerId, companyId, campaignId, artifactId, expectedStatus, status, approvalRequestId],
    );
    return result.rows[0] ? MarketingArtifactSchema.parse(result.rows[0].record) : null;
  }
  async listArtifacts(ownerId: string, companyId: string, campaignId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT a.record FROM marketing_artifacts a JOIN marketing_campaigns c
         ON c.owner_id=a.owner_id AND c.company_id=a.company_id AND c.id=a.campaign_id
       WHERE a.owner_id=$1 AND a.company_id=$2 AND a.campaign_id=$3
       ORDER BY EXISTS (SELECT 1 FROM jsonb_array_elements(c.record->'deliverables') d
         WHERE d->>'artifactRef'='marketing-artifact:'||a.id::text) DESC,
         a.created_at DESC,a.version DESC,a.id DESC LIMIT 200`,
      [ownerId,companyId,campaignId],
    );
    return result.rows.map((row) => MarketingArtifactSchema.parse(row.record));
  }
}
