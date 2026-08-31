import {
  AgentConsensusRecordSchema,
  AgentConflictRecordSchema,
  AgentContextRecordSchema,
  AgentHealthRecordSchema,
  AgentMessageRecordSchema,
  AgentMetricsRecordSchema,
  AgentLifecycleEventRecordSchema,
  AgentPromotionCandidateRecordSchema,
  AgentRecordSchema,
  AgentTemplateRecordSchema,
  AgentTaskRecordSchema,
  CapabilityRecordSchema,
  DynamicAgentPerformanceRecordSchema,
  DynamicAgentRecordSchema,
  TeamCompositionRecordSchema,
  type AgentConsensusRecord,
  type AgentConflictRecord,
  type AgentContextRecord,
  type AgentHealthRecord,
  type AgentLifecycleEventRecord,
  type AgentMessageRecord,
  type AgentMetricsRecord,
  type AgentPromotionCandidateRecord,
  type AgentRecord,
  type AgentTemplateRecord,
  type AgentTaskRecord,
  type CapabilityRecord,
  type DynamicAgentPerformanceRecord,
  type DynamicAgentRecord,
  type TeamCompositionRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { AgentStore } from "./store.js";
import { companyScope } from "../companies/scope.js";

export class PostgresAgentStore implements AgentStore {
  constructor(readonly pool: Pool) {}

  async upsertAgent(agent: AgentRecord) {
    const parsed = AgentRecordSchema.parse(agent);
    const result = await this.pool.query(
      `INSERT INTO agents(id,owner_id,role,status,version,created_at,updated_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (owner_id,id) DO UPDATE
       SET status=$4,version=$5,updated_at=$7,record=$8
       WHERE agents.company_id=EXCLUDED.company_id`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.role,
        parsed.status,
        parsed.version,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
    if (result.rowCount !== 1) {
      throw new Error("Agent belongs to another company.");
    }
  }

  async findAgent(ownerId: string, agentId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agents WHERE owner_id=$1 AND id=$2 AND ($3::uuid IS NULL OR company_id=$3)",
      [ownerId, agentId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows[0] ? AgentRecordSchema.parse(result.rows[0].record) : undefined;
  }

  async listAgents(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agents WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY role ASC",
      [ownerId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => AgentRecordSchema.parse(row.record));
  }

  async saveTask(task: AgentTaskRecord) {
    const parsed = AgentTaskRecordSchema.parse(task);
    await this.pool.query(
      `INSERT INTO agent_tasks(id,owner_id,agent_id,workflow_id,status,priority,assigned_at,updated_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE
       SET status=$5,updated_at=$8,record=$9`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.workflowId,
        parsed.status,
        parsed.priority,
        parsed.assignedAt,
        parsed.updatedAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listTasks(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agent_tasks WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY assigned_at DESC LIMIT $2",
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => AgentTaskRecordSchema.parse(row.record));
  }

  async findTask(ownerId: string, taskId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agent_tasks WHERE owner_id=$1 AND id=$2 AND ($3::uuid IS NULL OR company_id=$3)",
      [ownerId, taskId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows[0]
      ? AgentTaskRecordSchema.parse(result.rows[0].record)
      : undefined;
  }

  async saveMessage(message: AgentMessageRecord) {
    const parsed = AgentMessageRecordSchema.parse(message);
    await this.pool.query(
      `INSERT INTO agent_messages(
        id,owner_id,sender_agent_id,recipient_agent_id,conversation_id,workflow_id,task_id,message_type,priority,created_at,record,company_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.senderAgentId,
        parsed.recipientAgentId,
        parsed.conversationId,
        parsed.workflowId,
        parsed.taskId,
        parsed.messageType,
        parsed.priority,
        parsed.createdAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listMessages(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agent_messages WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY created_at DESC LIMIT $2",
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => AgentMessageRecordSchema.parse(row.record));
  }

  async saveContext(context: AgentContextRecord) {
    const parsed = AgentContextRecordSchema.parse(context);
    await this.pool.query(
      `INSERT INTO agent_context(id,owner_id,context_type,version,created_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.contextType,
        parsed.version,
        parsed.createdAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listContexts(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agent_context WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY created_at DESC LIMIT $2",
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => AgentContextRecordSchema.parse(row.record));
  }

  async saveConsensus(consensus: AgentConsensusRecord) {
    const parsed = AgentConsensusRecordSchema.parse(consensus);
    await this.pool.query(
      `INSERT INTO agent_consensus(id,owner_id,workflow_id,task_id,status,created_at,updated_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET status=$5,updated_at=$7,record=$8`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.workflowId,
        parsed.taskId,
        parsed.status,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listConsensus(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agent_consensus WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY created_at DESC LIMIT $2",
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => AgentConsensusRecordSchema.parse(row.record));
  }

  async saveConflict(conflict: AgentConflictRecord) {
    const parsed = AgentConflictRecordSchema.parse(conflict);
    await this.pool.query(
      `INSERT INTO agent_conflicts(id,owner_id,workflow_id,task_id,status,created_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET status=$5,record=$7`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.workflowId,
        parsed.taskId,
        parsed.status,
        parsed.createdAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listConflicts(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agent_conflicts WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY created_at DESC LIMIT $2",
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => AgentConflictRecordSchema.parse(row.record));
  }

  async saveHealth(health: AgentHealthRecord) {
    const parsed = AgentHealthRecordSchema.parse(health);
    await this.pool.query(
      `INSERT INTO agent_health(owner_id,agent_id,state,checked_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (owner_id,agent_id) DO UPDATE SET state=$3,checked_at=$4,record=$5`,
      [parsed.ownerId, parsed.agentId, parsed.state, parsed.checkedAt, parsed, companyScope.companyId(parsed.ownerId) ?? null],
    );
  }

  async listHealth(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT h.record FROM agent_health h
       JOIN agents a ON a.owner_id=h.owner_id AND a.id=h.agent_id
       WHERE h.owner_id=$1 AND ($2::uuid IS NULL OR h.company_id=$2) ORDER BY a.role ASC`,
      [ownerId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => AgentHealthRecordSchema.parse(row.record));
  }

  async saveMetrics(metrics: AgentMetricsRecord) {
    const parsed = AgentMetricsRecordSchema.parse(metrics);
    await this.pool.query(
      `INSERT INTO agent_metrics(owner_id,agent_id,last_activity_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (owner_id,agent_id) DO UPDATE SET last_activity_at=$3,record=$4`,
      [parsed.ownerId, parsed.agentId, parsed.lastActivityAt, parsed, companyScope.companyId(parsed.ownerId) ?? null],
    );
  }

  async listMetrics(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT m.record FROM agent_metrics m
       JOIN agents a ON a.owner_id=m.owner_id AND a.id=m.agent_id
       WHERE m.owner_id=$1 AND ($2::uuid IS NULL OR m.company_id=$2) ORDER BY a.role ASC`,
      [ownerId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => AgentMetricsRecordSchema.parse(row.record));
  }

  async saveTemplate(template: AgentTemplateRecord) {
    const parsed = AgentTemplateRecordSchema.parse(template);
    await this.pool.query(
      `INSERT INTO agent_templates(id,owner_id,version,created_at,updated_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (owner_id,id) DO UPDATE SET version=$3,updated_at=$5,record=$6`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.version,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listTemplates(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agent_templates WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY updated_at DESC",
      [ownerId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => AgentTemplateRecordSchema.parse(row.record));
  }

  async saveCapability(capability: CapabilityRecord) {
    const parsed = CapabilityRecordSchema.parse(capability);
    await this.pool.query(
      `INSERT INTO capability_registry(id,owner_id,name,version,confidence,created_at,updated_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (owner_id,id) DO UPDATE
       SET name=$3,version=$4,confidence=$5,updated_at=$7,record=$8`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.name,
        parsed.version,
        parsed.confidence,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listCapabilities(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM capability_registry WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY name ASC",
      [ownerId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => CapabilityRecordSchema.parse(row.record));
  }

  async searchCapabilities(ownerId: string, query: string, limit: number) {
    const value = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM capability_registry
       WHERE owner_id=$1
       AND ($4::uuid IS NULL OR company_id=$4)
       AND (id ILIKE $2 ESCAPE '\\' OR name ILIKE $2 ESCAPE '\\' OR record->>'description' ILIKE $2 ESCAPE '\\')
       ORDER BY confidence DESC, name ASC
       LIMIT $3`,
      [ownerId, value, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => CapabilityRecordSchema.parse(row.record));
  }

  async saveDynamicAgent(agent: DynamicAgentRecord) {
    const parsed = DynamicAgentRecordSchema.parse(agent);
    await this.pool.query(
      `INSERT INTO dynamic_agents(id,owner_id,workflow_id,template_id,origin,lifecycle_status,created_at,updated_at,archived_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (owner_id,id) DO UPDATE
       SET lifecycle_status=$6,updated_at=$8,archived_at=$9,record=$10`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.workflowId,
        parsed.templateId,
        parsed.origin,
        parsed.lifecycleStatus,
        parsed.createdAt,
        parsed.updatedAt,
        parsed.archivedAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async findDynamicAgent(ownerId: string, agentId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM dynamic_agents WHERE owner_id=$1 AND id=$2 AND ($3::uuid IS NULL OR company_id=$3)",
      [ownerId, agentId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows[0]
      ? DynamicAgentRecordSchema.parse(result.rows[0].record)
      : undefined;
  }

  async listDynamicAgents(ownerId: string, includeArchived: boolean) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM dynamic_agents
       WHERE owner_id=$1 AND ($2::boolean OR lifecycle_status <> 'archived')
       AND ($3::uuid IS NULL OR company_id=$3)
       ORDER BY updated_at DESC`,
      [ownerId, includeArchived, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => DynamicAgentRecordSchema.parse(row.record));
  }

  async saveLifecycleEvent(event: AgentLifecycleEventRecord) {
    const parsed = AgentLifecycleEventRecordSchema.parse(event);
    await this.pool.query(
      `INSERT INTO agent_lifecycle(id,owner_id,agent_id,workflow_id,status,created_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.workflowId,
        parsed.status,
        parsed.createdAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listLifecycleEvents(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agent_lifecycle WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY created_at DESC LIMIT $2",
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => AgentLifecycleEventRecordSchema.parse(row.record));
  }

  async saveDynamicPerformance(performance: DynamicAgentPerformanceRecord) {
    const parsed = DynamicAgentPerformanceRecordSchema.parse(performance);
    await this.pool.query(
      `INSERT INTO agent_performance(id,owner_id,agent_id,workflow_id,success_rate,confidence,recorded_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.workflowId,
        parsed.successRate,
        parsed.confidence,
        parsed.recordedAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listDynamicPerformance(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agent_performance WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY recorded_at DESC LIMIT $2",
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) =>
      DynamicAgentPerformanceRecordSchema.parse(row.record),
    );
  }

  async saveTeamComposition(composition: TeamCompositionRecord) {
    const parsed = TeamCompositionRecordSchema.parse(composition);
    await this.pool.query(
      `INSERT INTO team_compositions(id,owner_id,workflow_id,risk_level,created_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.workflowId,
        parsed.riskLevel,
        parsed.createdAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listTeamCompositions(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM team_compositions WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY created_at DESC LIMIT $2",
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) => TeamCompositionRecordSchema.parse(row.record));
  }

  async savePromotionCandidate(candidate: AgentPromotionCandidateRecord) {
    const parsed = AgentPromotionCandidateRecordSchema.parse(candidate);
    await this.pool.query(
      `INSERT INTO agent_promotions(id,owner_id,agent_id,status,usage_count,success_rate,created_at,updated_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE
       SET status=$4,usage_count=$5,success_rate=$6,updated_at=$8,record=$9`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.status,
        parsed.usageCount,
        parsed.successRate,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }

  async listPromotionCandidates(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agent_promotions WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY updated_at DESC LIMIT $2",
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map((row) =>
      AgentPromotionCandidateRecordSchema.parse(row.record),
    );
  }
}
