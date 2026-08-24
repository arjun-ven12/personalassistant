import {
  AgentConfigurationRecordSchema,
  AgentManifestRecordSchema,
  AgentOsHealthRecordSchema,
  AgentOsMetricsRecordSchema,
  AgentPackageRecordSchema,
  AgentSessionRecordSchema,
  AgentVersionRecordSchema,
  ContextPackageRecordSchema,
  KnowledgeSourceRecordSchema,
  PermissionProfileRecordSchema,
  RuntimeEventRecordSchema,
  ToolRegistryRecordSchema,
  type AgentConfigurationRecord,
  type AgentManifestRecord,
  type AgentOsHealthRecord,
  type AgentOsMetricsRecord,
  type AgentPackageRecord,
  type AgentSessionRecord,
  type AgentVersionRecord,
  type ContextPackageRecord,
  type KnowledgeSourceRecord,
  type PermissionProfileRecord,
  type RuntimeEventRecord,
  type ToolRegistryRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { AgentOsStore } from "./os-store.js";

const list = async <T>(
  pool: Pool,
  schema: { parse: (value: unknown) => T },
  table: string,
  ownerId: string,
  order: string,
  limit?: number,
) => {
  const values: unknown[] = [ownerId];
  const sqlLimit = limit ? ` LIMIT $2` : "";
  if (limit) values.push(limit);
  const result = await pool.query<{ record: unknown }>(
    `SELECT record FROM ${table} WHERE owner_id=$1 ORDER BY ${order} DESC${sqlLimit}`,
    values,
  );
  return result.rows.map((row) => schema.parse(row.record));
};

export class PostgresAgentOsStore implements AgentOsStore {
  constructor(readonly pool: Pool) {}

  async saveManifest(manifest: AgentManifestRecord) {
    const parsed = AgentManifestRecordSchema.parse(manifest);
    await this.pool.query(
      `INSERT INTO agent_manifests(id,owner_id,agent_type,status,version,created_at,updated_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (owner_id,id) DO UPDATE
       SET status=$4,version=$5,updated_at=$7,record=$8`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentType,
        parsed.status,
        parsed.version,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  async findManifest(ownerId: string, agentId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agent_manifests WHERE owner_id=$1 AND id=$2",
      [ownerId, agentId],
    );
    return result.rows[0]
      ? AgentManifestRecordSchema.parse(result.rows[0].record)
      : undefined;
  }

  listManifests(ownerId: string) {
    return list(
      this.pool,
      AgentManifestRecordSchema,
      "agent_manifests",
      ownerId,
      "updated_at",
    );
  }

  async savePackage(pkg: AgentPackageRecord) {
    const parsed = AgentPackageRecordSchema.parse(pkg);
    await this.pool.query(
      `INSERT INTO agent_packages(id,owner_id,agent_id,package_version,integrity_hash,created_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.packageVersion,
        parsed.integrityHash,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  listPackages(ownerId: string, limit: number) {
    return list(
      this.pool,
      AgentPackageRecordSchema,
      "agent_packages",
      ownerId,
      "created_at",
      limit,
    );
  }

  async saveSession(session: AgentSessionRecord) {
    const parsed = AgentSessionRecordSchema.parse(session);
    await this.pool.query(
      `INSERT INTO agent_os_sessions(id,owner_id,agent_id,workflow_id,status,started_at,ended_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET status=$5,ended_at=$7,record=$8`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.workflowId,
        parsed.status,
        parsed.startedAt,
        parsed.endedAt,
        parsed,
      ],
    );
  }

  async findSession(ownerId: string, sessionId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM agent_os_sessions WHERE owner_id=$1 AND id=$2",
      [ownerId, sessionId],
    );
    return result.rows[0]
      ? AgentSessionRecordSchema.parse(result.rows[0].record)
      : undefined;
  }

  listSessions(ownerId: string, limit: number) {
    return list(
      this.pool,
      AgentSessionRecordSchema,
      "agent_os_sessions",
      ownerId,
      "started_at",
      limit,
    );
  }

  async saveEvent(event: RuntimeEventRecord) {
    const parsed = RuntimeEventRecordSchema.parse(event);
    await this.pool.query(
      `INSERT INTO agent_runtime_events(id,owner_id,agent_id,session_id,workflow_id,event_type,created_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.sessionId,
        parsed.workflowId,
        parsed.eventType,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  listEvents(ownerId: string, limit: number) {
    return list(
      this.pool,
      RuntimeEventRecordSchema,
      "agent_runtime_events",
      ownerId,
      "created_at",
      limit,
    );
  }

  async saveConfiguration(configuration: AgentConfigurationRecord) {
    const parsed = AgentConfigurationRecordSchema.parse(configuration);
    await this.pool.query(
      `INSERT INTO agent_configurations(id,owner_id,agent_id,created_at,updated_at,record)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET updated_at=$5,record=$6`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  listConfigurations(ownerId: string, limit: number) {
    return list(
      this.pool,
      AgentConfigurationRecordSchema,
      "agent_configurations",
      ownerId,
      "updated_at",
      limit,
    );
  }

  async saveTool(tool: ToolRegistryRecord) {
    const parsed = ToolRegistryRecordSchema.parse(tool);
    await this.pool.query(
      `INSERT INTO agent_os_tool_registry(id,owner_id,execution_policy,availability,version,created_at,updated_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (owner_id,id) DO UPDATE
       SET execution_policy=$3,availability=$4,version=$5,updated_at=$7,record=$8`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.executionPolicy,
        parsed.availability,
        parsed.version,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  listTools(ownerId: string) {
    return list(
      this.pool,
      ToolRegistryRecordSchema,
      "agent_os_tool_registry",
      ownerId,
      "updated_at",
    );
  }

  async savePermissionProfile(profile: PermissionProfileRecord) {
    const parsed = PermissionProfileRecordSchema.parse(profile);
    await this.pool.query(
      `INSERT INTO agent_os_permission_profiles(id,owner_id,deployment_permissions,created_at,updated_at,record)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (owner_id,id) DO UPDATE SET updated_at=$5,record=$6`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.deploymentPermissions,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  listPermissionProfiles(ownerId: string) {
    return list(
      this.pool,
      PermissionProfileRecordSchema,
      "agent_os_permission_profiles",
      ownerId,
      "updated_at",
    );
  }

  async saveKnowledgeSource(source: KnowledgeSourceRecord) {
    const parsed = KnowledgeSourceRecordSchema.parse(source);
    await this.pool.query(
      `INSERT INTO agent_os_knowledge_sources(id,owner_id,source_type,mount_policy,version,created_at,updated_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (owner_id,id) DO UPDATE SET mount_policy=$4,version=$5,updated_at=$7,record=$8`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.sourceType,
        parsed.mountPolicy,
        parsed.version,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  listKnowledgeSources(ownerId: string) {
    return list(
      this.pool,
      KnowledgeSourceRecordSchema,
      "agent_os_knowledge_sources",
      ownerId,
      "updated_at",
    );
  }

  async saveVersion(version: AgentVersionRecord) {
    const parsed = AgentVersionRecordSchema.parse(version);
    await this.pool.query(
      `INSERT INTO agent_os_versions(id,owner_id,agent_id,version,change_type,created_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.version,
        parsed.changeType,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  listVersions(ownerId: string, limit: number) {
    return list(
      this.pool,
      AgentVersionRecordSchema,
      "agent_os_versions",
      ownerId,
      "created_at",
      limit,
    );
  }

  async saveHealth(health: AgentOsHealthRecord) {
    const parsed = AgentOsHealthRecordSchema.parse(health);
    await this.pool.query(
      `INSERT INTO agent_os_health(owner_id,agent_id,availability,checked_at,record)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (owner_id,agent_id) DO UPDATE SET availability=$3,checked_at=$4,record=$5`,
      [parsed.ownerId, parsed.agentId, parsed.availability, parsed.checkedAt, parsed],
    );
  }

  listHealth(ownerId: string) {
    return list(
      this.pool,
      AgentOsHealthRecordSchema,
      "agent_os_health",
      ownerId,
      "checked_at",
    );
  }

  async saveMetrics(metrics: AgentOsMetricsRecord) {
    const parsed = AgentOsMetricsRecordSchema.parse(metrics);
    await this.pool.query(
      `INSERT INTO agent_os_metrics(owner_id,agent_id,recorded_at,record)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (owner_id,agent_id) DO UPDATE SET recorded_at=$3,record=$4`,
      [parsed.ownerId, parsed.agentId, parsed.recordedAt, parsed],
    );
  }

  listMetrics(ownerId: string) {
    return list(
      this.pool,
      AgentOsMetricsRecordSchema,
      "agent_os_metrics",
      ownerId,
      "recorded_at",
    );
  }

  async saveContextPackage(context: ContextPackageRecord) {
    const parsed = ContextPackageRecordSchema.parse(context);
    await this.pool.query(
      `INSERT INTO agent_os_context_packages(id,owner_id,agent_id,workflow_id,created_at,record)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.workflowId,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  listContextPackages(ownerId: string, limit: number) {
    return list(
      this.pool,
      ContextPackageRecordSchema,
      "agent_os_context_packages",
      ownerId,
      "created_at",
      limit,
    );
  }
}
