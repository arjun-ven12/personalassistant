import {
  AgentDashboardResponseSchema,
  ComposeTeamRequestSchema,
  type AgentRecord,
  type AgentTemplateRecord,
  type CapabilityRecord,
  type ComposeTeamRequest,
  type DynamicAgentRecord,
  type TeamCompositionRecord,
} from "@alexa-control/shared";

import { ExecutionError } from "../execution/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { RepositoryStore } from "../repositories/store.js";
import type { AgentStore } from "./store.js";

type TemplateSeed = Omit<AgentTemplateRecord, "ownerId" | "createdAt" | "updatedAt">;

const capabilityId = (value: string) =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "")
    .slice(0, 120);

const templateSeeds: TemplateSeed[] = [
  {
    id: "backend_engineer",
    role: "Backend Engineer",
    displayName: "Backend Engineer",
    description: "Designs server-side APIs, services, authentication, and data flows.",
    capabilities: ["backend", "node_js", "rest_api", "authentication", "database"],
    prompt:
      "Reason about backend implementation plans with evidence. Never execute or modify code directly.",
    tools: ["repository_intelligence", "semantic_code_intelligence"],
    allowedActions: ["reason", "plan", "review", "recommend"],
    preferredModels: ["governed-default"],
    memorySources: ["repository_memory", "engineering_decisions", "knowledge_graph"],
    evaluationCriteria: ["Evidence quality", "Security boundary preservation"],
    version: "1.0.0",
  },
  {
    id: "frontend_engineer",
    role: "Frontend Engineer",
    displayName: "Frontend Engineer",
    description: "Plans React UI, state, accessibility, and API-client changes.",
    capabilities: ["frontend", "react", "ui_state", "accessibility", "api_client"],
    prompt:
      "Reason about frontend changes without editing files or bypassing approval.",
    tools: ["repository_intelligence", "semantic_code_intelligence"],
    allowedActions: ["reason", "plan", "review", "recommend"],
    preferredModels: ["governed-default"],
    memorySources: ["repository_memory", "user_preferences"],
    evaluationCriteria: ["Usability", "Accessibility", "API boundary correctness"],
    version: "1.0.0",
  },
  {
    id: "database_engineer",
    role: "Database Engineer",
    displayName: "Database Engineer",
    description: "Plans schemas, migrations, indexes, and persistence boundaries.",
    capabilities: ["database", "postgresql", "migration", "prisma", "data_modeling"],
    prompt: "Plan database changes with migration and rollback evidence.",
    tools: ["repository_intelligence", "database_discovery"],
    allowedActions: ["reason", "plan", "review", "recommend"],
    preferredModels: ["governed-default"],
    memorySources: ["engineering_decisions", "repository_memory"],
    evaluationCriteria: ["Migration safety", "Rollback clarity", "Owner scoping"],
    version: "1.0.0",
  },
  {
    id: "devops_engineer",
    role: "DevOps Engineer",
    displayName: "DevOps Engineer",
    description: "Plans CI, deployment, infrastructure, observability, and rollback.",
    capabilities: ["devops", "ci_cd", "deployment", "observability", "infrastructure"],
    prompt: "Advise on deployment and validation without triggering external systems.",
    tools: ["validation_history", "integration_health"],
    allowedActions: ["reason", "plan", "review", "recommend"],
    preferredModels: ["governed-default"],
    memorySources: ["workflow_history", "release_assessments"],
    evaluationCriteria: ["Operational safety", "Rollback plan", "Auditability"],
    version: "1.0.0",
  },
  {
    id: "performance_engineer",
    role: "Performance Engineer",
    displayName: "Performance Engineer",
    description: "Investigates latency, caching, large modules, and scalability risks.",
    capabilities: ["performance", "caching", "redis", "profiling", "scalability"],
    prompt: "Recommend performance work from evidence; do not run benchmarks directly.",
    tools: ["repository_insights", "infrastructure_metrics"],
    allowedActions: ["reason", "plan", "review", "recommend"],
    preferredModels: ["governed-default"],
    memorySources: ["repository_memory", "infrastructure_metrics"],
    evaluationCriteria: ["Bottleneck evidence", "Measurement strategy"],
    version: "1.0.0",
  },
  {
    id: "security_engineer",
    role: "Security Engineer",
    displayName: "Security Engineer",
    description: "Reviews threats, secrets, authentication, and policy boundaries.",
    capabilities: [
      "security",
      "threat_modeling",
      "secrets",
      "authentication",
      "policy",
    ],
    prompt: "Fail closed and identify security risks with evidence.",
    tools: ["policy_engine", "audit_log", "repository_intelligence"],
    allowedActions: ["reason", "plan", "review", "recommend"],
    preferredModels: ["governed-default"],
    memorySources: ["security_docs", "engineering_decisions"],
    evaluationCriteria: [
      "Fail-closed behavior",
      "Secret handling",
      "Approval boundaries",
    ],
    version: "1.0.0",
  },
];

