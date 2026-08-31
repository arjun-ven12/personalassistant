import {
  AgentMemoryRecordSchema,
  EngineeringDecisionRecordSchema,
  KnowledgeEdgeSchema,
  KnowledgeNodeSchema,
  LearningEventRecordSchema,
  MemoryRecordSchema,
  MemorySuggestionRecordSchema,
  MemoryTimelineEventSchema,
  RepositoryMemoryRecordSchema,
  type AgentMemoryRecord,
  type EngineeringDecisionRecord,
  type KnowledgeEdge,
  type KnowledgeNode,
  type LearningEventRecord,
  type MemoryRecord,
  type MemorySearchQuery,
  type MemorySuggestionRecord,
  type MemoryTimelineEvent,
  type RepositoryMemoryRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { MemoryStore } from "./store.js";
import { companyScope } from "../companies/scope.js";

const like = (value: string) =>
  `%${value.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

export class PostgresMemoryStore implements MemoryStore {
  constructor(readonly pool: Pool) {}

  async saveMemory(memory: MemoryRecord) {
    const parsed = MemoryRecordSchema.parse(memory);
    await this.pool.query(
      `INSERT INTO memories(
        id,owner_id,company_id,repository_id,agent_id,workflow_id,memory_type,source,importance,confidence,created_at,updated_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE
       SET repository_id=$4,agent_id=$5,workflow_id=$6,memory_type=$7,source=$8,
           importance=$9,confidence=$10,updated_at=$12,record=$13
       WHERE memories.owner_id=EXCLUDED.owner_id AND memories.company_id=EXCLUDED.company_id`,
      [
        parsed.id,
        parsed.ownerId,
        companyScope.companyId(parsed.ownerId) ?? null,
        parsed.repositoryId,
        parsed.agentId,
        parsed.workflowId,
        parsed.memoryType,
        parsed.source,
        parsed.importance,
        parsed.confidence,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  async findMemory(ownerId: string, memoryId: string) {
    const companyId = companyScope.companyId(ownerId);
    const result = await this.pool.query<{ record: unknown }>(
      companyId ? "SELECT record FROM memories WHERE owner_id=$1 AND company_id=$2 AND id=$3" : "SELECT record FROM memories WHERE owner_id=$1 AND id=$2",
      companyId ? [ownerId, companyId, memoryId] : [ownerId, memoryId],
    );
    return result.rows[0] ? MemoryRecordSchema.parse(result.rows[0].record) : undefined;
  }

  async listMemories(ownerId: string, limit: number) {
    const companyId = companyScope.companyId(ownerId);
    const result = await this.pool.query<{ record: unknown }>(
      companyId ? "SELECT record FROM memories WHERE owner_id=$1 AND company_id=$2 ORDER BY updated_at DESC LIMIT $3" : "SELECT record FROM memories WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT $2",
      companyId ? [ownerId, companyId, limit] : [ownerId, limit],
    );
    return result.rows.map((row) => MemoryRecordSchema.parse(row.record));
  }

  async searchMemories(ownerId: string, query: MemorySearchQuery) {
    const clauses = ["owner_id=$1"];
    const values: unknown[] = [ownerId];
    const companyId = companyScope.companyId(ownerId);
    if (companyId) { values.push(companyId); clauses.push(`company_id=$${values.length}`); }
    if (query.type) {
      values.push(query.type);
      clauses.push(`memory_type=$${values.length}`);
    }
    if (query.repositoryId) {
      values.push(query.repositoryId);
      clauses.push(`repository_id=$${values.length}`);
    }
    if (query.agentId) {
      values.push(query.agentId);
      clauses.push(`agent_id=$${values.length}`);
    }
    if (query.q) {
      values.push(like(query.q));
      clauses.push(
        `(record->>'title' ILIKE $${values.length} ESCAPE '\\' OR record->>'summary' ILIKE $${values.length} ESCAPE '\\' OR record->>'content' ILIKE $${values.length} ESCAPE '\\')`,
      );
    }
    values.push(query.limit);
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM memories
       WHERE ${clauses.join(" AND ")}
       ORDER BY (importance * confidence) DESC, updated_at DESC
       LIMIT $${values.length}`,
      values,
    );
    return result.rows.map((row) => MemoryRecordSchema.parse(row.record));
  }

  async saveKnowledgeNode(node: KnowledgeNode) {
    const parsed = KnowledgeNodeSchema.parse(node);
    await this.pool.query(
      `INSERT INTO knowledge_nodes(id,owner_id,kind,label,ref_id,confidence,created_at,updated_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE
       SET label=$4,ref_id=$5,confidence=$6,updated_at=$8,record=$9`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.kind,
        parsed.label,
        parsed.refId,
        parsed.confidence,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listKnowledgeNodes(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM knowledge_nodes WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY updated_at DESC LIMIT $2",
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => KnowledgeNodeSchema.parse(row.record));
  }

  async saveKnowledgeEdge(edge: KnowledgeEdge) {
    const parsed = KnowledgeEdgeSchema.parse(edge);
    await this.pool.query(
      `INSERT INTO knowledge_edges(id,owner_id,source_node_id,target_node_id,relation,confidence,created_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.sourceNodeId,
        parsed.targetNodeId,
        parsed.relation,
        parsed.confidence,
        parsed.createdAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listKnowledgeEdges(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM knowledge_edges WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY created_at DESC LIMIT $2",
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => KnowledgeEdgeSchema.parse(row.record));
  }

  async saveDecision(decision: EngineeringDecisionRecord) {
    const parsed = EngineeringDecisionRecordSchema.parse(decision);
    await this.pool.query(
      `INSERT INTO engineering_decisions(id,owner_id,repository_id,workflow_id,status,created_at,updated_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET status=$5,updated_at=$7,record=$8`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.repositoryId,
        parsed.workflowId,
        parsed.status,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listDecisions(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_decisions WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY created_at DESC LIMIT $2",
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => EngineeringDecisionRecordSchema.parse(row.record));
  }

  async saveRepositoryMemory(memory: RepositoryMemoryRecord) {
    const parsed = RepositoryMemoryRecordSchema.parse(memory);
    await this.pool.query(
      `INSERT INTO repository_memory(owner_id,repository_id,last_consolidated_at,confidence,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (owner_id,repository_id) DO UPDATE
       SET last_consolidated_at=$3,confidence=$4,record=$5`,
      [
        parsed.ownerId,
        parsed.repositoryId,
        parsed.lastConsolidatedAt,
        parsed.confidence,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async getRepositoryMemory(ownerId: string, repositoryId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM repository_memory WHERE owner_id=$1 AND repository_id=$2 AND ($3::uuid IS NULL OR company_id=$3)",
      [ownerId, repositoryId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows[0]
      ? RepositoryMemoryRecordSchema.parse(result.rows[0].record)
      : undefined;
  }

  async saveAgentMemory(memory: AgentMemoryRecord) {
    const parsed = AgentMemoryRecordSchema.parse(memory);
    await this.pool.query(
      `INSERT INTO agent_memory(owner_id,agent_id,last_updated_at,success_rate,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (owner_id,agent_id) DO UPDATE
       SET last_updated_at=$3,success_rate=$4,record=$5`,
      [
        parsed.ownerId,
        parsed.agentId,
        parsed.lastUpdatedAt,
        parsed.successRate,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async getAgentMemory(ownerId: string, agentId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agent_memory WHERE owner_id=$1 AND agent_id=$2 AND ($3::uuid IS NULL OR company_id=$3)",
      [ownerId, agentId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows[0]
      ? AgentMemoryRecordSchema.parse(result.rows[0].record)
      : undefined;
  }

  async saveLearningEvent(event: LearningEventRecord) {
    const parsed = LearningEventRecordSchema.parse(event);
    await this.pool.query(
      `INSERT INTO learning_events(id,owner_id,repository_id,agent_id,workflow_id,kind,created_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.repositoryId,
        parsed.agentId,
        parsed.workflowId,
        parsed.kind,
        parsed.createdAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listLearningEvents(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM learning_events WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY created_at DESC LIMIT $2",
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => LearningEventRecordSchema.parse(row.record));
  }

  async saveSuggestion(suggestion: MemorySuggestionRecord) {
    const parsed = MemorySuggestionRecordSchema.parse(suggestion);
    await this.pool.query(
      `INSERT INTO memory_suggestions(id,owner_id,repository_id,status,risk_level,confidence,created_at,updated_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET status=$4,updated_at=$8,record=$9`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.repositoryId,
        parsed.status,
        parsed.riskLevel,
        parsed.confidence,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listSuggestions(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM memory_suggestions WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY created_at DESC LIMIT $2",
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => MemorySuggestionRecordSchema.parse(row.record));
  }

  async saveTimelineEvent(event: MemoryTimelineEvent) {
    const parsed = MemoryTimelineEventSchema.parse(event);
    await this.pool.query(
      `INSERT INTO memory_timeline(id,owner_id,occurred_at,event_type,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [parsed.id, parsed.ownerId, parsed.occurredAt, parsed.eventType, parsed, companyScope.companyId(parsed.ownerId) ?? null],
    );
  }

  async listTimeline(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM memory_timeline WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY occurred_at DESC LIMIT $2",
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => MemoryTimelineEventSchema.parse(row.record));
  }
}
