import {
  AgentEconomyAccountSchema,
  AgentCatalogQuerySchema,
  AgentCatalogResponseSchema,
  AgentDefinitionSchema,
  CompanyAgentAssignmentSchema,
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
  type AgentDefinition,
} from "@alexa-control/shared";
import { createHash } from "node:crypto";

import type { AgentEconomyService } from "../agent-economy/service.js";
import type { AgentSocietyService } from "../agent-society/service.js";
import type { AgentRegistryService } from "../agents/service.js";
import type { AgentStore } from "../agents/store.js";
import { ExecutionError } from "../execution/errors.js";
import { companyScope } from "../companies/scope.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import {
  ALEXA_NATIVE_WORKFORCE,
  ECC_AGENT_SEEDS,
  ECC_COMMIT,
  ECC_LICENSE,
  EXTERNAL_CLASSIFICATION,
  type WorkforceSeed,
} from "./catalog.js";
import type { AgentWorkforceStore } from "./store.js";
import { stableAssignmentId } from "../agents/catalog-model.js";

const uuidFrom = (value: string) => {
  const hash = createHash("sha256").update(value).digest("hex");
  const variant = ((Number.parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, "0");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(18, 20)}-${hash.slice(20, 32)}`;
};

const departments = [
  [
    "Executive",
    "Strategy, governance visibility, and bounded organizational coordination.",
  ],
  ["Development", "Architecture, implementation, platform, and engineering delivery."],
  ["Product", "Product planning, design research, and product analytics."],
  ["Research", "Evidence gathering, technical research, and competitive intelligence."],
  ["Sales", "Account research, proposals, and sales operations."],
  ["Marketing", "Content, growth, brand, and market communication."],
  [
    "Operations",
    "Operational processes, incidents, vendors, and infrastructure coordination.",
  ],
  [
    "Finance",
    "Planning, forecasting, and internal economic analysis without financial execution.",
  ],
  ["Customer Success", "Onboarding, support intelligence, and customer retention."],
  [
    "Quality & Review",
    "Independent testing, review, accessibility, and acceptance verification.",
  ],
  ["Security", "Security and privacy review without approval authority."],
] as const;

const leadFor: Record<string, string> = {
  Executive: "native_executive_lead",
  Development: "native_development_lead",
  Product: "native_product_lead",
  Research: "native_research_lead",
  Sales: "native_sales_lead",
  Marketing: "native_marketing_lead",
  Operations: "native_operations_lead",
  Finance: "native_finance_lead",
  "Customer Success": "native_customer_success_lead",
  "Quality & Review": "native_quality_lead",
  Security: "native_security_lead",
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
const businessCapabilitiesByDepartment: Record<string, string[]> = {
  Research: ["analytics.read_metric", "crm.search_leads", "crm.read_lead"],
  Sales: [
    "crm.search_leads",
    "crm.read_lead",
    "crm.create_lead",
    "crm.update_stage",
    "crm.add_note",
    "email.create_draft",
    "email.send_draft",
  ],
  Marketing: ["analytics.read_metric", "email.create_draft"],
  "Customer Success": [
    "crm.read_lead",
    "crm.update_stage",
    "crm.add_note",
    "email.create_draft",
    "email.send_draft",
  ],
  Development: ["github.read_issue", "github.create_issue", "github.read_pull_request"],
  Product: ["analytics.read_metric", "github.read_issue"],
  Executive: ["analytics.read_metric", "crm.read_lead"],
};

const taskByRole: Record<AgentRole, string[]> = {
  engineering_manager: ["project.breakdown", "executive.report"],
  planning: ["implementation.plan", "dependency.analysis"],
  coding: ["implementation.draft", "patch.generate"],
  review: ["code.review", "consistency.review"],
  security: ["security.review", "auth.analysis"],
  testing: ["test.generate", "coverage.review"],
  documentation: ["docs.update", "developer.guide"],
  release: ["release.prepare", "deployment.readiness"],
};

const modelPolicyFor = (role: AgentRole) =>
  role === "security"
    ? ("SECURITY_REVIEW" as const)
    : role === "review" || role === "planning"
      ? ("STRONG_REASONING" as const)
      : role === "engineering_manager"
        ? ("BALANCED" as const)
        : role === "coding"
          ? ("LOCAL_FIRST" as const)
          : ("CHEAP_ROUTINE" as const);

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
    const current = await this.agentStore.listDefinitions(ownerId);
    const assigned = await this.agentStore.listAssignments(ownerId);
    const candidateIds = new Set(
      [...ECC_AGENT_SEEDS, ...ALEXA_NATIVE_WORKFORCE].map((seed) => seed.id),
    );
    const additions = [...candidateIds].filter(
      (id) => !current.some((agent) => agent.id === id),
    ).length;
    return WorkforceImportReportSchema.parse({
      sourceDefinitionsScanned: EXTERNAL_CLASSIFICATION.scanned,
      importedAsAgents: EXTERNAL_CLASSIFICATION.importedAgents,
      alexaNativeAgentsAdded: ALEXA_NATIVE_WORKFORCE.length,
      finalActualRegisteredAgents:
        assigned.filter((item) => item.status !== "REVOKED").length + additions,
      convertedToSkills: EXTERNAL_CLASSIFICATION.convertedToSkills,
      convertedToWorkflows: EXTERNAL_CLASSIFICATION.convertedToWorkflows,
      convertedToReviewers: EXTERNAL_CLASSIFICATION.convertedToReviewers,
      duplicatesRejected: EXTERNAL_CLASSIFICATION.duplicatesRejected,
      activeDuringIdle: 0,
      dormantDuringIdle:
        current.filter((agent) => candidateIds.has(agent.id)).length + additions,
      sourceCommit: ECC_COMMIT,
      sourceLicense: ECC_LICENSE,
      externalRuntimeActive: false,
      providerCallsDuringImport: 0,
      runtimeActivationsDuringImport: 0,
    });
  }

  async catalog(ownerId: string, rawQuery: unknown) {
    const query = AgentCatalogQuerySchema.parse(rawQuery);
    const companyId = this.requireCompanyId(ownerId);
    const [definitions, assignments] = await Promise.all([
      this.agentStore.listDefinitions(ownerId),
      this.agentStore.listAssignments(ownerId, companyId),
    ]);
    const assignmentByDefinition = new Map(
      assignments.map((assignment) => [assignment.agentDefinitionId, assignment]),
    );
    const needle = query.q.toLowerCase();
    const candidates = definitions
      .filter((definition) => {
        const assignment = assignmentByDefinition.get(definition.id);
        const state =
          definition.status === "RETIRED"
            ? "UNAVAILABLE"
            : assignment && assignment.status !== "REVOKED"
              ? "ASSIGNED"
              : "AVAILABLE";
        return (
          (!query.state || query.state === state) &&
          (!needle ||
            `${definition.name} ${definition.role} ${definition.description} ${definition.skills.join(" ")} ${definition.capabilityRequirements.join(" ")}`
              .toLowerCase()
              .includes(needle))
        );
      })
      .slice(0, query.limit);
    const items = await Promise.all(
      candidates.map(async (definition) => {
        const assignment = assignmentByDefinition.get(definition.id);
        return {
          definition,
          currentCompanyStatus:
            definition.status === "RETIRED"
              ? ("UNAVAILABLE" as const)
              : assignment && assignment.status !== "REVOKED"
                ? ("ASSIGNED" as const)
                : ("AVAILABLE" as const),
          assignment: assignment?.status === "REVOKED" ? null : (assignment ?? null),
          assignedCompanyCount: await this.agentStore.countDefinitionAssignments(
            ownerId,
            definition.id,
          ),
          effectiveCapabilities:
            assignment?.status !== "REVOKED" ? definition.capabilityRequirements : [],
          missingCapabilities: [],
        };
      }),
    );
    return AgentCatalogResponseSchema.parse({
      catalogCount: definitions.filter((definition) => definition.status === "ACTIVE")
        .length,
      assignedCount: assignments.filter((assignment) => assignment.status !== "REVOKED")
        .length,
      activeRuntimeCount: assignments.filter(
        (assignment) => assignment.status === "ACTIVE",
      ).length,
      items,
      runtime: {
        modelSessionsFromDefinitions: 0,
        workersFromAssignments: 0,
        pollingLoopsFromAssignments: 0,
        sharedAIRouter: true,
      },
    });
  }

  async assignDefinition(input: {
    ownerId: string;
    definitionId: string;
    departmentId?: string;
    companyInstructions?: string;
    requestId: string;
    ipAddress: string;
  }) {
    const companyId = this.requireCompanyId(input.ownerId);
    const definition = await this.agentStore.findDefinition(
      input.ownerId,
      input.definitionId,
    );
    if (!definition || definition.status !== "ACTIVE") {
      throw new ExecutionError(
        404,
        "AGENT_DEFINITION_UNAVAILABLE",
        "Reusable specialist is unavailable.",
      );
    }
    const existing = await this.agentStore.findAssignment(
      input.ownerId,
      definition.id,
      companyId,
    );
    if (existing && existing.status !== "REVOKED")
      return this.catalog(input.ownerId, {});
    const [organizations, companyDepartments] = await Promise.all([
      this.society.store.listOrganizations(input.ownerId),
      this.society.store.listDepartments(input.ownerId),
    ]);
    const organization = organizations[0];
    if (!organization)
      throw new ExecutionError(
        409,
        "ORGANIZATION_MISSING",
        "Company organization is unavailable.",
      );
    const department = input.departmentId
      ? companyDepartments.find((item) => item.id === input.departmentId)
      : this.departmentForDefinition(companyDepartments, definition);
    if (!department)
      throw new ExecutionError(
        409,
        "DEPARTMENT_MISSING",
        "Select a company department before assignment.",
      );
    const managerDefinitionId = department.leadAgentId ?? null;
    const at = this.now().toISOString();
    const assignment = CompanyAgentAssignmentSchema.parse({
      id: stableAssignmentId(input.ownerId, companyId, definition.id),
      ownerId: input.ownerId,
      companyId,
      agentDefinitionId: definition.id,
      organizationId: organization.id,
      departmentId: department.id,
      managerAssignmentId: managerDefinitionId
        ? stableAssignmentId(input.ownerId, companyId, managerDefinitionId)
        : null,
      managerAgentDefinitionId: managerDefinitionId,
      governorAssignmentId: stableAssignmentId(
        input.ownerId,
        companyId,
        "alexa_governor",
      ),
      status: "DORMANT",
      memoryScopeId: `company:${companyId}:agent:${definition.id}`,
      departmentMemoryScopeId: `company:${companyId}:department:${department.id}`,
      organizationMemoryScopeId: `company:${companyId}:organization:${organization.id}`,
      capabilityGrantProfileId: `company:${companyId}:profile:${definition.id}`,
      economyPolicyId: `company:${companyId}:agent-economy-default`,
      modelPolicyOverride: null,
      localReputation: null,
      localCalibration: null,
      companyInstructions: input.companyInstructions ?? null,
      isGovernor: false,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
      revokedAt: null,
    });
    await this.agentStore.saveAssignment(assignment);
    const resolved = await this.agentStore.findAgent(input.ownerId, definition.id);
    if (resolved) await this.enrollGeneratedSpecialist(resolved);
    await this.audit({
      eventType: "COMPANY_AGENT_ASSIGNMENT_CREATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Existing reusable specialist assigned to the active company.",
      requestId: input.requestId,
      metadata: {
        agentDefinitionId: definition.id,
        assignmentId: assignment.id,
        companyId,
        runtimeActivated: false,
      },
    });
    return this.catalog(input.ownerId, {});
  }

  async revokeAssignment(
    ownerId: string,
    definitionId: string,
    requestId: string,
    ipAddress: string,
  ) {
    const companyId = this.requireCompanyId(ownerId);
    const assignment = await this.agentStore.findAssignment(
      ownerId,
      definitionId,
      companyId,
    );
    if (!assignment || assignment.status === "REVOKED")
      return this.catalog(ownerId, {});
    if (assignment.isGovernor)
      throw new ExecutionError(
        409,
        "GOVERNOR_REQUIRED",
        "An active company must retain its Governor assignment.",
      );
    const at = this.now().toISOString();
    await this.agentStore.saveAssignment({
      ...assignment,
      status: "REVOKED",
      updatedAt: at,
      revokedAt: at,
    });
    await this.audit({
      eventType: "COMPANY_AGENT_ASSIGNMENT_REVOKED",
      ownerId,
      ipAddress,
      outcome: "SUCCESS",
      reason:
        "Specialist removed from the active company; reusable definition retained.",
      requestId,
      metadata: {
        agentDefinitionId: definitionId,
        assignmentId: assignment.id,
        companyId,
      },
    });
    return this.catalog(ownerId, {});
  }

  async ensureCompanyGovernor(ownerId: string, companyId: string) {
    return companyScope.run(
      { ownerId, companyId, role: "OWNER", requestId: "company-governor-bootstrap" },
      () => this.ensureCompanyGovernorInScope(ownerId, companyId),
    );
  }

  private async ensureCompanyGovernorInScope(ownerId: string, companyId: string) {
    const at = this.now().toISOString();
    const definition = AgentDefinitionSchema.parse({
      id: "alexa_governor",
      ownerId,
      canonicalKey: "alexa-company-governor",
      name: "Alexa Company Governor",
      role: "engineering_manager",
      description:
        "Coordinates company objectives and bounded workforce planning without cross-company authority.",
      skills: ["strategy", "workforce-planning", "delegation"],
      capabilityRequirements: ["goal.analysis", "delegation", "progress.reporting"],
      supportedTasks: ["objective.coordination", "workforce.planning"],
      defaultModelPolicy: "BALANCED",
      defaultSafetyPolicy: "deny_by_default_v1",
      defaultOperatingPolicy: "lazy_owner_or_task_activation_v1",
      executionPlacement: "REMOTE_ALLOWED",
      evaluationProfile: ["verified_outcome", "policy_compliance"],
      generalizedReputationPrior: 50,
      generalizedCalibrationPrior: 0.5,
      provenance: "SYSTEM",
      sourcePath: null,
      sourceVersion: "25.3.0",
      license: null,
      version: "1.0.0",
      status: "ACTIVE",
      createdAt: at,
      updatedAt: at,
    });
    await this.agentStore.upsertDefinition(definition);
    const existing = await this.agentStore.findAssignment(
      ownerId,
      definition.id,
      companyId,
    );
    if (existing && existing.status !== "REVOKED") return existing;
    let organization = (await this.society.store.listOrganizations(ownerId))[0];
    if (!organization) {
      organization = OrganizationRecordSchema.parse({
        id: uuidFrom(`company:${companyId}:organization`),
        ownerId,
        name: "Alexa Workforce",
        mission: "Coordinate governed company objectives under owner authority.",
        status: "active",
        governorAgentId: "alexa_governor",
        createdAt: at,
        updatedAt: at,
      });
      await this.society.store.saveOrganization(organization);
    }
    let executive = (await this.society.store.listDepartments(ownerId)).find(
      (department) => department.name === "Executive",
    );
    if (!executive) {
      executive = DepartmentRecordSchema.parse({
        id: uuidFrom(`company:${companyId}:department:Executive`),
        ownerId,
        organizationId: organization.id,
        name: "Executive",
        responsibility:
          "Company strategy, objective intake, and bounded workforce coordination.",
        parentDepartmentId: null,
        leadAgentId: "alexa_governor",
        status: "active",
        createdAt: at,
        updatedAt: at,
      });
      await this.society.store.saveDepartment(executive);
    }
    const assignment = CompanyAgentAssignmentSchema.parse({
      id: stableAssignmentId(ownerId, companyId, definition.id),
      ownerId,
      companyId,
      agentDefinitionId: definition.id,
      organizationId: organization.id,
      departmentId: executive.id,
      managerAssignmentId: null,
      managerAgentDefinitionId: null,
      governorAssignmentId: null,
      status: "DORMANT",
      memoryScopeId: `company:${companyId}:governor`,
      departmentMemoryScopeId: null,
      organizationMemoryScopeId: `company:${companyId}:organization`,
      capabilityGrantProfileId: `company:${companyId}:governor-capabilities`,
      economyPolicyId: `company:${companyId}:governor-economy`,
      modelPolicyOverride: null,
      localReputation: null,
      localCalibration: null,
      companyInstructions: null,
      isGovernor: true,
      createdAt: at,
      updatedAt: at,
      revokedAt: null,
    });
    await this.agentStore.saveAssignment(assignment);
    return assignment;
  }

  async assignBestCatalogMatch(input: {
    ownerId: string;
    text: string;
    requiredSkills: string[];
    requiredCapabilities: string[];
    requestId: string;
    ipAddress: string;
  }) {
    const assignedIds = new Set(
      (await this.agentStore.listAssignments(input.ownerId))
        .filter((item) => item.status !== "REVOKED")
        .map((item) => item.agentDefinitionId),
    );
    const definitions = (await this.agentStore.listDefinitions(input.ownerId)).filter(
      (item) =>
        item.status === "ACTIVE" &&
        !assignedIds.has(item.id) &&
        input.requiredCapabilities.every((required) =>
          item.capabilityRequirements.some(
            (available) =>
              available.toLowerCase().includes(required.toLowerCase()) ||
              required.toLowerCase().includes(available.toLowerCase()),
          ),
        ),
    );
    const terms = [
      ...input.requiredSkills,
      ...input.requiredCapabilities,
      ...input.text
        .toLowerCase()
        .split(/\W+/)
        .filter((item) => item.length > 3),
    ];
    const ranked = definitions
      .map((definition) => {
        const haystack =
          `${definition.name} ${definition.description} ${definition.skills.join(" ")} ${definition.capabilityRequirements.join(" ")} ${definition.supportedTasks.join(" ")}`.toLowerCase();
        const matched = terms.filter((term) =>
          haystack.includes(term.toLowerCase()),
        ).length;
        return { definition, score: terms.length ? matched / terms.length : 0 };
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.definition.id.localeCompare(right.definition.id),
      );
    const best = ranked[0];
    if (!best || best.score < 0.25) return null;
    await this.assignDefinition({
      ownerId: input.ownerId,
      definitionId: best.definition.id,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
    });
    await this.audit({
      eventType: "AGENT_CATALOG_MATCH_USED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Workforce gap reused an existing catalog specialist.",
      requestId: input.requestId,
      metadata: { agentDefinitionId: best.definition.id, score: best.score },
    });
    return best.definition;
  }

  private requireCompanyId(ownerId: string) {
    // Direct in-memory domain tests use the owner UUID as their deterministic
    // synthetic company. HTTP and PostgreSQL paths always install company scope.
    return companyScope.companyId(ownerId) ?? ownerId;
  }

  private departmentForDefinition(
    departments: DepartmentRecord[],
    definition: AgentDefinition,
  ) {
    const text =
      `${definition.name} ${definition.description} ${definition.skills.join(" ")}`.toLowerCase();
    const wanted =
      text.includes("sales") || text.includes("lead") || text.includes("outreach")
        ? "Sales"
        : text.includes("market") || text.includes("seo")
          ? "Marketing"
          : text.includes("research")
            ? "Research"
            : text.includes("security")
              ? "Security"
              : text.includes("test") ||
                  text.includes("review") ||
                  text.includes("quality")
                ? "Quality & Review"
                : text.includes("finance")
                  ? "Finance"
                  : "Development";
    return (
      departments.find((department) => department.name === wanted) ??
      departments[0] ??
      null
    );
  }

  async bootstrap(ownerId: string, requestId: string, ipAddress: string) {
    await this.ensureCompanyGovernor(ownerId, this.requireCompanyId(ownerId));
    await this.agents.ensureBuiltIns(ownerId, requestId);
    const organization = await this.ensureOrganization(ownerId);
    const departmentByName = await this.ensureDepartments(ownerId, organization.id);
    const existingBefore = new Set(
      (await this.agentStore.listAgents(ownerId)).map((agent) => agent.id),
    );
    const at = this.now().toISOString();
    for (const seed of [...ALEXA_NATIVE_WORKFORCE, ...ECC_AGENT_SEEDS])
      await this.registerSeed(
        ownerId,
        organization.id,
        departmentByName,
        seed,
        existingBefore,
        at,
      );
    await this.decorateBuiltIns(ownerId, organization.id, departmentByName, at);
    const registered = await this.agentStore.listAgents(ownerId);
    this.validateHierarchy(registered);
    await this.audit({
      eventType: "AGENT_WORKFORCE_BOOTSTRAPPED",
      ownerId,
      ipAddress,
      outcome: "SUCCESS",
      reason:
        "Owner-scoped dormant workforce metadata bootstrapped without model or worker activation.",
      requestId,
      metadata: {
        registeredAgents: registered.length,
        importedAgents: ECC_AGENT_SEEDS.length,
        providerCalls: 0,
        runtimeActivations: 0,
      },
    });
    return this.preview(ownerId);
  }

  async graph(ownerId: string, rawQuery: unknown) {
    const query = WorkforceSearchQuerySchema.parse(rawQuery);
    const [organizations, companyDepartments, allAgents, economyDashboard, preview] =
      await Promise.all([
        this.society.store.listOrganizations(ownerId),
        this.society.store.listDepartments(ownerId),
        this.agentStore.listAgents(ownerId),
        this.economy.dashboard(ownerId),
        this.preview(ownerId),
      ]);
    const organization = organizations[0] ?? null;
    const departmentById = new Map(
      companyDepartments.map((department) => [department.id, department]),
    );
    const accountByAgent = new Map(
      economyDashboard.accounts.map((account) => [account.agentId, account]),
    );
    const filtered = allAgents
      .filter((agent) => {
        const metadata = agent.workforce;
        if (!metadata)
          return (
            !query.q ||
            `${agent.id} ${agent.displayName} ${agent.role}`
              .toLowerCase()
              .includes(query.q.toLowerCase())
          );
        const account = accountByAgent.get(agent.id);
        const status =
          account?.economyStatus === "ACTIVE"
            ? "ACTIVE"
            : account?.economyStatus === "SUSPENDED"
              ? "SUSPENDED"
              : "DORMANT";
        return (
          (!query.q ||
            `${agent.id} ${agent.displayName} ${agent.role} ${metadata.specialization} ${metadata.skills.join(" ")} ${departmentById.get(metadata.departmentId)?.name ?? ""}`
              .toLowerCase()
              .includes(query.q.toLowerCase())) &&
          (!query.departmentId || metadata.departmentId === query.departmentId) &&
          (!query.status || status === query.status) &&
          (!query.source || metadata.source === query.source)
        );
      })
      .slice(0, query.limit);
    const visibleAgentIds = new Set(filtered.map((agent) => agent.id));
    const visibleDepartmentIds = new Set(
      filtered
        .map((agent) => agent.workforce?.departmentId)
        .filter((id): id is string => Boolean(id)),
    );
    const nodes = [
      ...(organization
        ? [
            {
              id: "alexa_governor",
              kind: "GOVERNOR" as const,
              label: "Alexa Governor",
              subtitle: organization.name,
              parentId: null,
              departmentId: null,
              status: "ACTIVE" as const,
              reputation: null,
              credits: null,
              source: "ALEXA_NATIVE" as const,
              childCount: visibleDepartmentIds.size,
            },
          ]
        : []),
      ...companyDepartments
        .filter((department) => visibleDepartmentIds.has(department.id))
        .map((department) => ({
          id: `department:${department.id}`,
          kind: "DEPARTMENT" as const,
          label: department.name,
          subtitle: department.responsibility,
          parentId: "alexa_governor",
          departmentId: department.id,
          status: "ACTIVE" as const,
          reputation: null,
          credits: null,
          source: "ALEXA_NATIVE" as const,
          childCount: filtered.filter(
            (agent) =>
              agent.workforce?.departmentId === department.id &&
              agent.id !== "alexa_governor",
          ).length,
        })),
      ...filtered
        .filter((agent) => agent.id !== "alexa_governor")
        .map((agent) => {
          const metadata = agent.workforce;
          const account = accountByAgent.get(agent.id);
          return {
            id: agent.id,
            kind: "AGENT" as const,
            label: agent.displayName,
            subtitle: metadata?.specialization ?? agent.role,
            parentId:
              metadata?.parentAgentId && visibleAgentIds.has(metadata.parentAgentId)
                ? metadata.parentAgentId
                : metadata
                  ? `department:${metadata.departmentId}`
                  : "alexa_governor",
            departmentId: metadata?.departmentId ?? null,
            status:
              account?.economyStatus === "ACTIVE"
                ? ("ACTIVE" as const)
                : account?.economyStatus === "SUSPENDED"
                  ? ("SUSPENDED" as const)
                  : agent.status === "unhealthy"
                    ? ("FAILED" as const)
                    : ("DORMANT" as const),
            reputation: account?.reputation ?? null,
            credits: account?.availableCredits ?? null,
            source: metadata?.source ?? ("ALEXA_NATIVE" as const),
            childCount: allAgents.filter(
              (candidate) => candidate.workforce?.parentAgentId === agent.id,
            ).length,
          };
        }),
    ];
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = nodes
      .filter((node) => node.parentId && nodeIds.has(node.parentId))
      .map((node) => ({
        id: `${node.parentId}->${node.id}`,
        source: node.parentId!,
        target: node.id,
        type: "REPORTS_TO" as const,
      }));
    const reputations = economyDashboard.accounts.map((account) => account.reputation);
    return WorkforceGraphResponseSchema.parse({
      organization,
      departments: companyDepartments.filter((department) =>
        visibleDepartmentIds.has(department.id),
      ),
      nodes,
      edges,
      summary: {
        registered: allAgents.length,
        active: economyDashboard.overview.activeAgents,
        dormant: economyDashboard.overview.dormantAgents,
        suspended: economyDashboard.overview.suspendedAgents,
        departments: companyDepartments.length,
        memoryScopes: new Set(
          allAgents.map((agent) => agent.workforce?.memoryScopeId).filter(Boolean),
        ).size,
        capabilityProfiles: new Set(
          allAgents
            .map((agent) => agent.workforce?.capabilityProfileId)
            .filter(Boolean),
        ).size,
        aggregateCredits: economyDashboard.overview.availableCredits,
        averageReputation: reputations.length
          ? reputations.reduce((sum, value) => sum + value, 0) / reputations.length
          : 0,
      },
      bootstrapAvailable: allAgents.length < 100,
      importPreview: preview,
      runtime: {
        modelInstancesFromRegistration: 0,
        workerProcessesFromRegistration: 0,
        providerCallsFromRegistration: 0,
        sharedAIRouter: true,
      },
    });
  }

  async detail(ownerId: string, agentId: string) {
    const agent = await this.agentStore.findAgent(ownerId, agentId);
    if (!agent) throw new ExecutionError(404, "AGENT_NOT_FOUND", "Agent not found.");
    const [companyDepartments, allAgents, economyDashboard, tasks, events] =
      await Promise.all([
        this.society.store.listDepartments(ownerId),
        this.agentStore.listAgents(ownerId),
        this.economy.dashboard(ownerId),
        this.agentStore.listTasks(ownerId, 500),
        this.workforceStore.listEvents(ownerId, agentId, 100),
      ]);
    const metadata = agent.workforce;
    const economy =
      economyDashboard.accounts.find((account) => account.agentId === agentId) ?? null;
    const performance =
      economyDashboard.performance.find((record) => record.agentId === agentId) ?? null;
    return WorkforceAgentDetailSchema.parse({
      agent,
      department:
        companyDepartments.find(
          (department) => department.id === metadata?.departmentId,
        ) ?? null,
      manager: metadata?.managerAgentId
        ? ((await this.agentStore.findAgent(ownerId, metadata.managerAgentId)) ?? null)
        : null,
      children: allAgents.filter(
        (candidate) => candidate.workforce?.parentAgentId === agentId,
      ),
      economy,
      performance,
      tasks: tasks.filter((task) => task.agentId === agentId).slice(0, 100),
      events,
      recentLedger: economyDashboard.ledger
        .filter((entry) => entry.agentId === agentId)
        .slice(0, 100)
        .map(({ id, type, amount, reasonCode, createdAt }) => ({
          id,
          type,
          amount,
          reasonCode,
          createdAt,
        })),
      memoryAccess: {
        privateScope: metadata?.memoryScopeId ?? `agent:${agent.id}`,
        departmentScope: metadata?.departmentMemoryScopeId ?? "none",
        organizationScope: metadata?.organizationMemoryScopeId ?? "none",
        ownerPrivateIncluded: false,
      },
      authority: {
        hierarchyGrantsPermissions: false,
        creditsGrantAuthority: false,
        capabilitiesExplicitOnly: true,
      },
    });
  }

  async setActivation(
    ownerId: string,
    agentId: string,
    state: "ACTIVE" | "DORMANT",
    requestId: string,
    ipAddress: string,
  ) {
    const agent = await this.agentStore.findAgent(ownerId, agentId);
    if (!agent?.workforce)
      throw new ExecutionError(
        404,
        "WORKFORCE_AGENT_NOT_FOUND",
        "Workforce agent not found.",
      );
    const assignment = await this.agentStore.findAssignment(ownerId, agentId);
    if (!assignment || assignment.status === "REVOKED")
      throw new ExecutionError(
        404,
        "WORKFORCE_ASSIGNMENT_NOT_FOUND",
        "Company specialist assignment not found.",
      );
    await this.economy.setStatus(ownerId, agentId, state, requestId, ipAddress);
    const at = this.now().toISOString();
    await this.agentStore.saveAssignment({
      ...assignment,
      status: state,
      updatedAt: at,
    });
    await this.workforceStore.saveEvent({
      id: crypto.randomUUID(),
      ownerId,
      agentId,
      type: state === "ACTIVE" ? "ACTIVATED" : "DORMANT",
      summary:
        state === "ACTIVE"
          ? "Owner requested bounded lazy activation; no dedicated model instance was created."
          : "Agent returned to dormant metadata-only participation.",
      referenceId: null,
      createdAt: at,
    });
    await this.audit({
      eventType: "AGENT_WORKFORCE_ACTIVATION_CHANGED",
      ownerId,
      ipAddress,
      outcome: "SUCCESS",
      reason: `Workforce participation changed to ${state}.`,
      requestId,
      metadata: {
        agentId,
        state,
        dedicatedModelCreated: false,
        dedicatedWorkerCreated: false,
      },
    });
    return this.detail(ownerId, agentId);
  }

  async enrollGeneratedSpecialist(agent: AgentRecord) {
    if (!agent.workforce)
      throw new ExecutionError(
        409,
        "WORKFORCE_METADATA_REQUIRED",
        "Generated specialists require bounded workforce metadata.",
      );
    await this.ensureEconomy(agent);
  }

  validateHierarchy(agents: AgentRecord[]) {
    const byId = new Map(agents.map((agent) => [agent.id, agent]));
    for (const agent of agents) {
      const seen = new Set([agent.id]);
      let parentId = agent.workforce?.parentAgentId ?? null;
      while (parentId) {
        if (seen.has(parentId))
          throw new ExecutionError(
            409,
            "WORKFORCE_HIERARCHY_CYCLE",
            "Agent hierarchy contains a cycle.",
          );
        seen.add(parentId);
        parentId = byId.get(parentId)?.workforce?.parentAgentId ?? null;
      }
    }
  }

  private async ensureOrganization(ownerId: string) {
    const dashboard = await this.society.dashboard(ownerId);
    const existing = dashboard.organizations[0];
    if (!existing)
      throw new ExecutionError(
        500,
        "ORGANIZATION_MISSING",
        "Agent Society organization missing.",
      );
    const updated = OrganizationRecordSchema.parse({
      ...existing,
      name: "Alexa Workforce",
      mission:
        "Coordinate a governed, resource-aware artificial organization under owner authority.",
      governorAgentId: "alexa_governor",
      updatedAt: this.now().toISOString(),
    });
    await this.society.store.saveOrganization(updated);
    return updated;
  }

  private async ensureDepartments(ownerId: string, organizationId: string) {
    const existing = await this.society.store.listDepartments(ownerId);
    const byName = new Map(existing.map((department) => [department.name, department]));
    const at = this.now().toISOString();
    for (const [name, responsibility] of departments) {
      if (byName.has(name)) continue;
      const department = DepartmentRecordSchema.parse({
        id: uuidFrom(`workforce:${ownerId}:department:${name}`),
        ownerId,
        organizationId,
        name,
        responsibility,
        parentDepartmentId: null,
        leadAgentId: leadFor[name] ?? null,
        status: "active",
        createdAt: at,
        updatedAt: at,
      });
      await this.society.store.saveDepartment(department);
      byName.set(name, department);
    }
    return byName;
  }

  private async registerSeed(
    ownerId: string,
    organizationId: string,
    departmentByName: Map<string, DepartmentRecord>,
    seed: WorkforceSeed,
    existingBefore: Set<string>,
    at: string,
  ) {
    const department = departmentByName.get(seed.department);
    if (!department)
      throw new ExecutionError(
        500,
        "DEPARTMENT_MISSING",
        `Department ${seed.department} missing.`,
      );
    const manager = leadFor[seed.department] ?? null;
    const isLead = manager === seed.id;
    const agent = AgentRecordSchema.parse({
      schemaVersion: "1",
      id: seed.id,
      ownerId,
      role: seed.role,
      displayName: seed.displayName,
      version: "1.0.0",
      status: "available",
      capabilities: [
        ...capabilityByRole[seed.role],
        ...(businessCapabilitiesByDepartment[seed.department] ?? []),
      ],
      supportedTasks: taskByRole[seed.role],
      configuration: {
        runtimeMode: "LAZY_SHARED_AI",
        externalToolDeclarationsImported: false,
        authorityInheritedFromManager: false,
      },
      createdAt: existingBefore.has(seed.id)
        ? ((await this.agentStore.findAgent(ownerId, seed.id))?.createdAt ?? at)
        : at,
      updatedAt: at,
      healthSummary:
        "Registered dormant workforce definition; shared AIRouter context loads only for assigned work.",
      workforce: {
        organizationId,
        departmentId: department.id,
        parentAgentId: isLead ? null : manager,
        managerAgentId: isLead ? null : manager,
        specialization: seed.specialization,
        description: seed.description,
        skills: seed.skills.length ? seed.skills : ["domain-analysis"],
        memoryScopeId: `agent:${seed.id}`,
        departmentMemoryScopeId: `department:${department.id}`,
        organizationMemoryScopeId: `organization:${organizationId}`,
        capabilityProfileId: `profile:${seed.role}:${seed.department.toLowerCase().replaceAll(" ", "_")}`,
        missingCapabilities: [],
        modelPolicyId: modelPolicyFor(seed.role),
        activationPolicyId: "lazy_owner_or_task_activation_v1",
        executionPlacement: seed.role === "security" ? "LOCAL_ONLY" : "REMOTE_ALLOWED",
        evaluationProfile: [
          "verified_outcome",
          "quality",
          "cost_efficiency",
          "policy_compliance",
        ],
        source: seed.source,
        sourcePath: seed.sourcePath,
        sourceVersion: seed.source === "EVERYTHING_CLAUDE_CODE" ? ECC_COMMIT : "23.2.0",
        license: seed.source === "EVERYTHING_CLAUDE_CODE" ? ECC_LICENSE : null,
        importedAt: at,
      },
    });
    await this.agentStore.upsertAgent(agent);
    await this.agentStore.saveHealth({
      ownerId,
      agentId: agent.id,
      state: "healthy",
      checkedAt: at,
      activeTaskCount: 0,
      messageBacklog: 0,
      reasonCode: "DORMANT_READY",
    });
    await this.agentStore.saveMetrics({
      ownerId,
      agentId: agent.id,
      assignedTaskCount: 0,
      completedTaskCount: 0,
      failedTaskCount: 0,
      messageCount: 0,
      consensusVoteCount: 0,
      lastActivityAt: null,
    });
    await this.ensureEconomy(agent);
    if (!existingBefore.has(agent.id))
      await this.workforceStore.saveEvent({
        id: crypto.randomUUID(),
        ownerId,
        agentId: agent.id,
        type: "REGISTERED",
        summary: `${agent.displayName} registered as dormant organizational metadata.`,
        referenceId: seed.sourcePath,
        createdAt: at,
      });
  }

  private async decorateBuiltIns(
    ownerId: string,
    organizationId: string,
    departmentByName: Map<string, DepartmentRecord>,
    at: string,
  ) {
    for (const agent of await this.agentStore.listAgents(ownerId)) {
      if (
        agent.workforce &&
        agent.workforce.departmentId !== this.requireCompanyId(ownerId)
      )
        continue;
      const departmentName =
        agent.role === "security"
          ? "Security"
          : agent.role === "testing" || agent.role === "review"
            ? "Quality & Review"
            : agent.role === "planning"
              ? "Executive"
              : "Development";
      const department = departmentByName.get(departmentName)!;
      const updated = AgentRecordSchema.parse({
        ...agent,
        configuration: {
          ...agent.configuration,
          runtimeMode: "LAZY_SHARED_AI",
          externalToolDeclarationsImported: false,
          authorityInheritedFromManager: false,
        },
        updatedAt: at,
        workforce: {
          organizationId,
          departmentId: department.id,
          parentAgentId: leadFor[departmentName] ?? null,
          managerAgentId: leadFor[departmentName] ?? null,
          specialization: agent.displayName,
          description: agent.healthSummary,
          skills: agent.supportedTasks,
          memoryScopeId: `agent:${agent.id}`,
          departmentMemoryScopeId: `department:${department.id}`,
          organizationMemoryScopeId: `organization:${organizationId}`,
          capabilityProfileId: `profile:${agent.role}`,
          missingCapabilities: [],
          modelPolicyId: modelPolicyFor(agent.role),
          activationPolicyId: "lazy_owner_or_task_activation_v1",
          executionPlacement:
            agent.role === "security" ? "LOCAL_ONLY" : "REMOTE_ALLOWED",
          evaluationProfile: ["verified_outcome", "quality", "policy_compliance"],
          source: "ALEXA_NATIVE",
          sourcePath: null,
          sourceVersion: "built-in",
          license: null,
          importedAt: at,
        },
      });
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
    await this.economy.store.updateAccount(
      AgentEconomyAccountSchema.parse({
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
      }),
    );
  }
}
