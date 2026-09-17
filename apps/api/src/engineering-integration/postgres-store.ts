import {
  EngineeringIntegrationReviewSchema,
  EngineeringIntegrationRunSchema,
  EngineeringMergeCandidateSchema,
  type EngineeringIntegrationReview,
  type EngineeringIntegrationRun,
  type EngineeringMergeCandidate,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { EngineeringIntegrationStore } from "./store.js";

export class PostgresEngineeringIntegrationStore implements EngineeringIntegrationStore {
  constructor(readonly pool: Pool) {}
  async saveRun(value: EngineeringIntegrationRun) {
    const run = EngineeringIntegrationRunSchema.parse(value);
    await this.pool.query(
      `INSERT INTO engineering_integration_runs(id,owner_id,company_id,repository_id,objective_id,idempotency_key,status,lease_owner,lease_expires_at,lease_generation,created_at,updated_at,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(owner_id,company_id,id) DO UPDATE SET status=EXCLUDED.status,lease_owner=EXCLUDED.lease_owner,lease_expires_at=EXCLUDED.lease_expires_at,lease_generation=EXCLUDED.lease_generation,updated_at=EXCLUDED.updated_at,record=EXCLUDED.record`,
      [
        run.id,
        run.ownerId,
        run.companyId,
        run.repositoryId,
        run.objectiveId,
        run.idempotencyKey,
        run.status,
        run.leaseOwner,
        run.leaseExpiresAt,
        run.leaseGeneration,
        run.createdAt,
        run.updatedAt,
        run,
      ],
    );
  }
  async findRun(ownerId: string, companyId: string, runId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_integration_runs WHERE owner_id=$1 AND company_id=$2 AND id=$3",
      [ownerId, companyId, runId],
    );
    return result.rows[0]
      ? EngineeringIntegrationRunSchema.parse(result.rows[0].record)
      : undefined;
  }
  async findRunByIdempotency(
    ownerId: string,
    companyId: string,
    repositoryId: string,
    idempotencyKey: string,
  ) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_integration_runs WHERE owner_id=$1 AND company_id=$2 AND repository_id=$3 AND idempotency_key=$4",
      [ownerId, companyId, repositoryId, idempotencyKey],
    );
    return result.rows[0]
      ? EngineeringIntegrationRunSchema.parse(result.rows[0].record)
      : undefined;
  }
  async listRuns(ownerId: string, companyId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_integration_runs WHERE owner_id=$1 AND company_id=$2 ORDER BY updated_at DESC LIMIT $3",
      [ownerId, companyId, limit],
    );
    return result.rows.map((row) => EngineeringIntegrationRunSchema.parse(row.record));
  }
  async acquireLease(input: {
    ownerId: string;
    companyId: string;
    runId: string;
    workerId: string;
    now: string;
    expiresAt: string;
  }) {
    const result = await this.pool.query<{ record: unknown }>(
      `UPDATE engineering_integration_runs SET lease_owner=$4,lease_expires_at=$6::text::timestamptz,lease_generation=lease_generation+1,updated_at=$5::text::timestamptz,record=record || jsonb_build_object('leaseOwner',$4::text,'leaseExpiresAt',$6::text,'leaseGeneration',lease_generation+1,'startedAt',COALESCE(record->'startedAt',to_jsonb($5::text)),'updatedAt',$5::text) WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND status NOT IN ('READY','CANCELLED','BLOCKED') AND (lease_owner IS NULL OR lease_expires_at <= $5::text::timestamptz) RETURNING record`,
      [
        input.ownerId,
        input.companyId,
        input.runId,
        input.workerId,
        input.now,
        input.expiresAt,
      ],
    );
    return result.rows[0]
      ? EngineeringIntegrationRunSchema.parse(result.rows[0].record)
      : undefined;
  }
  async acquireReadyLease(input: {
    ownerId: string;
    companyId: string;
    runId: string;
    workerId: string;
    now: string;
    expiresAt: string;
  }) {
    const result = await this.pool.query<{ record: unknown }>(
      `UPDATE engineering_integration_runs SET lease_owner=$4,lease_expires_at=$6::text::timestamptz,lease_generation=lease_generation+1,updated_at=$5::text::timestamptz,record=record || jsonb_build_object('leaseOwner',$4::text,'leaseExpiresAt',$6::text,'leaseGeneration',lease_generation+1,'updatedAt',$5::text) WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND status='READY' AND (lease_owner IS NULL OR lease_expires_at <= $5::text::timestamptz) RETURNING record`,
      [input.ownerId, input.companyId, input.runId, input.workerId, input.now, input.expiresAt],
    );
    return result.rows[0] ? EngineeringIntegrationRunSchema.parse(result.rows[0].record) : undefined;
  }
  async renewLease(input: {
    ownerId: string;
    companyId: string;
    runId: string;
    workerId: string;
    generation: number;
    now: string;
    expiresAt: string;
  }) {
    const result = await this.pool.query(
      `UPDATE engineering_integration_runs SET lease_expires_at=$7::text::timestamptz,updated_at=$6::text::timestamptz,record=jsonb_set(jsonb_set(record,'{leaseExpiresAt}',to_jsonb($7::text)),'{updatedAt}',to_jsonb($6::text)) WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND lease_owner=$4 AND lease_generation=$5 AND lease_expires_at>$6::text::timestamptz`,
      [
        input.ownerId,
        input.companyId,
        input.runId,
        input.workerId,
        input.generation,
        input.now,
        input.expiresAt,
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }
  async saveRunFenced(
    value: EngineeringIntegrationRun,
    workerId: string,
    generation: number,
    now: string,
  ) {
    const run = EngineeringIntegrationRunSchema.parse(value);
    const result = await this.pool.query(
      `UPDATE engineering_integration_runs SET status=$6,updated_at=$7::text::timestamptz,record=$8::jsonb || jsonb_build_object('leaseOwner',lease_owner,'leaseExpiresAt',to_char(lease_expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'leaseGeneration',lease_generation) WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND lease_owner=$4 AND lease_generation=$5 AND lease_expires_at>$9::text::timestamptz`,
      [
        run.ownerId,
        run.companyId,
        run.id,
        workerId,
        generation,
        run.status,
        run.updatedAt,
        run,
        now,
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }
  async commitReady(
    value: EngineeringIntegrationRun,
    candidate: EngineeringMergeCandidate,
    workerId: string,
    generation: number,
    now: string,
  ) {
    const run = EngineeringIntegrationRunSchema.parse(value);
    const item = EngineeringMergeCandidateSchema.parse(candidate);
    if (
      run.status !== "READY" ||
      item.status !== "READY" ||
      item.runId !== run.id ||
      item.ownerId !== run.ownerId ||
      item.companyId !== run.companyId ||
      item.headCommit !== item.validatedHeadCommit ||
      item.headCommit !== item.reviewedHeadCommit
    )
      return false;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE engineering_integration_runs SET status='READY',updated_at=$6::text::timestamptz,record=$7::jsonb || jsonb_build_object('leaseOwner',lease_owner,'leaseExpiresAt',to_char(lease_expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'leaseGeneration',lease_generation) WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND lease_owner=$4 AND lease_generation=$5 AND lease_expires_at>$8::text::timestamptz AND status NOT IN ('READY','CANCELLED')`,
        [
          run.ownerId,
          run.companyId,
          run.id,
          workerId,
          generation,
          run.updatedAt,
          run,
          now,
        ],
      );
      if (updated.rowCount !== 1) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query(
        `INSERT INTO engineering_merge_candidates(id,owner_id,company_id,run_id,status,updated_at,record) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(owner_id,company_id,run_id) DO UPDATE SET status=EXCLUDED.status,updated_at=EXCLUDED.updated_at,record=EXCLUDED.record`,
        [
          item.id,
          item.ownerId,
          item.companyId,
          item.runId,
          item.status,
          item.updatedAt,
          item,
        ],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async releaseLease(input: {
    ownerId: string;
    companyId: string;
    runId: string;
    workerId: string;
    generation: number;
    now: string;
  }) {
    const result = await this.pool.query(
      `UPDATE engineering_integration_runs SET lease_owner=NULL,lease_expires_at=NULL,updated_at=$6::text::timestamptz,record=jsonb_set(jsonb_set(jsonb_set(record,'{leaseOwner}','null'),'{leaseExpiresAt}','null'),'{updatedAt}',to_jsonb($6::text)) WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND lease_owner=$4 AND lease_generation=$5 AND lease_expires_at>$6::text::timestamptz`,
      [
        input.ownerId,
        input.companyId,
        input.runId,
        input.workerId,
        input.generation,
        input.now,
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }
  async saveCandidate(value: EngineeringMergeCandidate) {
    const item = EngineeringMergeCandidateSchema.parse(value);
    await this.pool.query(
      `INSERT INTO engineering_merge_candidates(id,owner_id,company_id,run_id,status,updated_at,record) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(owner_id,company_id,run_id) DO UPDATE SET status=EXCLUDED.status,updated_at=EXCLUDED.updated_at,record=EXCLUDED.record`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.runId,
        item.status,
        item.updatedAt,
        item,
      ],
    );
  }
  async saveCandidateFenced(value: EngineeringMergeCandidate, workerId: string, generation: number, now: string) {
    const candidate = EngineeringMergeCandidateSchema.parse(value);
    const result = await this.pool.query(
      `UPDATE engineering_merge_candidates SET status=$6,updated_at=$7::text::timestamptz,record=$8::jsonb WHERE owner_id=$1 AND company_id=$2 AND run_id=$3 AND id=$4 AND EXISTS (SELECT 1 FROM engineering_integration_runs r WHERE r.owner_id=$1 AND r.company_id=$2 AND r.id=$3 AND r.status='READY' AND r.lease_owner=$5 AND r.lease_generation=$9 AND r.lease_expires_at>$10::text::timestamptz)`,
      [candidate.ownerId, candidate.companyId, candidate.runId, candidate.id, workerId, candidate.status, candidate.updatedAt, candidate, generation, now],
    );
    return (result.rowCount ?? 0) === 1;
  }
  async findCandidateByRun(ownerId: string, companyId: string, runId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_merge_candidates WHERE owner_id=$1 AND company_id=$2 AND run_id=$3",
      [ownerId, companyId, runId],
    );
    return result.rows[0]
      ? EngineeringMergeCandidateSchema.parse(result.rows[0].record)
      : undefined;
  }
  async saveReview(value: EngineeringIntegrationReview) {
    const item = EngineeringIntegrationReviewSchema.parse(value);
    await this.pool.query(
      "INSERT INTO engineering_integration_reviews(id,owner_id,company_id,run_id,created_at,record) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING",
      [item.id, item.ownerId, item.companyId, item.runId, item.createdAt, item],
    );
  }
  async listReviews(ownerId: string, companyId: string, runId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_integration_reviews WHERE owner_id=$1 AND company_id=$2 AND run_id=$3 ORDER BY created_at",
      [ownerId, companyId, runId],
    );
    return result.rows.map((row) =>
      EngineeringIntegrationReviewSchema.parse(row.record),
    );
  }
}
