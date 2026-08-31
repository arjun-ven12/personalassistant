import { WorkforceEventSchema, type WorkforceEvent } from "@alexa-control/shared";
import type { Pool } from "pg";
import type { AgentWorkforceStore } from "./store.js";
import { companyScope } from "../companies/scope.js";

export class PostgresAgentWorkforceStore implements AgentWorkforceStore {
  constructor(readonly pool: Pool) {}
  async saveEvent(event: WorkforceEvent) {
    const parsed = WorkforceEventSchema.parse(event);
    await this.pool.query(
      `INSERT INTO agent_workforce_events(id,owner_id,agent_id,event_type,created_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [parsed.id, parsed.ownerId, parsed.agentId, parsed.type, parsed.createdAt, parsed, companyScope.companyId(parsed.ownerId)??null],
    );
  }
  async listEvents(ownerId: string, agentId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agent_workforce_events WHERE owner_id=$1 AND agent_id=$2 AND ($4::uuid IS NULL OR company_id=$4) ORDER BY created_at DESC LIMIT $3",
      [ownerId, agentId, limit, companyScope.companyId(ownerId)??null],
    );
    return result.rows.map((row) => WorkforceEventSchema.parse(row.record));
  }
}
