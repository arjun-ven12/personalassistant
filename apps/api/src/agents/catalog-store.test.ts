import { AgentRecordSchema } from "@alexa-control/shared";
import { describe, expect, it } from "vitest";

import { companyScope } from "../companies/scope.js";
import { assignmentFromAgent } from "./catalog-model.js";
import { InMemoryAgentStore } from "./store.js";

const ownerId = "11111111-1111-4111-8111-111111111111";
const atlasId = "22222222-2222-4222-8222-222222222222";
const novaId = "33333333-3333-4333-8333-333333333333";
const organizationId = "44444444-4444-4444-8444-444444444444";
const departmentId = "55555555-5555-4555-8555-555555555555";
const at = "2026-09-01T00:00:00.000Z";

const agent = (id = "b2b_lead_specialist", name = "B2B Lead Specialist") =>
  AgentRecordSchema.parse({
    schemaVersion: "1",
    id,
    ownerId,
    role: "planning",
    displayName: name,
    version: "7.0.0",
    status: "available",
    capabilities: ["web.search", "crm.read"],
    supportedTasks: ["lead.research", "qualification"],
    configuration: { runtimeMode: "LAZY_SHARED_AI" },
    createdAt: at,
    updatedAt: at,
    healthSummary: "Reusable lead research specialist.",
    workforce: {
      organizationId,
      departmentId,
      parentAgentId: null,
      managerAgentId: null,
      specialization: "B2B lead generation",
      description: "Researches and qualifies business prospects.",
      skills: ["prospect-research", "qualification"],
      memoryScopeId: `agent:${id}`,
      departmentMemoryScopeId: `department:${departmentId}`,
      organizationMemoryScopeId: `organization:${organizationId}`,
      capabilityProfileId: `profile:${id}`,
      missingCapabilities: [],
      modelPolicyId: "BALANCED",
      activationPolicyId: "lazy_owner_or_task_activation_v1",
      executionPlacement: "REMOTE_ALLOWED",
      evaluationProfile: ["verified_outcome"],
      source: "ALEXA_NATIVE",
      sourcePath: null,
      sourceVersion: "25.3.0",
      license: null,
      importedAt: at,
    },
  });

describe("reusable agent catalog storage", () => {
  it("keeps one definition with independent Atlas and Nova assignments", () => {
    const store = new InMemoryAgentStore();
    const reusable = agent();
    companyScope.run(
      { ownerId, companyId: atlasId, role: "OWNER", requestId: "atlas" },
      () => store.upsertAgent(reusable),
    );
    store.saveAssignment(assignmentFromAgent(reusable, novaId));

    expect(store.listDefinitions(ownerId)).toHaveLength(1);
    expect(store.countDefinitionAssignments(ownerId, reusable.id)).toBe(2);

    const atlas = companyScope.run(
      { ownerId, companyId: atlasId, role: "OWNER", requestId: "atlas-read" },
      () => store.findAgent(ownerId, reusable.id),
    );
    const nova = companyScope.run(
      { ownerId, companyId: novaId, role: "OWNER", requestId: "nova-read" },
      () => store.findAgent(ownerId, reusable.id),
    );
    expect(atlas?.id).toBe(nova?.id);
    expect(atlas?.workforce?.memoryScopeId).toContain(atlasId);
    expect(nova?.workforce?.memoryScopeId).toContain(novaId);
    expect(atlas?.workforce?.memoryScopeId).not.toBe(nova?.workforce?.memoryScopeId);
  });

  it("deduplicates retries per company and rejects a duplicate canonical definition", () => {
    const store = new InMemoryAgentStore();
    const reusable = agent();
    companyScope.run(
      { ownerId, companyId: atlasId, role: "OWNER", requestId: "atlas" },
      () => {
        store.upsertAgent(reusable);
        store.upsertAgent(reusable);
      },
    );
    expect(store.listAssignments(ownerId, atlasId)).toHaveLength(1);
    expect(() =>
      store.upsertDefinition({
        ...store.listDefinitions(ownerId)[0]!,
        id: "duplicate_lead_specialist",
      }),
    ).toThrow("semantically equivalent");
  });

  it("handles 119 definitions and 2,000 dormant assignments without runtime resources", () => {
    const store = new InMemoryAgentStore();
    const definitions = Array.from({ length: 119 }, (_, index) =>
      agent(`specialist_${index}`, `Specialist ${index}`),
    );
    for (const definition of definitions) {
      companyScope.run(
        { ownerId, companyId: atlasId, role: "OWNER", requestId: "seed" },
        () => store.upsertAgent(definition),
      );
    }
    const companies = Array.from(
      { length: 100 },
      (_, index) =>
        `${String(index + 10).padStart(8, "0")}-0000-4000-8000-000000000000`,
    );
    for (const companyId of companies) {
      for (const definition of definitions.slice(0, 20)) {
        store.saveAssignment(assignmentFromAgent(definition, companyId));
      }
    }
    expect(store.listDefinitions(ownerId)).toHaveLength(119);
    expect(
      companies.reduce(
        (sum, companyId) => sum + store.listAssignments(ownerId, companyId).length,
        0,
      ),
    ).toBe(2_000);
    expect(
      store
        .listAssignments(ownerId, companies.at(0) ?? atlasId)
        .every((item) => item.status === "DORMANT"),
    ).toBe(true);
  });
});
