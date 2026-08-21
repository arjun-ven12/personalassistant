import { ValidationRecordSchema, type ValidationRecord } from "@alexa-control/shared";
import type { Pool } from "pg";

import type { ValidationStore } from "./store.js";

const parseValidation = (row: { record: unknown }) =>
  ValidationRecordSchema.parse(row.record);

export class PostgresValidationStore implements ValidationStore {
  constructor(readonly pool: Pool) {}

  async create(validation: ValidationRecord) {
    const parsed = ValidationRecordSchema.parse(validation);
    await this.pool.query(
      `INSERT INTO validation_runs(
        id,owner_id,repository_id,workspace_id,patch_id,status,classification,
        execution_request_id,created_at,updated_at,record
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.repositoryId,
        parsed.workspaceId,
        parsed.patchId,
        parsed.status,
        parsed.classification,
        parsed.executionRequestId,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
    return parsed;
  }

  async find(id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM validation_runs WHERE id=$1",
      [id],
    );
    return result.rows[0] ? parseValidation(result.rows[0]) : undefined;
  }

  async list(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM validation_runs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT $2",
      [ownerId, limit],
    );
    return result.rows.map(parseValidation);
  }

  async update(validation: ValidationRecord) {
    const parsed = ValidationRecordSchema.parse(validation);
    await this.pool.query(
      `UPDATE validation_runs
       SET status=$2,classification=$3,execution_request_id=$4,updated_at=$5,record=$6
       WHERE id=$1 AND owner_id=$7`,
      [
        parsed.id,
        parsed.status,
        parsed.classification,
        parsed.executionRequestId,
        parsed.updatedAt,
        parsed,
        parsed.ownerId,
      ],
    );
  }

  async findByExecutionRequestId(id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM validation_runs WHERE execution_request_id=$1",
      [id],
    );
    return result.rows[0] ? parseValidation(result.rows[0]) : undefined;
  }
}
