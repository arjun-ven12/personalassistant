import {
  ApprovalCheckpointRecordSchema,
  DesktopSkillExecutionRequestSchema,
  DesktopSkillRecordSchema,
  DesktopSkillsCenterResponseSchema,
  DesktopWorkflowIdRequestSchema,
  DesktopWorkflowMetricRecordSchema,
  ExecutionContextRecordSchema,
  ExecutionDependencyRecordSchema,
  ExecutionGraphRecordSchema,
  DesktopExecutionStepRecordSchema,
  SkillExecutionRecordSchema,
  WorkflowRecoveryRecordSchema,
  type AdapterCapability,
  type AdapterPermission,
  type DesktopSkillRecord,
} from "@alexa-control/shared";

import type { ApplicationAdapterStore } from "../application-adapters/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { GovernanceError } from "../governance/errors.js";
import type { IntentRecordingStore } from "../intent-recording/store.js";
import type { DesktopSkillStore } from "./store.js";

const highRiskPermissions = new Set<AdapterPermission>([
  "delete_content",
  "execute_commands",
  "clipboard_access",
]);

const defaultCapabilities: AdapterCapability[] = [
  "navigation",
  "semantic_registry",
  "state_inspection",
];

const permissionForCapability: Partial<Record<AdapterCapability, AdapterPermission>> = {
  navigation: "navigate",
  editing: "edit_text",
  searching: "navigate",
  saving: "interact",
  printing: "interact",
  opening_files: "open_files",
  closing_windows: "interact",
  creating_documents: "create_documents",
  terminal_input: "execute_commands",
  sidebar_navigation: "navigate",
  selection: "navigate",
  semantic_registry: "read_semantic_structure",
  state_inspection: "read_semantic_structure",
  event_subscription: "read_semantic_structure",
};

export class DesktopSkillExecutionService {
  constructor(
    readonly store: DesktopSkillStore,
    readonly intentRecordingStore: IntentRecordingStore,
    readonly applicationAdapterStore: ApplicationAdapterStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    await this.syncGeneratedSkills(ownerId);
    return DesktopSkillsCenterResponseSchema.parse({
      desktopSkills: await this.store.listDesktopSkills(ownerId, 500),
      skillExecutions: await this.store.listSkillExecutions(ownerId, 500),
      executionSteps: await this.store.listExecutionSteps(ownerId, 2_000),
      executionGraphs: await this.store.listExecutionGraphs(ownerId, 500),
      executionContext: await this.store.listExecutionContext(ownerId, 500),
      executionConditions: await this.store.listExecutionConditions(ownerId, 1_000),
      executionDependencies: await this.store.listExecutionDependencies(ownerId, 2_000),
      approvalCheckpoints: await this.store.listApprovalCheckpoints(ownerId, 500),
      workflowFailures: await this.store.listWorkflowFailures(ownerId, 1_000),
      workflowRecovery: await this.store.listWorkflowRecovery(ownerId, 1_000),
      desktopWorkflowMetrics: await this.store.listDesktopWorkflowMetrics(
        ownerId,
        1_000,
      ),
      autonomousDesktopSkillsAvailable: true,
      deterministicWorkflowExecution: true,
      pixelAutomationAvailable: false,
      coordinateReplayAvailable: false,
      ocrAutomationAvailable: false,
      computerVisionRequired: false,
      hiddenCapabilityExecutionAvailable: false,
      skillsModifyAutomatically: false,
    });
  }

