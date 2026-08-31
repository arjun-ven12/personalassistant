import {
  AgentEconomyAccountSchema,
  AgentRecordSchema,
  DepartmentRecordSchema,
  OrganizationRecordSchema,
  WorkforceAgentDetailSchema,
  WorkforceGraphResponseSchema,
  WorkforceImportReportSchema,
  WorkforceSearchQuerySchema,
  type AgentRecord,
  type AgentRole,
  type DepartmentRecord,
} from "@alexa-control/shared";
import { createHash } from "node:crypto";

import type { AgentEconomyService } from "../agent-economy/service.js";
import type { AgentSocietyService } from "../agent-society/service.js";
import type { AgentRegistryService } from "../agents/service.js";
import type { AgentStore } from "../agents/store.js";
import { ExecutionError } from "../execution/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { ALEXA_NATIVE_WORKFORCE, ECC_AGENT_SEEDS, ECC_COMMIT, ECC_LICENSE, EXTERNAL_CLASSIFICATION, type WorkforceSeed } from "./catalog.js";
import type { AgentWorkforceStore } from "./store.js";

const uuidFrom = (value: string) => {
  const hash = createHash("sha256").update(value).digest("hex");
  const variant = ((Number.parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(18, 20)}-${hash.slice(20, 32)}`;
};

const departments = [
  ["Executive", "Strategy, governance visibility, and bounded organizational coordination."],
  ["Development", "Architecture, implementation, platform, and engineering delivery."],
  ["Product", "Product planning, design research, and product analytics."],
  ["Research", "Evidence gathering, technical research, and competitive intelligence."],
  ["Sales", "Account research, proposals, and sales operations."],
  ["Marketing", "Content, growth, brand, and market communication."],
  ["Operations", "Operational processes, incidents, vendors, and infrastructure coordination."],
  ["Finance", "Planning, forecasting, and internal economic analysis without financial execution."],
  ["Customer Success", "Onboarding, support intelligence, and customer retention."],
  ["Quality & Review", "Independent testing, review, accessibility, and acceptance verification."],
  ["Security", "Security and privacy review without approval authority."],
] as const;

const leadFor: Record<string, string> = {
  Executive: "native_executive_lead", Development: "native_development_lead", Product: "native_product_lead",
  Research: "native_research_lead", Sales: "native_sales_lead", Marketing: "native_marketing_lead",
  Operations: "native_operations_lead", Finance: "native_finance_lead", "Customer Success": "native_customer_success_lead",
  "Quality & Review": "native_quality_lead", Security: "native_security_lead",
};

const capabilityByRole: Record<AgentRole, string[]> = {
  engineering_manager: ["goal.analysis", "delegation", "progress.reporting"],
  planning: ["repository.analysis", "architecture.analysis", "risk.assessment"],
  coding: ["patch.proposal", "refactor.suggestion", "test.draft"],
  review: ["architecture.review", "maintainability.review", "style.review"],
  security: ["threat.model", "secrets.review", "permission.review"],
  testing: ["test.plan", "validation.profile.selection", "failure.analysis"],
  documentation: ["readme.draft", "api.docs", "migration.guide"],
  release: ["release.plan", "changelog.summary", "rollback.plan"],
};
const businessCapabilitiesByDepartment:Record<string,string[]>={
  Research:["analytics.read_metric","crm.search_leads","crm.read_lead"],
  Sales:["crm.search_leads","crm.read_lead","crm.create_lead","crm.update_stage","crm.add_note","email.create_draft","email.send_draft"],
  Marketing:["analytics.read_metric","email.create_draft"],
  "Customer Success":["crm.read_lead","crm.update_stage","crm.add_note","email.create_draft","email.send_draft"],
  Development:["github.read_issue","github.create_issue","github.read_pull_request"],
  Product:["analytics.read_metric","github.read_issue"],
  Executive:["analytics.read_metric","crm.read_lead"],
};

const taskByRole: Record<AgentRole, string[]> = {
  engineering_manager: ["project.breakdown", "executive.report"], planning: ["implementation.plan", "dependency.analysis"],
  coding: ["implementation.draft", "patch.generate"], review: ["code.review", "consistency.review"],
  security: ["security.review", "auth.analysis"], testing: ["test.generate", "coverage.review"],
  documentation: ["docs.update", "developer.guide"], release: ["release.prepare", "deployment.readiness"],
};

const modelPolicyFor = (role: AgentRole) => role === "security" ? "SECURITY_REVIEW" as const
  : role === "review" || role === "planning" ? "STRONG_REASONING" as const
    : role === "engineering_manager" ? "BALANCED" as const
      : role === "coding" ? "LOCAL_FIRST" as const : "CHEAP_ROUTINE" as const;

export class AgentWorkforceService {
  constructor(
    readonly workforceStore: AgentWorkforceStore,
    readonly agents: AgentRegistryService,
    readonly agentStore: AgentStore,
    readonly society: AgentSocietyService,
    readonly economy: AgentEconomyService,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async preview(ownerId: string) {
    const current = await this.agentStore.listAgents(ownerId);
    const candidateIds = new Set([...ECC_AGENT_SEEDS, ...ALEXA_NATIVE_WORKFORCE].map((seed) => seed.id));
    const additions = [...candidateIds].filter((id) => !current.some((agent) => agent.id === id)).length;
    return WorkforceImportReportSchema.parse({
      sourceDefinitionsScanned: EXTERNAL_CLASSIFICATION.scanned,
      importedAsAgents: EXTERNAL_CLASSIFICATION.importedAgents,
      alexaNativeAgentsAdded: ALEXA_NATIVE_WORKFORCE.length,
      finalActualRegisteredAgents: current.length + additions,
      convertedToSkills: EXTERNAL_CLASSIFICATION.convertedToSkills,
      convertedToWorkflows: EXTERNAL_CLASSIFICATION.convertedToWorkflows,
      convertedToReviewers: EXTERNAL_CLASSIFICATION.convertedToReviewers,
      duplicatesRejected: EXTERNAL_CLASSIFICATION.duplicatesRejected,
      activeDuringIdle: 0,
      dormantDuringIdle: current.filter((agent) => candidateIds.has(agent.id)).length + additions,
      sourceCommit: ECC_COMMIT,
      sourceLicense: ECC_LICENSE,
      externalRuntimeActive: false,
      providerCallsDuringImport: 0,
      runtimeActivationsDuringImport: 0,
    });
  }

  async bootstrap(ownerId: string, requestId: string, ipAddress: string) {
    await this.agents.ensureBuiltIns(ownerId, requestId);
    const organization = await this.ensureOrganization(ownerId);
    const departmentByName = await this.ensureDepartments(ownerId, organization.id);
    const existingBefore = new Set((await this.agentStore.listAgents(ownerId)).map((agent) => agent.id));
    const at = this.now().toISOString();
    for (const seed of [...ALEXA_NATIVE_WORKFORCE, ...ECC_AGENT_SEEDS])
      await this.registerSeed(ownerId, organization.id, departmentByName, seed, existingBefore, at);
    await this.decorateBuiltIns(ownerId, organization.id, departmentByName, at);
    const registered = await this.agentStore.listAgents(ownerId);
    this.validateHierarchy(registered);
    await this.audit({ eventType: "AGENT_WORKFORCE_BOOTSTRAPPED", ownerId, ipAddress, outcome: "SUCCESS", reason: "Owner-scoped dormant workforce metadata bootstrapped without model or worker activation.", requestId, metadata: { registeredAgents: registered.length, importedAgents: ECC_AGENT_SEEDS.length, providerCalls: 0, runtimeActivations: 0 } });
    return this.preview(ownerId);
  }

  async graph(ownerId: string, rawQuery: unknown) {
    const query = WorkforceSearchQuerySchema.parse(rawQuery);
    const [society, allAgents, economyDashboard, preview] = await Promise.all([
      this.society.dashboard(ownerId), this.agentStore.listAgents(ownerId), this.economy.dashboard(ownerId), this.preview(ownerId),
    ]);
    const organization = society.organizations[0] ?? null;
    const departmentById = new Map(society.departments.map((department) => [department.id, department]));
    const accountByAgent = new Map(economyDashboard.accounts.map((account) => [account.agentId, account]));
    const filtered = allAgents.filter((agent) => {
      const metadata = agent.workforce;
      if (!metadata) return !query.q || `${agent.id} ${agent.displayName} ${agent.role}`.toLowerCase().includes(query.q.toLowerCase());
      const account = accountByAgent.get(agent.id);
      const status = account?.economyStatus === "ACTIVE" ? "ACTIVE" : account?.economyStatus === "SUSPENDED" ? "SUSPENDED" : "DORMANT";
      return (!query.q || `${agent.id} ${agent.displayName} ${agent.role} ${metadata.specialization} ${metadata.skills.join(" ")} ${departmentById.get(metadata.departmentId)?.name ?? ""}`.toLowerCase().includes(query.q.toLowerCase()))
        && (!query.departmentId || metadata.departmentId === query.departmentId)
        && (!query.status || status === query.status)
        && (!query.source || metadata.source === query.source);
    }).slice(0, query.limit);
    const visibleAgentIds = new Set(filtered.map((agent) => agent.id));
    const visibleDepartmentIds = new Set(filtered.map((agent) => agent.workforce?.departmentId).filter((id): id is string => Boolean(id)));
    const nodes = [
      ...(organization ? [{ id: "alexa_governor", kind: "GOVERNOR" as const, label: "Alexa Governor", subtitle: organization.name, parentId: null, departmentId: null, status: "ACTIVE" as const, reputation: null, credits: null, source: "ALEXA_NATIVE" as const, childCount: visibleDepartmentIds.size }] : []),
      ...society.departments.filter((department) => visibleDepartmentIds.has(department.id)).map((department) => ({ id: `department:${department.id}`, kind: "DEPARTMENT" as const, label: department.name, subtitle: department.responsibility, parentId: "alexa_governor", departmentId: department.id, status: "ACTIVE" as const, reputation: null, credits: null, source: "ALEXA_NATIVE" as const, childCount: filtered.filter((agent) => agent.workforce?.departmentId === department.id).length })),
      ...filtered.map((agent) => {
        const metadata = agent.workforce;
        const account = accountByAgent.get(agent.id);
        return { id: agent.id, kind: "AGENT" as const, label: agent.displayName, subtitle: metadata?.specialization ?? agent.role, parentId: metadata?.parentAgentId && visibleAgentIds.has(metadata.parentAgentId) ? metadata.parentAgentId : metadata ? `department:${metadata.departmentId}` : "alexa_governor", departmentId: metadata?.departmentId ?? null, status: account?.economyStatus === "ACTIVE" ? "ACTIVE" as const : account?.economyStatus === "SUSPENDED" ? "SUSPENDED" as const : agent.status === "unhealthy" ? "FAILED" as const : "DORMANT" as const, reputation: account?.reputation ?? null, credits: account?.availableCredits ?? null, source: metadata?.source ?? "ALEXA_NATIVE" as const, childCount: allAgents.filter((candidate) => candidate.workforce?.parentAgentId === agent.id).length };
      }),
    ];
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = nodes.filter((node) => node.parentId && nodeIds.has(node.parentId)).map((node) => ({ id: `${node.parentId}->${node.id}`, source: node.parentId!, target: node.id, type: "REPORTS_TO" as const }));
    const reputations = economyDashboard.accounts.map((account) => account.reputation);
    return WorkforceGraphResponseSchema.parse({ organization, departments: society.departments.filter((department) => visibleDepartmentIds.has(department.id)), nodes, edges, summary: { registered: allAgents.length, active: economyDashboard.overview.activeAgents, dormant: economyDashboard.overview.dormantAgents, suspended: economyDashboard.overview.suspendedAgents, departments: society.departments.length, memoryScopes: new Set(allAgents.map((agent) => agent.workforce?.memoryScopeId).filter(Boolean)).size, capabilityProfiles: new Set(allAgents.map((agent) => agent.workforce?.capabilityProfileId).filter(Boolean)).size, aggregateCredits: economyDashboard.overview.availableCredits, averageReputation: reputations.length ? reputations.reduce((sum, value) => sum + value, 0) / reputations.length : 0 }, bootstrapAvailable: allAgents.length < 100, importPreview: preview, runtime: { modelInstancesFromRegistration: 0, workerProcessesFromRegistration: 0, providerCallsFromRegistration: 0, sharedAIRouter: true } });
  }

  async detail(ownerId: string, agentId: string) {
    const agent = await this.agentStore.findAgent(ownerId, agentId);
    if (!agent) throw new ExecutionError(404, "AGENT_NOT_FOUND", "Agent not found.");
    const [society, allAgents, economyDashboard, tasks, events] = await Promise.all([
      this.society.dashboard(ownerId), this.agentStore.listAgents(ownerId), this.economy.dashboard(ownerId), this.agentStore.listTasks(ownerId, 500), this.workforceStore.listEvents(ownerId, agentId, 100),
    ]);
    const metadata = agent.workforce;
    const economy = economyDashboard.accounts.find((account) => account.agentId === agentId) ?? null;
    const performance = economyDashboard.performance.find((record) => record.agentId === agentId) ?? null;
    return WorkforceAgentDetailSchema.parse({ agent, department: society.departments.find((department) => department.id === metadata?.departmentId) ?? null, manager: metadata?.managerAgentId ? await this.agentStore.findAgent(ownerId, metadata.managerAgentId) ?? null : null, children: allAgents.filter((candidate) => candidate.workforce?.parentAgentId === agentId), economy, performance, tasks: tasks.filter((task) => task.agentId === agentId).slice(0, 100), events, recentLedger: economyDashboard.ledger.filter((entry) => entry.agentId === agentId).slice(0, 100).map(({ id, type, amount, reasonCode, createdAt }) => ({ id, type, amount, reasonCode, createdAt })), memoryAccess: { privateScope: metadata?.memoryScopeId ?? `agent:${agent.id}`, departmentScope: metadata?.departmentMemoryScopeId ?? "none", organizationScope: metadata?.organizationMemoryScopeId ?? "none", ownerPrivateIncluded: false }, authority: { hierarchyGrantsPermissions: false, creditsGrantAuthority: false, capabilitiesExplicitOnly: true } });
  }

  async setActivation(ownerId: string, agentId: string, state: "ACTIVE" | "DORMANT", requestId: string, ipAddress: string) {
    const agent = await this.agentStore.findAgent(ownerId, agentId);
    if (!agent?.workforce) throw new ExecutionError(404, "WORKFORCE_AGENT_NOT_FOUND", "Workforce agent not found.");
    await this.economy.setStatus(ownerId, agentId, state, requestId, ipAddress);
    const at = this.now().toISOString();
    await this.agentStore.upsertAgent(AgentRecordSchema.parse({ ...agent, status: state === "ACTIVE" ? "busy" : "available", updatedAt: at }));
    await this.workforceStore.saveEvent({ id: crypto.randomUUID(), ownerId, agentId, type: state === "ACTIVE" ? "ACTIVATED" : "DORMANT", summary: state === "ACTIVE" ? "Owner requested bounded lazy activation; no dedicated model instance was created." : "Agent returned to dormant metadata-only participation.", referenceId: null, createdAt: at });
    await this.audit({ eventType: "AGENT_WORKFORCE_ACTIVATION_CHANGED", ownerId, ipAddress, outcome: "SUCCESS", reason: `Workforce participation changed to ${state}.`, requestId, metadata: { agentId, state, dedicatedModelCreated: false, dedicatedWorkerCreated: false } });
    return this.detail(ownerId, agentId);
  }

  async enrollGeneratedSpecialist(agent: AgentRecord) {
    if (!agent.workforce) throw new ExecutionError(409, "WORKFORCE_METADATA_REQUIRED", "Generated specialists require bounded workforce metadata.");
    await this.ensureEconomy(agent);
  }

  validateHierarchy(agents: AgentRecord[]) {
    const byId = new Map(agents.map((agent) => [agent.id, agent]));
    for (const agent of agents) {
      const seen = new Set([agent.id]);
      let parentId = agent.workforce?.parentAgentId ?? null;
      while (parentId) {
        if (seen.has(parentId)) throw new ExecutionError(409, "WORKFORCE_HIERARCHY_CYCLE", "Agent hierarchy contains a cycle.");
        seen.add(parentId);
        parentId = byId.get(parentId)?.workforce?.parentAgentId ?? null;
      }
    }
  }

  private async ensureOrganization(ownerId: string) {
    const dashboard = await this.society.dashboard(ownerId);
    const existing = dashboard.organizations[0];
    if (!existing) throw new ExecutionError(500, "ORGANIZATION_MISSING", "Agent Society organization missing.");
    const updated = OrganizationRecordSchema.parse({ ...existing, name: "Alexa Workforce", mission: "Coordinate a governed, resource-aware artificial organization under owner authority.", governorAgentId: "alexa_governor", updatedAt: this.now().toISOString() });
    await this.society.store.saveOrganization(updated);
    return updated;
  }

  private async ensureDepartments(ownerId: string, organizationId: string) {
    const existing = await this.society.store.listDepartments(ownerId);
    const byName = new Map(existing.map((department) => [department.name, department]));
    const at = this.now().toISOString();
    for (const [name, responsibility] of departments) {
      if (byName.has(name)) continue;
      const department = DepartmentRecordSchema.parse({ id: uuidFrom(`workforce:${ownerId}:department:${name}`), ownerId, organizationId, name, responsibility, parentDepartmentId: null, leadAgentId: leadFor[name] ?? null, status: "active", createdAt: at, updatedAt: at });
      await this.society.store.saveDepartment(department);
      byName.set(name, department);
    }
    return byName;
  }

  private async registerSeed(ownerId: string, organizationId: string, departmentByName: Map<string, DepartmentRecord>, seed: WorkforceSeed, existingBefore: Set<string>, at: string) {
    const department = departmentByName.get(seed.department);
    if (!department) throw new ExecutionError(500, "DEPARTMENT_MISSING", `Department ${seed.department} missing.`);
    const manager = leadFor[seed.department] ?? null;
    const isLead = manager === seed.id;
    const agent = AgentRecordSchema.parse({ schemaVersion: "1", id: seed.id, ownerId, role: seed.role, displayName: seed.displayName, version: "1.0.0", status: "available", capabilities: [...capabilityByRole[seed.role],...(businessCapabilitiesByDepartment[seed.department]??[])], supportedTasks: taskByRole[seed.role], configuration: { runtimeMode: "LAZY_SHARED_AI", externalToolDeclarationsImported: false, authorityInheritedFromManager: false }, createdAt: existingBefore.has(seed.id) ? (await this.agentStore.findAgent(ownerId, seed.id))?.createdAt ?? at : at, updatedAt: at, healthSummary: "Registered dormant workforce definition; shared AIRouter context loads only for assigned work.", workforce: { organizationId, departmentId: department.id, parentAgentId: isLead ? null : manager, managerAgentId: isLead ? null : manager, specialization: seed.specialization, description: seed.description, skills: seed.skills.length ? seed.skills : ["domain-analysis"], memoryScopeId: `agent:${seed.id}`, departmentMemoryScopeId: `department:${department.id}`, organizationMemoryScopeId: `organization:${organizationId}`, capabilityProfileId: `profile:${seed.role}:${seed.department.toLowerCase().replaceAll(" ", "_")}`, missingCapabilities: [], modelPolicyId: modelPolicyFor(seed.role), activationPolicyId: "lazy_owner_or_task_activation_v1", executionPlacement: seed.role === "security" ? "LOCAL_ONLY" : "REMOTE_ALLOWED", evaluationProfile: ["verified_outcome", "quality", "cost_efficiency", "policy_compliance"], source: seed.source, sourcePath: seed.sourcePath, sourceVersion: seed.source === "EVERYTHING_CLAUDE_CODE" ? ECC_COMMIT : "23.2.0", license: seed.source === "EVERYTHING_CLAUDE_CODE" ? ECC_LICENSE : null, importedAt: at } });
    await this.agentStore.upsertAgent(agent);
    await this.agentStore.saveHealth({ ownerId, agentId: agent.id, state: "healthy", checkedAt: at, activeTaskCount: 0, messageBacklog: 0, reasonCode: "DORMANT_READY" });
    await this.agentStore.saveMetrics({ ownerId, agentId: agent.id, assignedTaskCount: 0, completedTaskCount: 0, failedTaskCount: 0, messageCount: 0, consensusVoteCount: 0, lastActivityAt: null });
    await this.ensureEconomy(agent);
    if (!existingBefore.has(agent.id)) await this.workforceStore.saveEvent({ id: crypto.randomUUID(), ownerId, agentId: agent.id, type: "REGISTERED", summary: `${agent.displayName} registered as dormant organizational metadata.`, referenceId: seed.sourcePath, createdAt: at });
  }

  private async decorateBuiltIns(ownerId: string, organizationId: string, departmentByName: Map<string, DepartmentRecord>, at: string) {
    for (const agent of await this.agentStore.listAgents(ownerId)) {
      if (agent.workforce) continue;
      const departmentName = agent.role === "security" ? "Security" : agent.role === "testing" || agent.role === "review" ? "Quality & Review" : agent.role === "planning" ? "Executive" : "Development";
      const department = departmentByName.get(departmentName)!;
      const updated = AgentRecordSchema.parse({ ...agent, configuration: { ...agent.configuration, runtimeMode: "LAZY_SHARED_AI", externalToolDeclarationsImported: false, authorityInheritedFromManager: false }, updatedAt: at, workforce: { organizationId, departmentId: department.id, parentAgentId: leadFor[departmentName] ?? null, managerAgentId: leadFor[departmentName] ?? null, specialization: agent.displayName, description: agent.healthSummary, skills: agent.supportedTasks, memoryScopeId: `agent:${agent.id}`, departmentMemoryScopeId: `department:${department.id}`, organizationMemoryScopeId: `organization:${organizationId}`, capabilityProfileId: `profile:${agent.role}`, missingCapabilities: [], modelPolicyId: modelPolicyFor(agent.role), activationPolicyId: "lazy_owner_or_task_activation_v1", executionPlacement: agent.role === "security" ? "LOCAL_ONLY" : "REMOTE_ALLOWED", evaluationProfile: ["verified_outcome", "quality", "policy_compliance"], source: "ALEXA_NATIVE", sourcePath: null, sourceVersion: "built-in", license: null, importedAt: at } });
      await this.agentStore.upsertAgent(updated);
      await this.ensureEconomy(updated);
    }
  }

  private async ensureEconomy(agent: AgentRecord) {
    const metadata = agent.workforce!;
    const enrollment = {
      organizationId: metadata.organizationId,
      departmentId: metadata.departmentId,
      ...(metadata.parentAgentId ? { parentAgentId: metadata.parentAgentId } : {}),
      memoryScopeId: metadata.memoryScopeId,
      capabilityProfileId: metadata.capabilityProfileId,
      modelPolicyId: metadata.modelPolicyId,
      activationPolicyId: metadata.activationPolicyId,
    };
    const account = await this.economy.enroll(
      agent.ownerId,
      agent.id,
      enrollment,
      `workforce-enroll:${agent.id}`,
      "system",
    );
    await this.economy.store.updateAccount(AgentEconomyAccountSchema.parse({
      ...account,
      economyStatus: account.economyStatus === "ACTIVE" ? "ACTIVE" : "DORMANT",
      organizationId: metadata.organizationId,
      departmentId: metadata.departmentId,
      parentAgentId: metadata.parentAgentId,
      memoryScopeId: metadata.memoryScopeId,
      capabilityProfileId: metadata.capabilityProfileId,
      modelPolicyId: metadata.modelPolicyId,
      activationPolicyId: metadata.activationPolicyId,
      updatedAt: this.now().toISOString(),
    }));
  }
}