const staticCapabilityDescriptions: Record<string, string> = {
  planning: "Task planning, decomposition, sequencing, and dependency analysis.",
  backend: "Server-side services, APIs, and data flow reasoning.",
  frontend: "React, UI, state, accessibility, and browser boundary reasoning.",
  testing: "Test strategy, regression analysis, and validation profile selection.",
  security: "Threat modeling, authentication, secrets, and policy analysis.",
  database: "Schema, migration, persistence, indexing, and rollback planning.",
  migration: "Versioned migration planning and compatibility checks.",
  devops: "CI/CD, deployment, observability, and operational readiness.",
  performance: "Latency, caching, profiling, and scalability reasoning.",
  documentation: "Architecture, API, release, and operations documentation.",
  redis: "Redis caching, queueing, locking, and infrastructure coordination.",
  graphql: "GraphQL schema, resolver, and migration planning.",
  accessibility: "Accessible user interface and keyboard/screen-reader analysis.",
  observability: "Metrics, logging, tracing, and alerting design.",
};

export class AgentFactoryService {
  constructor(
    readonly store: AgentStore,
    readonly repositoryStore: RepositoryStore,
    readonly audit: GovernanceAuditWriter,
    readonly now = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    await this.ensureTemplates(ownerId);
    const dynamicAgents = await this.store.listDynamicAgents(ownerId, true);
    return AgentDashboardResponseSchema.shape.dynamicWorkforce.unwrap().parse({
      templates: await this.store.listTemplates(ownerId),
      capabilities: await this.store.listCapabilities(ownerId),
      dynamicAgents: dynamicAgents.filter(
        (agent) => agent.lifecycleStatus !== "archived",
      ),
      archivedAgents: dynamicAgents.filter(
        (agent) => agent.lifecycleStatus === "archived",
      ),
      lifecycle: await this.store.listLifecycleEvents(ownerId, 100),
      performance: await this.store.listDynamicPerformance(ownerId, 100),
      teamCompositions: await this.store.listTeamCompositions(ownerId, 50),
      promotionCandidates: await this.store.listPromotionCandidates(ownerId, 50),
    });
  }

