import { PatchRecordSchema, type PatchRecord } from "@alexa-control/shared";
import type { Pool } from "pg";

import type { PatchStore } from "./store.js";

const parsePatch = (row: { record: unknown }) => PatchRecordSchema.parse(row.record);

export class PostgresPatchStore implements PatchStore {
  constructor(readonly pool: Pool) {}

  async create(patch: PatchRecord) {
    const parsed = PatchRecordSchema.parse(patch);
    await this.pool.query(
      `INSERT INTO patches(
        id,owner_id,repository_id,workspace_id,status,patch_digest,
        created_at,updated_at,record
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.repositoryId,
        parsed.workspaceId,
        parsed.status,
        parsed.patchDigest,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
    return parsed;
  }

  async find(id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM patches WHERE id=$1",
      [id],
    );
    return result.rows[0] ? parsePatch(result.rows[0]) : undefined;
  }

  async list(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM patches WHERE owner_id=$1 ORDER BY created_at DESC LIMIT $2",
      [ownerId, limit],
    );
    return result.rows.map(parsePatch);
  }

  async update(patch: PatchRecord) {
    const parsed = PatchRecordSchema.parse(patch);
    await this.pool.query(
      `UPDATE patches SET status=$2,updated_at=$3,record=$4 WHERE id=$1 AND owner_id=$5`,
      [parsed.id, parsed.status, parsed.updatedAt, parsed, parsed.ownerId],
    );
  }
}
