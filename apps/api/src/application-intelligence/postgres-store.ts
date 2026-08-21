import {
  ApplicationDomainRecordSchema,
  ApplicationMemoryRecordSchema,
  ApplicationProviderCapabilityRecordSchema,
  ApplicationSessionRecordSchema,
  CrossApplicationWorkflowRecordSchema,
  ProviderSelectionRecordSchema,
  SemanticApplicationCapabilityRecordSchema,
  SemanticObjectRecordSchema,
  type ApplicationDomainRecord,
  type ApplicationMemoryRecord,
  type ApplicationProviderCapabilityRecord,
  type ApplicationSessionRecord,
  type CrossApplicationWorkflowRecord,
  type ProviderSelectionRecord,
  type SemanticApplicationCapabilityRecord,
  type SemanticObjectRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { ApplicationIntelligenceStore } from "./store.js";

const list = async <T>(
  pool: Pool,
  table: string,
  ownerId: string,
  order: string,
  limit: number,
  schema: { parse: (value: unknown) => T },
) => {
  const result = await pool.query<{ record: unknown }>(
    `SELECT record FROM ${table} WHERE owner_id=$1 ORDER BY ${order} DESC LIMIT $2`,
    [ownerId, limit],
  );
  return result.rows.map((row) => schema.parse(row.record));
};

const insertRecord = async (
  pool: Pool,
  table: string,
  record: { id: string; ownerId: string },
  columns: Record<string, string | number | boolean | null>,
) => {
  const names = ["id", "owner_id", ...Object.keys(columns), "record"];
  const values = [record.id, record.ownerId, ...Object.values(columns), record];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
  const updates = [...Object.keys(columns), "record"]
    .map((name) => `${name}=EXCLUDED.${name}`)
    .join(",");
  await pool.query(
    `INSERT INTO ${table}(${names.join(",")}) VALUES (${placeholders})
     ON CONFLICT (owner_id, id) DO UPDATE SET ${updates}`,
    values,
  );
};

export class PostgresApplicationIntelligenceStore
  implements ApplicationIntelligenceStore
{
  constructor(readonly pool: Pool) {}

  async saveDomain(record: ApplicationDomainRecord) {
    const parsed = ApplicationDomainRecordSchema.parse(record);
    await insertRecord(this.pool, "application_domains", parsed, {
      domain: parsed.domain,
      updated_at: parsed.updatedAt,
    });
  }
  listDomains(ownerId: string, limit: number) {
    return list(
      this.pool,
      "application_domains",
      ownerId,
      "updated_at",
      limit,
      ApplicationDomainRecordSchema,
    );
  }
  async saveCapability(record: SemanticApplicationCapabilityRecord) {
    const parsed = SemanticApplicationCapabilityRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_application_capabilities", parsed, {
      capability_id: parsed.capabilityId,
      domain: parsed.domain,
      updated_at: parsed.updatedAt,
    });
  }
  listCapabilities(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_application_capabilities",
      ownerId,
      "updated_at",
      limit,
      SemanticApplicationCapabilityRecordSchema,
    );
  }
  async saveProviderCapability(record: ApplicationProviderCapabilityRecord) {
    const parsed = ApplicationProviderCapabilityRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_provider_capabilities", parsed, {
      application_id: parsed.applicationId,
      provider_id: parsed.providerId,
      capability_id: parsed.capabilityId,
      domain: parsed.domain,
      updated_at: parsed.updatedAt,
    });
  }
  listProviderCapabilities(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_provider_capabilities",
      ownerId,
      "updated_at",
      limit,
      ApplicationProviderCapabilityRecordSchema,
    );
  }
  async saveSession(record: ApplicationSessionRecord) {
    const parsed = ApplicationSessionRecordSchema.parse(record);
    await insertRecord(this.pool, "application_sessions", parsed, {
      application_id: parsed.applicationId,
      provider_id: parsed.providerId,
      domain: parsed.domain,
      status: parsed.status,
      updated_at: parsed.updatedAt,
    });
  }
  listSessions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "application_sessions",
      ownerId,
      "updated_at",
      limit,
      ApplicationSessionRecordSchema,
    );
  }
  async saveMemory(record: ApplicationMemoryRecord) {
    const parsed = ApplicationMemoryRecordSchema.parse(record);
    await insertRecord(this.pool, "application_memory", parsed, {
      application_id: parsed.applicationId,
      provider_id: parsed.providerId,
      domain: parsed.domain,
      updated_at: parsed.updatedAt,
    });
  }
  listMemory(ownerId: string, limit: number) {
    return list(
      this.pool,
      "application_memory",
      ownerId,
      "updated_at",
      limit,
      ApplicationMemoryRecordSchema,
    );
  }
  async saveSelection(record: ProviderSelectionRecord) {
    const parsed = ProviderSelectionRecordSchema.parse(record);
    await insertRecord(this.pool, "provider_selection_history", parsed, {
      capability_id: parsed.capabilityId,
      domain: parsed.domain,
      selected_application_id: parsed.selectedApplicationId,
      selected_provider_id: parsed.selectedProviderId,
      created_at: parsed.createdAt,
    });
  }
  listSelections(ownerId: string, limit: number) {
    return list(
      this.pool,
      "provider_selection_history",
      ownerId,
      "created_at",
      limit,
      ProviderSelectionRecordSchema,
    );
  }
  async saveWorkflow(record: CrossApplicationWorkflowRecord) {
    const parsed = CrossApplicationWorkflowRecordSchema.parse(record);
    await insertRecord(this.pool, "cross_application_workflows", parsed, {
      status: parsed.status,
      updated_at: parsed.updatedAt,
    });
  }
  listWorkflows(ownerId: string, limit: number) {
    return list(
      this.pool,
      "cross_application_workflows",
      ownerId,
      "updated_at",
      limit,
      CrossApplicationWorkflowRecordSchema,
    );
  }
  async saveSemanticObject(record: SemanticObjectRecord) {
    const parsed = SemanticObjectRecordSchema.parse(record);
    await insertRecord(this.pool, "application_semantic_objects", parsed, {
      object_type: parsed.objectType,
      application_id: parsed.applicationId,
      provider_id: parsed.providerId,
      updated_at: parsed.updatedAt,
    });
  }
  listSemanticObjects(ownerId: string, limit: number) {
    return list(
      this.pool,
      "application_semantic_objects",
      ownerId,
      "updated_at",
      limit,
      SemanticObjectRecordSchema,
    );
  }
}