  async composeTeam(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureTemplates(input.ownerId);
    const parsed: ComposeTeamRequest = ComposeTeamRequestSchema.parse(input.body);
    const requiredCapabilities = this.requiredCapabilities(parsed.goal);
    const [agents, templates] = await Promise.all([
      this.store.listAgents(input.ownerId),
      this.store.listTemplates(input.ownerId),
    ]);
    const reusedAgentIds = this.reuseAgents(agents, requiredCapabilities);
    const covered = new Set(
      agents
        .filter((agent) => reusedAgentIds.includes(agent.id))
        .flatMap((agent) => agent.capabilities.map(capabilityId)),
    );
    const missing = requiredCapabilities.filter(
      (capability) => !covered.has(capability),
    );
    const dynamicAgents: DynamicAgentRecord[] = [];
    for (const capability of missing) {
      const template = this.bestTemplate(templates, capability);
      const dynamicAgent = template
        ? this.fromTemplate(
            input.ownerId,
            parsed.workflowId ?? null,
            template,
            capability,
            parsed.goal,
          )
        : this.synthesise(
            input.ownerId,
            parsed.workflowId ?? null,
            capability,
            parsed.goal,
          );
      await this.registerDynamicAgent(dynamicAgent, input.requestId, input.ipAddress);
      dynamicAgents.push(dynamicAgent);
    }
    const riskLevel =
      requiredCapabilities.includes("security") || missing.length > 2
        ? "high"
        : missing.length > 0
          ? "medium"
          : "low";
    const composition: TeamCompositionRecord = {
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      workflowId: parsed.workflowId ?? null,
      goal: parsed.goal,
      requiredCapabilities,
      reusedAgentIds,
      dynamicAgentIds: dynamicAgents.map((agent) => agent.id),
      missingCapabilities: missing,
      riskLevel,
      rationale:
        missing.length === 0
          ? "Existing specialist agents cover the detected capability set."
          : `Created ${dynamicAgents.length} temporary specialist agent(s) to cover capability gaps.`,
      createdAt: this.now().toISOString(),
    };
    await this.store.saveTeamComposition(composition);
    await this.audit({
      eventType: "TEAM_COMPOSITION_CREATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Dynamic team composition generated.",
      requestId: input.requestId,
      metadata: {
        compositionId: composition.id,
        dynamicAgentCount: dynamicAgents.length,
        inheritedPermissionsOnly: true,
      },
    });
    return { composition, dynamicAgents };
  }

  async retireAgent(input: {
    ownerId: string;
    agentId: string;
    reason: string;
    requestId: string;
    ipAddress: string;
  }) {
    const agent = await this.store.findDynamicAgent(input.ownerId, input.agentId);
    if (!agent) {
      throw new ExecutionError(
        404,
        "DYNAMIC_AGENT_NOT_FOUND",
        "Dynamic agent was not found.",
      );
    }
    const at = this.now().toISOString();
    const archived: DynamicAgentRecord = {
      ...agent,
      lifecycleStatus: "archived",
      updatedAt: at,
      archivedAt: at,
    };
    await this.store.saveDynamicAgent(archived);
    await this.recordLifecycle(archived, "archived", input.reason);
    await this.store.saveDynamicPerformance({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      agentId: agent.id,
      workflowId: agent.workflowId,
      tasksCompleted: 0,
      successRate: 1,
      averageCompletionTimeMs: 0,
      validationFailures: 0,
      reviewQuality: 0.8,
      collaborationScore: 0.8,
      reuseFrequency: 1,
      confidence: 0.75,
      recordedAt: at,
    });
    await this.audit({
      eventType: "DYNAMIC_AGENT_ARCHIVED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: input.reason,
      requestId: input.requestId,
      metadata: { agentId: agent.id },
    });
    return archived;
  }

  capabilities(ownerId: string) {
    return this.store.listCapabilities(ownerId);
  }

  async searchCapabilities(ownerId: string, q: string, limit: number) {
    await this.ensureTemplates(ownerId);
    return this.store.searchCapabilities(ownerId, q, limit);
  }

  async templates(ownerId: string) {
    await this.ensureTemplates(ownerId);
    return this.store.listTemplates(ownerId);
  }

  dynamicAgents(ownerId: string, includeArchived = false) {
    return this.store.listDynamicAgents(ownerId, includeArchived);
  }

  lifecycle(ownerId: string) {
    return this.store.listLifecycleEvents(ownerId, 100);
  }

  performance(ownerId: string) {
    return this.store.listDynamicPerformance(ownerId, 100);
  }

  promotions(ownerId: string) {
    return this.store.listPromotionCandidates(ownerId, 100);
  }

  compositions(ownerId: string) {
    return this.store.listTeamCompositions(ownerId, 100);
  }

