import {
  CapabilityCandidateSchema,
  CapabilityRequestSchema,
  CapabilityStudioEventSchema,
  type CapabilityCandidate,
  type CapabilityRequest,
  type CapabilityStudioEvent,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { CapabilityStudioStore } from "./store.js";

type Artifact = CapabilityCandidate | CapabilityStudioEvent | CapabilityRequest;

export class PostgresCapabilityStudioStore implements CapabilityStudioStore {
  constructor(readonly pool: Pool) {}

  private async save(kind: "CANDIDATE" | "EVENT" | "REQUEST", record: Artifact) {
    const updatedAt = "updatedAt" in record ? record.updatedAt : record.createdAt;
    await this.pool.query(
      `INSERT INTO capability_studio_artifacts(id,owner_id,kind,updated_at,record)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(owner_id,id) DO UPDATE SET kind=EXCLUDED.kind,updated_at=EXCLUDED.updated_at,record=EXCLUDED.record`,
      [record.id, record.ownerId, kind, updatedAt, record],
    );
  }

  private async list<T>(
    ownerId: string,
    kind: "CANDIDATE" | "EVENT" | "REQUEST",
    limit: number,
    schema: { parse(value: unknown): T },
  ) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM capability_studio_artifacts WHERE owner_id=$1 AND kind=$2 ORDER BY updated_at DESC LIMIT $3",
      [ownerId, kind, limit],
    );
    return result.rows.map((row) => schema.parse(row.record));
  }

  saveCandidate(record: CapabilityCandidate) {
    return this.save("CANDIDATE", CapabilityCandidateSchema.parse(record));
  }

  async getCandidate(ownerId: string, id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM capability_studio_artifacts WHERE owner_id=$1 AND id=$2 AND kind='CANDIDATE'",
      [ownerId, id],
    );
    return result.rows[0] ? CapabilityCandidateSchema.parse(result.rows[0].record) : null;
  }

  listCandidates(ownerId: string, limit: number) {
    return this.list(ownerId, "CANDIDATE", limit, CapabilityCandidateSchema);
  }

  saveEvent(record: CapabilityStudioEvent) {
    return this.save("EVENT", CapabilityStudioEventSchema.parse(record));
  }

  listEvents(ownerId: string, limit: number) {
    return this.list(ownerId, "EVENT", limit, CapabilityStudioEventSchema);
  }

  saveRequest(record: CapabilityRequest) {
    return this.save("REQUEST", CapabilityRequestSchema.parse(record));
  }

  listRequests(ownerId: string, limit: number) {
    return this.list(ownerId, "REQUEST", limit, CapabilityRequestSchema);
  }
}
