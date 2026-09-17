import {
  EngineeringDeliverySchema,
  type EngineeringDelivery,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { EngineeringDeliveryStore } from "./store.js";

const parse = (row: { record: unknown }) => EngineeringDeliverySchema.parse(row.record);

export class PostgresEngineeringDeliveryStore implements EngineeringDeliveryStore {
  constructor(readonly pool: Pool) {}

  async save(value: EngineeringDelivery) {
    const item = EngineeringDeliverySchema.parse(value);
    await this.pool.query(
      `INSERT INTO engineering_deliveries(id,owner_id,company_id,objective_id,repository_id,status,idempotency_key,created_at,updated_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(owner_id,company_id,id) DO UPDATE SET status=EXCLUDED.status,updated_at=EXCLUDED.updated_at,record=EXCLUDED.record`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.objectiveId,
        item.repositoryId,
        item.status,
        item.instructionKeys[0],
        item.createdAt,
        item.updatedAt,
        item,
      ],
    );
  }

  async saveIfUpdatedAt(value: EngineeringDelivery, expectedUpdatedAt: string) {
    const item = EngineeringDeliverySchema.parse(value);
    const result = await this.pool.query(
      `UPDATE engineering_deliveries SET status=$4,updated_at=$5,record=$6
       WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND updated_at=$7`,
      [
        item.ownerId,
        item.companyId,
        item.id,
        item.status,
        item.updatedAt,
        item,
        expectedUpdatedAt,
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async find(ownerId: string, companyId: string, id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_deliveries WHERE owner_id=$1 AND company_id=$2 AND id=$3",
      [ownerId, companyId, id],
    );
    return result.rows[0] ? parse(result.rows[0]) : undefined;
  }
  async findByObjective(ownerId: string, companyId: string, objectiveId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_deliveries WHERE owner_id=$1 AND company_id=$2 AND objective_id=$3",
      [ownerId, companyId, objectiveId],
    );
    return result.rows[0] ? parse(result.rows[0]) : undefined;
  }
  async findByIdempotencyKey(ownerId: string, companyId: string, key: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_deliveries WHERE owner_id=$1 AND company_id=$2 AND idempotency_key=$3",
      [ownerId, companyId, key],
    );
    return result.rows[0] ? parse(result.rows[0]) : undefined;
  }
  async list(ownerId: string, companyId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_deliveries WHERE owner_id=$1 AND company_id=$2 ORDER BY updated_at DESC LIMIT $3",
      [ownerId, companyId, limit],
    );
    return result.rows.map(parse);
  }
}