  async ensureTemplates(ownerId: string) {
    const existing = new Set(
      (await this.store.listTemplates(ownerId)).map((template) => template.id),
    );
    const at = this.now().toISOString();
    for (const seed of templateSeeds) {
      if (existing.has(seed.id)) continue;
      await this.store.saveTemplate({ ...seed, ownerId, createdAt: at, updatedAt: at });
      await this.audit({
        eventType: "AGENT_TEMPLATE_REGISTERED",
        ownerId,
        ipAddress: "system",
        outcome: "SUCCESS",
        reason: `${seed.displayName} template registered.`,
        requestId: "agent-factory-bootstrap",
        metadata: { templateId: seed.id },
      });
    }
    const capabilities = new Set([
      ...Object.keys(staticCapabilityDescriptions),
      ...templateSeeds.flatMap((template) => template.capabilities),
    ]);
    const existingCapabilities = new Set(
      (await this.store.listCapabilities(ownerId)).map((capability) => capability.id),
    );
    for (const id of capabilities) {
      if (existingCapabilities.has(id)) continue;
      const capability: CapabilityRecord = {
        id,
        ownerId,
        name: id.replaceAll("_", " "),
        description:
          staticCapabilityDescriptions[id] ??
          `Specialist capability for ${id.replaceAll("_", " ")} work.`,
        version: "1.0.0",
        confidence: 0.8,
        relatedCapabilityIds: [],
        createdAt: at,
        updatedAt: at,
      };
      await this.store.saveCapability(capability);
    }
  }

  requiredCapabilities(goal: string) {
    const lower = goal.toLowerCase();
    const capabilities = new Set(["planning", "testing", "documentation"]);
    const addIf = (needles: string[], capability: string) => {
      if (needles.some((needle) => lower.includes(needle)))
        capabilities.add(capability);
    };
    addIf(["api", "backend", "server", "auth", "oauth", "session"], "backend");
    addIf(["ui", "frontend", "react", "dashboard", "page"], "frontend");
    addIf(["auth", "oauth", "secret", "security", "permission"], "security");
    addIf(["database", "postgres", "migration", "prisma", "schema"], "database");
    addIf(["redis", "cache", "queue", "lock"], "redis");
    addIf(["deploy", "ci", "pipeline", "docker", "infra"], "devops");
    addIf(["slow", "latency", "performance", "scale"], "performance");
    addIf(["graphql"], "graphql");
    addIf(["accessibility", "a11y", "keyboard"], "accessibility");
    addIf(["telemetry", "observability", "metrics", "tracing"], "observability");
    return [...capabilities].sort();
  }

  reuseAgents(agents: AgentRecord[], requiredCapabilities: string[]) {
    const required = new Set(requiredCapabilities);
    return agents
      .filter((agent) =>
        agent.capabilities.some((capability) => required.has(capabilityId(capability))),
      )
      .map((agent) => agent.id);
  }

  bestTemplate(templates: AgentTemplateRecord[], capability: string) {
    return templates.find((template) =>
      template.capabilities.map(capabilityId).includes(capability),
    );
  }

  fromTemplate(
    ownerId: string,
    workflowId: string | null,
    template: AgentTemplateRecord,
    capability: string,
    goal: string,
  ): DynamicAgentRecord {
    const at = this.now().toISOString();
    return {
      id: `dynamic_${capability}_${crypto.randomUUID().slice(0, 8)}`,
      ownerId,
      workflowId,
      templateId: template.id,
      origin: "template",
      displayName: `${template.displayName} (${capability.replaceAll("_", " ")})`,
      roleDescription: template.description,
      responsibilities: [
        `Cover ${capability.replaceAll("_", " ")} expertise for: ${goal}`,
        "Collaborate through existing agent messages and workflow checkpoints.",
      ],
      capabilities: template.capabilities,
      prompt: template.prompt,
      constraints: [
        "Cannot approve workflows.",
        "Cannot execute commands.",
        "Cannot modify repositories.",
        "Cannot install tools or escalate permissions.",
      ],
      successCriteria: template.evaluationCriteria,
      knowledgeSources: template.memorySources,
      inheritedPermissionProfile: "existing_agent_permissions",
      lifecycleStatus: "active",
      creationReason: `Template selected to cover missing capability ${capability}.`,
      createdAt: at,
      updatedAt: at,
      archivedAt: null,
    };
  }

