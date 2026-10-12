import {
  AthenaCoderControlStateSchema,
  type AthenaCoderControlState,
} from "@alexa-control/shared";
import type { Pool } from "pg";
import type { AthenaCoderControlStore } from "./control.js";
export class PostgresAthenaCoderControlStore implements AthenaCoderControlStore {
  constructor(readonly pool: Pool) {}
  async get(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM athena_coder_controls WHERE owner_id=$1",
      [ownerId],
    );
    return result.rows[0]
      ? AthenaCoderControlStateSchema.parse(result.rows[0].record)
      : undefined;
  }
  async put(state: AthenaCoderControlState) {
    const parsed = AthenaCoderControlStateSchema.parse(state);
    await this.pool.query(
      "INSERT INTO athena_coder_controls(owner_id,record) VALUES($1,$2) ON CONFLICT(owner_id) DO UPDATE SET record=EXCLUDED.record",
      [parsed.ownerId, parsed],
    );
  }
}
