import {
  AgentDefinitionSchema,
  AgentRecordSchema,
  CompanyAgentAssignmentSchema,
  type AgentDefinition,
  type AgentRecord,
  type CompanyAgentAssignment,
} from "@alexa-control/shared";
import { createHash } from "node:crypto";

export const canonicalAgentKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160) || "specialist";

export const stableAssignmentId = (
  ownerId: string,
  companyId: string,
  definitionId: string,
) => {
  const hash = createHash("md5")
    .update(`${ownerId}:${companyId}:${definitionId}:assignment`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

export const definitionFromAgent = (agent: AgentRecord): AgentDefinition => {
  const workforce = agent.workforce;
  return AgentDefinitionSchema.parse({
    id: agent.id,
    ownerId: agent.ownerId,
    canonicalKey: canonicalAgentKey(
      agent.displayName || workforce?.specialization || agent.id,
    ),
    name: agent.displayName,
    role: agent.role,
    description: workforce?.description ?? agent.healthSummary,
    skills: workforce?.skills ?? agent.supportedTasks,
    capabilityRequirements: agent.capabilities,
    supportedTasks: agent.supportedTasks,
    defaultModelPolicy: workforce?.modelPolicyId ?? "BALANCED",
    defaultSafetyPolicy: "deny_by_default_v1",
    defaultOperatingPolicy:
      workforce?.activationPolicyId ?? "lazy_owner_or_task_activation_v1",
    executionPlacement: workforce?.executionPlacement ?? "REMOTE_ALLOWED",
    evaluationProfile: workforce?.evaluationProfile ?? ["verified_outcome"],
    generalizedReputationPrior: 50,
    generalizedCalibrationPrior: 0.5,
    provenance:
      workforce?.source === "EVERYTHING_CLAUDE_CODE"
        ? "IMPORTED"
        : agent.id.startsWith("native_") || agent.id === "alexa_governor"
          ? "SYSTEM"
          : "ALEXA_CREATED",
    sourcePath: workforce?.sourcePath ?? null,
    sourceVersion: workforce?.sourceVersion ?? null,
    license: workforce?.license ?? null,
    version: agent.version,
    status: agent.status === "disabled" ? "RETIRED" : "ACTIVE",
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  });
};

export const assignmentFromAgent = (
  agent: AgentRecord,
  companyId: string,
): CompanyAgentAssignment => {
  const workforce = agent.workforce;
  return CompanyAgentAssignmentSchema.parse({
    id: stableAssignmentId(agent.ownerId, companyId, agent.id),
    ownerId: agent.ownerId,
    companyId,
    agentDefinitionId: agent.id,
    organizationId: workforce?.organizationId ?? companyId,
    departmentId: workforce?.departmentId ?? companyId,
    managerAssignmentId: workforce?.managerAgentId
      ? stableAssignmentId(agent.ownerId, companyId, workforce.managerAgentId)
      : null,
    managerAgentDefinitionId: workforce?.managerAgentId ?? null,
    governorAssignmentId:
      agent.id === "alexa_governor"
        ? null
        : stableAssignmentId(agent.ownerId, companyId, "alexa_governor"),
    status:
      agent.status === "busy"
        ? "ACTIVE"
        : agent.status === "paused"
          ? "PAUSED"
          : "DORMANT",
    memoryScopeId: `company:${companyId}:${workforce?.memoryScopeId ?? `agent:${agent.id}`}`,
    departmentMemoryScopeId: `company:${companyId}:${workforce?.departmentMemoryScopeId ?? `department:${companyId}`}`,
    organizationMemoryScopeId: `company:${companyId}:${workforce?.organizationMemoryScopeId ?? `organization:${companyId}`}`,
    capabilityGrantProfileId: `company:${companyId}:${workforce?.capabilityProfileId ?? `profile:${agent.id}`}`,
    economyPolicyId: `company:${companyId}:agent-economy-default`,
    modelPolicyOverride: null,
    localReputation: null,
    localCalibration: null,
    companyInstructions: null,
    isGovernor: agent.id === "alexa_governor",
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    revokedAt: null,
  });
};

export const resolvedAgent = (
  definition: AgentDefinition,
  assignment: CompanyAgentAssignment,
  template?: AgentRecord,
): AgentRecord => {
  const departmentId = assignment.departmentId ?? assignment.companyId;
  const managerAgentId = assignment.managerAgentDefinitionId;
  return AgentRecordSchema.parse({
    schemaVersion: "1",
    id: definition.id,
    ownerId: definition.ownerId,
    role: definition.role,
    displayName: definition.name,
    version: definition.version,
    status:
      assignment.status === "ACTIVE"
        ? "busy"
        : assignment.status === "PAUSED"
          ? "paused"
          : assignment.status === "REVOKED" || definition.status === "RETIRED"
            ? "disabled"
            : "available",
    capabilities: definition.capabilityRequirements,
    supportedTasks: definition.supportedTasks,
    configuration: template?.configuration ?? {
      runtimeMode: "LAZY_SHARED_AI",
      externalToolDeclarationsImported: false,
      authorityInheritedFromManager: false,
    },
    createdAt: definition.createdAt,
    updatedAt:
      assignment.updatedAt > definition.updatedAt
        ? assignment.updatedAt
        : definition.updatedAt,
    healthSummary:
      assignment.status === "REVOKED"
        ? "Company assignment revoked; reusable definition remains in the catalog."
        : "Reusable specialist assigned under company-scoped policy and lazy runtime activation.",
    workforce: {
      organizationId: assignment.organizationId,
      departmentId,
      parentAgentId: managerAgentId,
      managerAgentId,
      specialization: template?.workforce?.specialization ?? definition.name,
      description: definition.description,
      skills: definition.skills,
      memoryScopeId: assignment.memoryScopeId,
      departmentMemoryScopeId:
        assignment.departmentMemoryScopeId ??
        `company:${assignment.companyId}:department:${departmentId}`,
      organizationMemoryScopeId: assignment.organizationMemoryScopeId,
      capabilityProfileId: assignment.capabilityGrantProfileId,
      missingCapabilities: template?.workforce?.missingCapabilities ?? [],
      modelPolicyId: assignment.modelPolicyOverride ?? definition.defaultModelPolicy,
      activationPolicyId: definition.defaultOperatingPolicy,
      executionPlacement: definition.executionPlacement,
      evaluationProfile: definition.evaluationProfile,
      source:
        definition.provenance === "IMPORTED"
          ? "EVERYTHING_CLAUDE_CODE"
          : "ALEXA_NATIVE",
      sourcePath: definition.sourcePath,
      sourceVersion: definition.sourceVersion,
      license: definition.license,
      importedAt: definition.createdAt,
    },
  });
};