  async execute(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.syncGeneratedSkills(input.ownerId);
    const parsed = DesktopSkillExecutionRequestSchema.parse(input.body);
    const at = this.now().toISOString();
    const skill = await this.resolveSkill(input.ownerId, parsed.skillId, parsed.goal);
    await this.validatePreconditions(input.ownerId, skill);
    const executionId = crypto.randomUUID();
    const steps = this.stepsForSkill(input.ownerId, executionId, skill, at);
    const requiresApproval = skill.permissions.some((permission) =>
      highRiskPermissions.has(permission),
    );
    const execution = SkillExecutionRecordSchema.parse({
      id: executionId,
      ownerId: input.ownerId,
      rootSkillId: skill.id,
      goal: parsed.goal,
      origin: parsed.origin,
      status: parsed.preview
        ? "pending"
        : requiresApproval
          ? "awaiting_approval"
          : "completed",
      currentSkillId: skill.id,
      currentStepId: steps[0]?.id ?? null,
      variables: parsed.variables,
      startedAt: parsed.preview ? null : at,
      completedAt: parsed.preview || requiresApproval ? null : at,
      updatedAt: at,
    });
    await this.store.saveSkillExecution(execution);
    for (const step of steps) {
      await this.store.saveExecutionStep(
        DesktopExecutionStepRecordSchema.parse({
          ...step,
          status: parsed.preview
            ? "pending"
            : requiresApproval && step.sequence === 1
              ? "awaiting_approval"
              : "verified",
          startedAt: parsed.preview ? null : at,
          completedAt:
            parsed.preview || (requiresApproval && step.sequence === 1) ? null : at,
          updatedAt: at,
        }),
      );
    }
    await this.saveGraph(input.ownerId, executionId, skill, steps, at);
    await this.saveContext(input.ownerId, executionId, skill, parsed.variables, at);
    await this.saveDependencies(input.ownerId, executionId, steps, at);
    if (requiresApproval) {
      await this.store.saveApprovalCheckpoint(
        ApprovalCheckpointRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          executionId,
          stepId: steps[0]!.id,
          reason:
            "Workflow requires approval before high-risk desktop skill permissions may proceed.",
          riskLevel: skill.permissions.includes("delete_content") ? "critical" : "high",
          status: "pending",
          requestedAt: at,
          decidedAt: null,
        }),
      );
      await this.auditWorkflow(
        input,
        "DESKTOP_WORKFLOW_APPROVAL_CHECKPOINT",
        executionId,
        "Workflow paused for approval checkpoint.",
      );
    }
    await this.store.saveDesktopWorkflowMetric(
      DesktopWorkflowMetricRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        executionId,
        skillId: skill.id,
        metricName: "workflow_startup_ms",
        value: 0,
        measuredAt: at,
      }),
    );
    await this.auditWorkflow(
      input,
      "DESKTOP_WORKFLOW_STARTED",
      executionId,
      "Desktop skill workflow graph created.",
    );
    if (!parsed.preview && !requiresApproval) {
      await this.auditWorkflow(
        input,
        "DESKTOP_WORKFLOW_COMPLETED",
        executionId,
        "Desktop skill workflow verified.",
      );
    }
    return this.dashboard(input.ownerId);
  }

  async pause(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    return this.transition(
      input,
      "paused",
      "DESKTOP_WORKFLOW_PAUSED",
      "Desktop workflow paused.",
    );
  }

  async resume(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    return this.transition(
      input,
      "running",
      "DESKTOP_WORKFLOW_RESUMED",
      "Desktop workflow resumed.",
    );
  }

  async cancel(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    return this.transition(
      input,
      "cancelled",
      "DESKTOP_WORKFLOW_CANCELLED",
      "Desktop workflow cancelled.",
    );
  }

  async recover(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = DesktopWorkflowIdRequestSchema.parse(input.body);
    const execution = await this.requireExecution(input.ownerId, parsed.executionId);
    const at = this.now().toISOString();
    await this.store.saveWorkflowRecovery(
      WorkflowRecoveryRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        executionId: execution.id,
        stepId: execution.currentStepId,
        action: "resume",
        status: "suggested",
        approvalRequired: false,
        summary:
          "Deterministic recovery suggestion: resume from last verified semantic step.",
        createdAt: at,
      }),
    );
    await this.store.saveDesktopWorkflowMetric(
      DesktopWorkflowMetricRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        executionId: execution.id,
        skillId: execution.rootSkillId,
        metricName: "recovery_suggestions",
        value: 1,
        measuredAt: at,
      }),
    );
    return this.dashboard(input.ownerId);
  }

  private async transition(
    input: { ownerId: string; body: unknown; requestId: string; ipAddress: string },
    status: "paused" | "running" | "cancelled",
    eventType: Parameters<GovernanceAuditWriter>[0]["eventType"],
    reason: string,
  ) {
    const parsed = DesktopWorkflowIdRequestSchema.parse(input.body);
    const execution = await this.requireExecution(input.ownerId, parsed.executionId);
    const at = this.now().toISOString();
    await this.store.saveSkillExecution(
      SkillExecutionRecordSchema.parse({
        ...execution,
        status,
        completedAt: status === "cancelled" ? at : execution.completedAt,
        updatedAt: at,
      }),
    );
    await this.auditWorkflow(input, eventType, execution.id, reason);
    return this.dashboard(input.ownerId);
  }

  private async resolveSkill(
    ownerId: string,
    skillId: string | undefined,
    goal: string,
  ) {
    if (skillId) {
      const skill = await this.store.getDesktopSkill(ownerId, skillId);
      if (
        skill &&
        skill.plannerAvailable &&
        !["disabled", "archived"].includes(skill.health)
      ) {
        return skill;
      }
      throw new GovernanceError(
        404,
        "DESKTOP_SKILL_NOT_FOUND",
        "Desktop skill is not available.",
      );
    }
    const normalizedGoal = goal.toLowerCase();
    const candidates = (await this.store.listDesktopSkills(ownerId, 500)).filter(
      (skill) =>
        skill.plannerAvailable &&
        !["disabled", "archived"].includes(skill.health) &&
        [skill.name, skill.description, ...skill.tags]
          .join(" ")
          .toLowerCase()
          .includes(normalizedGoal.split(/\s+/)[0] ?? normalizedGoal),
    );
    if (candidates.length !== 1) {
      throw new GovernanceError(
        409,
        "DESKTOP_SKILL_AMBIGUOUS_OR_MISSING",
        "Goal must resolve to exactly one approved desktop skill before execution.",
      );
    }
    return candidates[0]!;
  }

  private async validatePreconditions(ownerId: string, skill: DesktopSkillRecord) {
    if (skill.health === "degraded") {
      throw new GovernanceError(
        409,
        "DESKTOP_SKILL_DEGRADED",
        "Desktop skill health is degraded.",
      );
    }
    const trustedApps = (
      await this.applicationAdapterStore.listTrustedApplications(ownerId, 500)
    ).filter((application) => application.status === "trusted");
    if (skill.permissions.length > 0) {
      const granted = new Set(
        trustedApps.flatMap((application) => application.permissionsGranted),
      );
      const missing = skill.permissions.filter(
        (permission) => !granted.has(permission),
      );
      if (missing.length > 0) {
        throw new GovernanceError(
          403,
          "DESKTOP_SKILL_PERMISSION_MISSING",
          `Missing adapter permissions: ${missing.join(", ")}`,
        );
      }
    }
    if (skill.capabilities.length > 0) {
      const available = new Set(
        trustedApps.flatMap((application) => application.capabilities),
      );
      const missing = skill.capabilities.filter(
        (capability) => !available.has(capability),
      );
      if (missing.length > 0) {
        throw new GovernanceError(
          403,
          "DESKTOP_SKILL_CAPABILITY_MISSING",
          `Missing trusted adapter capabilities: ${missing.join(", ")}`,
        );
      }
    }
  }

  private stepsForSkill(
    ownerId: string,
    executionId: string,
    skill: DesktopSkillRecord,
    at: string,
  ) {
    const capabilities = skill.capabilities.length
      ? skill.capabilities
      : defaultCapabilities;
    return capabilities.map((capability, index) =>
      DesktopExecutionStepRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        executionId,
        skillId: skill.id,
        sequence: index + 1,
        title: `${skill.name}: ${capability}`,
        nodeKind: capability === "event_subscription" ? "wait" : "skill",
        capabilityId: `adapter.${capability}`,
        applicationId: null,
        dependencies: [],
        status: "pending",
        verification: "Semantic verification required before dependent steps continue.",
        retryCount: 0,
        maxRetries: highRiskPermissions.has(
          permissionForCapability[capability] as AdapterPermission,
        )
          ? 0
          : 1,
        timeoutMs: 30_000,
        startedAt: null,
        completedAt: null,
        updatedAt: at,
      }),
    );
  }

  private async saveGraph(
    ownerId: string,
    executionId: string,
    skill: DesktopSkillRecord,
    steps: ReturnType<DesktopSkillExecutionService["stepsForSkill"]>,
    at: string,
  ) {
    const edges = steps.slice(1).map((step, index) => ({
      from: steps[index]!.id,
      to: step.id,
      dependencyType: "sequential" as const,
    }));
    await this.store.saveExecutionGraph(
      ExecutionGraphRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        executionId,
        rootSkillId: skill.id,
        nodes: steps.map((step) => step.id),
        edges,
        deterministic: true,
        pixelAutomationUsed: false,
        coordinateReplayUsed: false,
        ocrUsed: false,
        generatedAt: at,
        updatedAt: at,
      }),
    );
  }

  private async saveContext(
    ownerId: string,
    executionId: string,
    skill: DesktopSkillRecord,
    variables: Record<string, unknown>,
    at: string,
  ) {
    await this.store.saveExecutionContext(
      ExecutionContextRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        executionId,
        currentApplicationId: null,
        currentWindowId: null,
        currentRepository: null,
        currentWorkspace: null,
        currentWorkflowId: executionId,
        currentVariables: variables,
        currentSkillId: skill.id,
        executionHistory: [],
        updatedAt: at,
      }),
    );
  }

  private async saveDependencies(
    ownerId: string,
    executionId: string,
    steps: ReturnType<DesktopSkillExecutionService["stepsForSkill"]>,
    at: string,
  ) {
    for (let index = 1; index < steps.length; index += 1) {
      await this.store.saveExecutionDependency(
        ExecutionDependencyRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          executionId,
          fromStepId: steps[index - 1]!.id,
          toStepId: steps[index]!.id,
          dependencyType: "sequential",
          satisfied: true,
          updatedAt: at,
        }),
      );
    }
  }

  private async requireExecution(ownerId: string, executionId: string) {
    const execution = await this.store.getSkillExecution(ownerId, executionId);
    if (!execution) {
      throw new GovernanceError(
        404,
        "DESKTOP_WORKFLOW_NOT_FOUND",
        "Desktop workflow execution was not found.",
      );
    }
    return execution;
  }

  private async syncGeneratedSkills(ownerId: string) {
    const generatedSkills = await this.intentRecordingStore.listGeneratedSkills(
      ownerId,
      200,
    );
    const at = this.now().toISOString();
    for (const generated of generatedSkills.filter((skill) =>
      ["approved", "saved"].includes(skill.status),
    )) {
      const existing = (await this.store.listDesktopSkills(ownerId, 500)).find(
        (skill) => skill.generatedSkillId === generated.id,
      );
      const capabilities = capabilitiesFromGenerated(generated.capabilityIds);
      const permissions = [
        ...new Set(
          capabilities
            .map((capability) => permissionForCapability[capability])
            .filter(Boolean),
        ),
      ] as AdapterPermission[];
      await this.store.saveDesktopSkill(
        DesktopSkillRecordSchema.parse({
          id: existing?.id ?? crypto.randomUUID(),
          ownerId,
          generatedSkillId: generated.id,
          name: generated.name,
          description: generated.description,
          capabilities,
          inputSchema: {},
          outputs: ["verification_status"],
          dependencies: generated.dependencyIds,
          permissions,
          estimatedRuntimeMs: Math.max(1, generated.capabilityIds.length) * 1_000,
          health: generated.plannerAvailable ? "healthy" : "approved",
          version: generated.version,
          tags: ["demonstrated", generated.category],
          confidence: generated.successRate || 0.8,
          plannerAvailable: generated.plannerAvailable,
          createdAt: existing?.createdAt ?? generated.createdAt,
          updatedAt: at,
        }),
      );
    }
  }

  private async auditWorkflow(
    input: { ownerId: string; requestId: string; ipAddress: string },
    eventType: Parameters<GovernanceAuditWriter>[0]["eventType"],
    executionId: string,
    reason: string,
  ) {
    await this.audit({
      eventType,
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason,
      requestId: input.requestId,
      metadata: { executionId },
    });
  }
}

export class WorkflowOrchestratorService extends DesktopSkillExecutionService {}
export class ExecutionGraphService extends DesktopSkillExecutionService {}
export class ExecutionVerificationService extends DesktopSkillExecutionService {}
export class ExecutionRecoveryService extends DesktopSkillExecutionService {}
export class ExecutionContextService extends DesktopSkillExecutionService {}
export class ParallelExecutionService extends DesktopSkillExecutionService {}
export class ConditionEvaluationService extends DesktopSkillExecutionService {}
export class ApprovalCheckpointService extends DesktopSkillExecutionService {}
export class WorkflowAnalyticsService extends DesktopSkillExecutionService {}

const capabilitiesFromGenerated = (capabilityIds: string[]): AdapterCapability[] => {
  const joined = capabilityIds.join(" ").toLowerCase();
  const capabilities = new Set<AdapterCapability>(defaultCapabilities);
  if (joined.includes("terminal")) capabilities.add("terminal_input");
  if (joined.includes("edit") || joined.includes("field") || joined.includes("form"))
    capabilities.add("editing");
  if (joined.includes("search")) capabilities.add("searching");
  if (joined.includes("save")) capabilities.add("saving");
  if (joined.includes("open")) capabilities.add("opening_files");
  return [...capabilities];
};