  synthesise(
    ownerId: string,
    workflowId: string | null,
    capability: string,
    goal: string,
  ): DynamicAgentRecord {
    const at = this.now().toISOString();
    const label = capability.replaceAll("_", " ");
    return {
      id: `dynamic_${capability}_${crypto.randomUUID().slice(0, 8)}`,
      ownerId,
      workflowId,
      templateId: null,
      origin: "synthesised",
      displayName: `${label} Specialist`,
      roleDescription: `Temporary specialist synthesised for ${label} work.`,
      responsibilities: [
        `Analyse ${label} implications for: ${goal}`,
        "Identify risks, dependencies, tests, and owner approval checkpoints.",
      ],
      capabilities: [capability, "planning", "review"],
      prompt: `Act as a ${label} specialist. Use repository evidence and remain advisory unless an owner-approved workflow delegates a task.`,
      constraints: [
        "Cannot create other agents.",
        "Cannot approve workflows.",
        "Cannot execute commands.",
        "Cannot modify files.",
        "Cannot access repositories outside assigned scope.",
      ],
      successCriteria: [
        "Evidence-backed findings",
        "Clear risk assessment",
        "Explicit validation plan",
      ],
      knowledgeSources: [
        "repository_memory",
        "knowledge_graph",
        "engineering_decisions",
      ],
      inheritedPermissionProfile: "existing_agent_permissions",
      lifecycleStatus: "active",
      creationReason: `No template fully covered missing capability ${capability}.`,
      createdAt: at,
      updatedAt: at,
      archivedAt: null,
    };
  }

  async registerDynamicAgent(
    agent: DynamicAgentRecord,
    requestId: string,
    ipAddress: string,
  ) {
    await this.store.saveDynamicAgent(agent);
    await this.store.upsertAgent({
      schemaVersion: "1",
      id: agent.id,
      ownerId: agent.ownerId,
      role: "coding",
      displayName: agent.displayName,
      version: "dynamic-1.0.0",
      status: "available",
      capabilities: agent.capabilities,
      supportedTasks: ["planning", "review", "risk_analysis", "documentation"],
      configuration: {
        dynamic: true,
        templateId: agent.templateId,
        inheritedPermissionProfile: agent.inheritedPermissionProfile,
      },
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      healthSummary:
        "Temporary dynamic specialist. It inherits existing agent permissions and cannot execute independently.",
    });
    await this.store.saveHealth({
      ownerId: agent.ownerId,
      agentId: agent.id,
      state: "healthy",
      checkedAt: agent.createdAt,
      activeTaskCount: 0,
      messageBacklog: 0,
      reasonCode: "DYNAMIC_AGENT_READY",
    });
    await this.store.saveMetrics({
      ownerId: agent.ownerId,
      agentId: agent.id,
      assignedTaskCount: 0,
      completedTaskCount: 0,
      failedTaskCount: 0,
      messageCount: 0,
      consensusVoteCount: 0,
      lastActivityAt: null,
    });
    await this.recordLifecycle(agent, "created", agent.creationReason);
    await this.recordLifecycle(agent, "active", "Dynamic specialist activated.");
    await this.audit({
      eventType: "DYNAMIC_AGENT_CREATED",
      ownerId: agent.ownerId,
      ipAddress,
      outcome: "SUCCESS",
      reason: agent.creationReason,
      requestId,
      metadata: {
        agentId: agent.id,
        origin: agent.origin,
        inheritedPermissionsOnly: true,
      },
    });
  }

  async recordLifecycle(
    agent: DynamicAgentRecord,
    status: DynamicAgentRecord["lifecycleStatus"],
    reason: string,
  ) {
    await this.store.saveLifecycleEvent({
      id: crypto.randomUUID(),
      ownerId: agent.ownerId,
      agentId: agent.id,
      workflowId: agent.workflowId,
      status,
      reason,
      createdAt: this.now().toISOString(),
    });
  }
}
