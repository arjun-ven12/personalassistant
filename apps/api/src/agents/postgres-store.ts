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
  AgentDefinitionSchema,
  CompanyAgentAssignmentSchema,
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
  type AgentDefinition,
  type CompanyAgentAssignment,
  type TeamCompositionRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { AgentStore } from "./store.js";
import { companyScope } from "../companies/scope.js";
import {
  assignmentFromAgent,
  definitionFromAgent,
  resolvedAgent,
} from "./catalog-model.js";

export class PostgresAgentStore implements AgentStore {
  constructor(readonly pool: Pool) {}

  async upsertDefinition(definition: AgentDefinition) {
    const parsed = AgentDefinitionSchema.parse(definition);
    const compatibility = AgentRecordSchema.parse({
      schemaVersion: "1",
      id: parsed.id,
      ownerId: parsed.ownerId,
      role: parsed.role,
      displayName: parsed.name,
      version: parsed.version,
      status: parsed.status === "RETIRED" ? "disabled" : "available",
      capabilities: parsed.capabilityRequirements,
      supportedTasks: parsed.supportedTasks,
      configuration: { runtimeMode: "LAZY_SHARED_AI" },
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
      healthSummary:
        "Reusable catalog definition; runtime activates only through a company assignment.",
    });
    await this.pool.query(
      `INSERT INTO agents(
         id,owner_id,role,status,version,created_at,updated_at,record,company_id,
         canonical_key,definition_record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,$10)
       ON CONFLICT (owner_id,id) DO UPDATE SET
         role=EXCLUDED.role,status=EXCLUDED.status,version=EXCLUDED.version,
         updated_at=EXCLUDED.updated_at,canonical_key=EXCLUDED.canonical_key,
         definition_record=EXCLUDED.definition_record`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.role,
        compatibility.status,
        parsed.version,
        parsed.createdAt,
        parsed.updatedAt,
        compatibility,
        parsed.canonicalKey,
        parsed,
      ],
    );
  }

  async findDefinition(ownerId: string, definitionId: string) {
    const result = await this.pool.query<{ definition_record: unknown }>(
      "SELECT definition_record FROM agents WHERE owner_id=$1 AND id=$2",
      [ownerId, definitionId],
    );
    return result.rows[0]
      ? AgentDefinitionSchema.parse(result.rows[0].definition_record)
      : undefined;
  }

  async listDefinitions(ownerId: string) {
    const result = await this.pool.query<{ definition_record: unknown }>(
      "SELECT definition_record FROM agents WHERE owner_id=$1 ORDER BY canonical_key,id",
      [ownerId],
    );
    return result.rows.map((row) => AgentDefinitionSchema.parse(row.definition_record));
  }

  async saveAssignment(assignment: CompanyAgentAssignment) {
    const parsed = CompanyAgentAssignmentSchema.parse(assignment);
    await this.pool.query(
      `INSERT INTO company_agent_assignments(
         id,owner_id,company_id,agent_definition_id,status,department_id,
         manager_assignment_id,is_governor,created_at,updated_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (owner_id,company_id,agent_definition_id) DO UPDATE SET
         status=EXCLUDED.status,department_id=EXCLUDED.department_id,
         manager_assignment_id=EXCLUDED.manager_assignment_id,
         is_governor=EXCLUDED.is_governor,updated_at=EXCLUDED.updated_at,
         record=EXCLUDED.record`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.companyId,
        parsed.agentDefinitionId,
        parsed.status,
        parsed.departmentId,
        parsed.managerAssignmentId,
        parsed.isGovernor,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  async findAssignment(ownerId: string, definitionId: string, companyId?: string) {
    const selectedCompanyId = companyId ?? companyScope.companyId(ownerId) ?? null;
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM company_agent_assignments
       WHERE owner_id=$1 AND agent_definition_id=$2
         AND company_id=COALESCE($3::uuid,(SELECT default_company_id FROM owners WHERE id=$1))`,
      [ownerId, definitionId, selectedCompanyId],
    );
    return result.rows[0]
      ? CompanyAgentAssignmentSchema.parse(result.rows[0].record)
      : undefined;
  }

  async listAssignments(ownerId: string, companyId?: string) {
    const selectedCompanyId = companyId ?? companyScope.companyId(ownerId) ?? null;
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM company_agent_assignments
       WHERE owner_id=$1
         AND company_id=COALESCE($2::uuid,(SELECT default_company_id FROM owners WHERE id=$1))
       ORDER BY agent_definition_id`,
      [ownerId, selectedCompanyId],
    );
    return result.rows.map((row) => CompanyAgentAssignmentSchema.parse(row.record));
  }

  async countDefinitionAssignments(ownerId: string, definitionId: string) {
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM company_agent_assignments
       WHERE owner_id=$1 AND agent_definition_id=$2 AND status<>'REVOKED'`,
      [ownerId, definitionId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async upsertAgent(agent: AgentRecord) {
    const parsed = AgentRecordSchema.parse(agent);
    const companyId =
      companyScope.companyId(parsed.ownerId) ??
      (await this.defaultCompanyId(parsed.ownerId));
    if (!companyId)
      throw new Error("Company context is required for an agent assignment.");
    await this.upsertDefinition(definitionFromAgent(parsed));
    await this.saveAssignment(assignmentFromAgent(parsed, companyId));
  }

  async findAgent(ownerId: string, agentId: string) {
    const [definition, assignment] = await Promise.all([
      this.findDefinition(ownerId, agentId),
      this.findAssignment(ownerId, agentId),
    ]);
    if (!definition || !assignment || assignment.status === "REVOKED") return undefined;
    return resolvedAgent(definition, assignment);
  }

  async listAgents(ownerId: string) {
    const assignments = await this.listAssignments(ownerId);
    const definitions = new Map(
      (await this.listDefinitions(ownerId)).map((definition) => [
        definition.id,
        definition,
      ]),
    );
    return assignments
      .filter((assignment) => assignment.status !== "REVOKED")
      .map((assignment) => {
        const definition = definitions.get(assignment.agentDefinitionId);
        return definition ? resolvedAgent(definition, assignment) : null;
      })
      .filter((agent): agent is AgentRecord => Boolean(agent));
  }

  private async defaultCompanyId(ownerId: string) {
    const result = await this.pool.query<{ default_company_id: string | null }>(
      "SELECT default_company_id FROM owners WHERE id=$1",
      [ownerId],
    );
    return result.rows[0]?.default_company_id ?? null;
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
      [
        parsed.ownerId,
        parsed.agentId,
        parsed.state,
        parsed.checkedAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
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
      [
        parsed.ownerId,
        parsed.agentId,
        parsed.lastActivityAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
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
