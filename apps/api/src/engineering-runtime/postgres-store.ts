import {
  EngineeringCommandProfileSchema,
  EngineeringExecutionRecordSchema,
  EngineeringRepositorySchema,
  EngineeringValidationReportSchema,
  EngineeringWorkspaceSchema,
  type EngineeringCommandProfile,
  type EngineeringExecutionRecord,
  type EngineeringRepository,
  type EngineeringValidationReport,
  type EngineeringWorkspace,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { EngineeringRuntimeStore } from "./store.js";

const parseRepository = (row: { record: unknown }) =>
  EngineeringRepositorySchema.parse(row.record);
const parseProfile = (row: { record: unknown }) =>
  EngineeringCommandProfileSchema.parse(row.record);
const parseWorkspace = (row: { record: unknown }) =>
  EngineeringWorkspaceSchema.parse(row.record);

export class PostgresEngineeringRuntimeStore implements EngineeringRuntimeStore {
  constructor(readonly pool: Pool) {}

  async saveRepository(value: EngineeringRepository) {
    const item = EngineeringRepositorySchema.parse(value);
    await this.pool.query(
      `INSERT INTO engineering_repositories(id,owner_id,company_id,workspace_locator_id,status,created_at,updated_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(owner_id,company_id,id) DO UPDATE SET status=EXCLUDED.status,updated_at=EXCLUDED.updated_at,record=EXCLUDED.record`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.workspaceLocatorId,
        item.status,
        item.createdAt,
        item.updatedAt,
        item,
      ],
    );
  }

  async findRepository(ownerId: string, companyId: string, id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_repositories WHERE owner_id=$1 AND company_id=$2 AND id=$3",
      [ownerId, companyId, id],
    );
    return result.rows[0] ? parseRepository(result.rows[0]) : undefined;
  }

  async listRepositories(ownerId: string, companyId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_repositories WHERE owner_id=$1 AND company_id=$2 ORDER BY updated_at DESC",
      [ownerId, companyId],
    );
    return result.rows.map(parseRepository);
  }

  async saveCommandProfile(value: EngineeringCommandProfile) {
    const item = EngineeringCommandProfileSchema.parse(value);
    await this.pool.query(
      `INSERT INTO engineering_command_profiles(id,owner_id,company_id,status,created_at,updated_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(owner_id,company_id,id) DO UPDATE SET status=EXCLUDED.status,updated_at=EXCLUDED.updated_at,record=EXCLUDED.record`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.status,
        item.createdAt,
        item.updatedAt,
        item,
      ],
    );
  }

  async findCommandProfile(ownerId: string, companyId: string, id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_command_profiles WHERE owner_id=$1 AND company_id=$2 AND id=$3",
      [ownerId, companyId, id],
    );
    return result.rows[0] ? parseProfile(result.rows[0]) : undefined;
  }

  async createWorkspace(value: EngineeringWorkspace) {
    const item = EngineeringWorkspaceSchema.parse(value);
    const result = await this.pool.query<{ record: unknown }>(
      `INSERT INTO engineering_workspaces(id,owner_id,company_id,repository_id,idempotency_key,state,lease_owner,lease_expires_at,lease_generation,created_at,updated_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT(owner_id,company_id,repository_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
       RETURNING record`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.repositoryId,
        item.idempotencyKey,
        item.state,
        item.leaseOwner,
        item.leaseExpiresAt,
        item.leaseGeneration,
        item.createdAt,
        item.updatedAt,
        item,
      ],
    );
    return parseWorkspace(result.rows[0]!);
  }

  async findWorkspace(ownerId: string, companyId: string, id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_workspaces WHERE owner_id=$1 AND company_id=$2 AND id=$3",
      [ownerId, companyId, id],
    );
    return result.rows[0] ? parseWorkspace(result.rows[0]) : undefined;
  }

  async findWorkspaceByIdempotencyKey(
    ownerId: string,
    companyId: string,
    repositoryId: string,
    idempotencyKey: string,
  ) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_workspaces WHERE owner_id=$1 AND company_id=$2 AND repository_id=$3 AND idempotency_key=$4",
      [ownerId, companyId, repositoryId, idempotencyKey],
    );
    return result.rows[0] ? parseWorkspace(result.rows[0]) : undefined;
  }

  async listWorkspaces(ownerId: string, companyId: string, repositoryId?: string) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM engineering_workspaces WHERE owner_id=$1 AND company_id=$2 AND ($3::uuid IS NULL OR repository_id=$3) ORDER BY updated_at DESC`,
      [ownerId, companyId, repositoryId ?? null],
    );
    return result.rows.map(parseWorkspace);
  }

  async saveWorkspace(value: EngineeringWorkspace) {
    const item = EngineeringWorkspaceSchema.parse(value);
    await this.pool.query(
      `UPDATE engineering_workspaces SET state=$4,lease_owner=$5,lease_expires_at=$6,lease_generation=$7,updated_at=$8,record=$9
       WHERE owner_id=$1 AND company_id=$2 AND id=$3`,
      [
        item.ownerId,
        item.companyId,
        item.id,
        item.state,
        item.leaseOwner,
        item.leaseExpiresAt,
        item.leaseGeneration,
        item.updatedAt,
        item,
      ],
    );
  }

  async saveWorkspaceWithLease(input: {
    value: EngineeringWorkspace;
    workerId: string;
    generation: number;
    now: string;
  }) {
    const item = EngineeringWorkspaceSchema.parse(input.value);
    const result = await this.pool.query(
      `UPDATE engineering_workspaces
       SET state=$7,updated_at=$8,
           record=jsonb_set(jsonb_set(jsonb_set($9::jsonb,'{leaseOwner}',to_jsonb(lease_owner)),'{leaseExpiresAt}',to_jsonb(to_char(lease_expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),'{leaseGeneration}',to_jsonb(lease_generation))
       WHERE owner_id=$1 AND company_id=$2 AND id=$3
         AND lease_owner=$4 AND lease_generation=$5 AND lease_expires_at>$6`,
      [
        item.ownerId,
        item.companyId,
        item.id,
        input.workerId,
        input.generation,
        input.now,
        item.state,
        item.updatedAt,
        item,
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async acquireWorkspaceLease(input: {
    ownerId: string;
    companyId: string;
    workspaceId: string;
    workerId: string;
    now: string;
    expiresAt: string;
  }) {
    const current = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM engineering_workspaces WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND (lease_expires_at IS NULL OR lease_expires_at<=$4) FOR UPDATE`,
      [input.ownerId, input.companyId, input.workspaceId, input.now],
    );
    if (!current.rows[0]) return undefined;
    const item = parseWorkspace(current.rows[0]);
    const updated = EngineeringWorkspaceSchema.parse({
      ...item,
      leaseOwner: input.workerId,
      leaseExpiresAt: input.expiresAt,
      leaseGeneration: item.leaseGeneration + 1,
      updatedAt: input.now,
    });
    const result = await this.pool.query<{ record: unknown }>(
      `UPDATE engineering_workspaces SET lease_owner=$4,lease_expires_at=$5,lease_generation=$6,updated_at=$7,record=$8
       WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND (lease_expires_at IS NULL OR lease_expires_at<=$7) RETURNING record`,
      [
        input.ownerId,
        input.companyId,
        input.workspaceId,
        input.workerId,
        input.expiresAt,
        updated.leaseGeneration,
        input.now,
        updated,
      ],
    );
    return result.rows[0] ? parseWorkspace(result.rows[0]) : undefined;
  }

  async renewWorkspaceLease(input: {
    ownerId: string;
    companyId: string;
    workspaceId: string;
    workerId: string;
    generation: number;
    now: string;
    expiresAt: string;
  }) {
    const current = await this.findWorkspace(
      input.ownerId,
      input.companyId,
      input.workspaceId,
    );
    if (
      !current ||
      current.leaseOwner !== input.workerId ||
      current.leaseGeneration !== input.generation
    )
      return undefined;
    const updated = EngineeringWorkspaceSchema.parse({
      ...current,
      leaseExpiresAt: input.expiresAt,
      updatedAt: input.now,
    });
    const result = await this.pool.query<{ record: unknown }>(
      `UPDATE engineering_workspaces SET lease_expires_at=$6,updated_at=$7,record=$8
       WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND lease_owner=$4 AND lease_generation=$5 AND lease_expires_at>$7
       RETURNING record`,
      [
        input.ownerId,
        input.companyId,
        input.workspaceId,
        input.workerId,
        input.generation,
        input.expiresAt,
        input.now,
        updated,
      ],
    );
    return result.rows[0] ? parseWorkspace(result.rows[0]) : undefined;
  }

  async releaseWorkspaceLease(input: {
    ownerId: string;
    companyId: string;
    workspaceId: string;
    workerId: string;
    generation: number;
    now: string;
  }) {
    const result = await this.pool.query(
      `UPDATE engineering_workspaces SET lease_owner=NULL,lease_expires_at=NULL,updated_at=$6::timestamptz,
       record=jsonb_set(jsonb_set(jsonb_set(record,'{leaseOwner}','null'::jsonb),'{leaseExpiresAt}','null'::jsonb),'{updatedAt}',to_jsonb(($6::timestamptz)::text))
       WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND lease_owner=$4 AND lease_generation=$5`,
      [
        input.ownerId,
        input.companyId,
        input.workspaceId,
        input.workerId,
        input.generation,
        input.now,
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async saveExecution(value: EngineeringExecutionRecord) {
    const item = EngineeringExecutionRecordSchema.parse(value);
    await this.pool.query(
      `INSERT INTO engineering_executions(id,owner_id,company_id,repository_id,workspace_id,capability,status,started_at,completed_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(owner_id,company_id,id) DO UPDATE SET status=EXCLUDED.status,completed_at=EXCLUDED.completed_at,record=EXCLUDED.record`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.repositoryId,
        item.workspaceId,
        item.capability,
        item.status,
        item.startedAt,
        item.completedAt,
        item,
      ],
    );
  }

  async saveValidation(
    value: EngineeringValidationReport,
    ownerId: string,
    companyId: string,
  ) {
    const item = EngineeringValidationReportSchema.parse(value);
    await this.pool.query(
      `INSERT INTO engineering_validation_reports(id,owner_id,company_id,workspace_id,status,created_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,
      [
        item.id,
        ownerId,
        companyId,
        item.workspaceId,
        item.status,
        item.createdAt,
        item,
      ],
    );
  }

  async findValidation(ownerId: string, companyId: string, id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_validation_reports WHERE owner_id=$1 AND company_id=$2 AND id=$3",
      [ownerId, companyId, id],
    );
    return result.rows[0]
      ? EngineeringValidationReportSchema.parse(result.rows[0].record)
      : undefined;
  }
}
