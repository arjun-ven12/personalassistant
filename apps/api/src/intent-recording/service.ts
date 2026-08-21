import {
  CommandDependencyRecordSchema,
  CommandParameterRecordSchema,
  CommandTemplateRecordSchema,
  CommandVersionRecordSchema,
  CommandStudioResponseSchema,
  DemonstrationSessionRecordSchema,
  GeneratedSkillRecordSchema,
  GeneratedCommandRecordSchema,
  IntentRecordingRecordSchema,
  OptimizationSuggestionRecordSchema,
  RecordIntentEventRequestSchema,
  RecordedEventRecordSchema,
  SaveGeneratedCommandRequestSchema,
  SavedCommandRecordSchema,
  SemanticRecordingRecordSchema,
  SkillParameterRecordSchema,
  SkillSaveRequestSchema,
  SkillUsageRecordSchema,
  SkillVersionRecordSchema,
  StartIntentRecordingRequestSchema,
  StopIntentRecordingRequestSchema,
  WorkflowConditionRecordSchema,
  WorkflowDependencyRecordSchema,
  WorkflowEditRequestSchema,
  WorkflowSimulationRequestSchema,
  WorkflowTimelineRecordSchema,
  WorkflowValidationRecordSchema,
  WorkflowAnalyticsRecordSchema,
  WorkflowTemplateRecordSchema,
  type CommandSafetyLevel,
  type DemonstrationSemanticAction,
  type IntentCategory,
  type RecordedEventRecord,
  type WorkflowTimelineStep,
} from "@alexa-control/shared";

import { GovernanceError } from "../governance/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { IntentStore } from "../intent/store.js";
import type { IntentRecordingStore } from "./store.js";

const secretKeyPattern =
  /password|passwd|secret|token|cookie|credential|privateKey|recovery|otp|mfa|authorization/i;
const rawRecordingPattern =
  /mouse|coordinate|cursor|pixel|screenshot|screen|keyboard|keyCode|keyStroke|rawInput|rawAudio|rawVideo|cameraFrame|ocr|vision/i;

const parameterKeyPattern =
  /repository|repo|branch|application|app|url|workspace|folder|file|command|environment|user|date/i;

const containsSecretLikeKey = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value)) {
    if (secretKeyPattern.test(key)) return true;
    if (containsSecretLikeKey(child)) return true;
  }
  return false;
};

const containsRawRecordingKey = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value)) {
    if (rawRecordingPattern.test(key)) return true;
    if (containsRawRecordingKey(child)) return true;
  }
  return false;
};

const titleCase = (value: string) =>
  value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export class IntentRecordingService {
  constructor(
    readonly store: IntentRecordingStore,
    readonly intentStore: IntentStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    return CommandStudioResponseSchema.parse({
      recordings: await this.store.listRecordings(ownerId, 200),
      events: await this.store.listEvents(ownerId, null, 500),
      templates: await this.store.listTemplates(ownerId, 200),
      generatedCommands: await this.store.listGeneratedCommands(ownerId, 200),
      parameters: await this.store.listParameters(ownerId, 500),
      versions: await this.store.listVersions(ownerId, 200),
      analytics: await this.store.listAnalytics(ownerId, 200),
      demonstrationSessions: await this.store.listDemonstrationSessions(ownerId, 200),
      optimizationSuggestions: await this.store.listOptimizationSuggestions(
        ownerId,
        200,
      ),
      dependencies: await this.store.listDependencies(ownerId, 500),
      semanticRecordings: await this.store.listSemanticRecordings(ownerId, 200),
      workflowTimelines: await this.store.listWorkflowTimelines(ownerId, 200),
      generatedSkills: await this.store.listGeneratedSkills(ownerId, 200),
      skillParameters: await this.store.listSkillParameters(ownerId, 500),
      skillVersions: await this.store.listSkillVersions(ownerId, 200),
      skillUsage: await this.store.listSkillUsage(ownerId, 500),
      workflowValidation: await this.store.listWorkflowValidation(ownerId, 500),
      workflowConditions: await this.store.listWorkflowConditions(ownerId, 500),
      workflowDependencies: await this.store.listWorkflowDependencies(ownerId, 500),
      recordingActive: (await this.store.listRecordings(ownerId, 50)).some(
        (recording) => recording.status === "recording",
      ),
      semanticOnly: true,
      rawInputCaptured: false,
      commandsRequireReview: true,
      programmingByDemonstrationAvailable: true,
      macroRecordingAvailable: false,
      coordinatePlaybackAvailable: false,
      skillsRequireReview: true,
    });
  }

  async start(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = StartIntentRecordingRequestSchema.parse(input.body);
    const at = this.now().toISOString();
    const recording = IntentRecordingRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      name: parsed.name,
      description: parsed.description,
      status: "recording",
      primaryObjective: null,
      source: parsed.source,
      countdownSeconds: parsed.countdownSeconds,
      eventCount: 0,
      startedAt: at,
      stoppedAt: null,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveRecording(recording);
    await this.store.saveDemonstrationSession(
      DemonstrationSessionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        recordingId: recording.id,
        status: "active",
        observedEventCount: 0,
        inferredObjective: null,
        confidence: 0,
        lessons: ["Recording captures semantic capability events only."],
        startedAt: at,
        endedAt: null,
        updatedAt: at,
      }),
    );
    await this.store.saveSemanticRecording(
      SemanticRecordingRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        recordingId: recording.id,
        stage: parsed.countdownSeconds > 0 ? "countdown" : "recording",
        visibleStatus:
          parsed.countdownSeconds > 0
            ? `Recording starts in ${parsed.countdownSeconds} seconds.`
            : "Semantic recording is active.",
        semanticOnly: true,
        rawMouseCaptured: false,
        rawKeyboardCaptured: false,
        rawPixelsCaptured: false,
        rawAudioCaptured: false,
        rawCameraFramesCaptured: false,
        secureTextCaptured: false,
        startedAt: at,
        updatedAt: at,
      }),
    );
    await this.audit({
      eventType: "INTENT_RECORDING_STARTED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Intent recording started in semantic-only mode.",
      metadata: {
        recordingId: recording.id,
        rawInputCaptured: false,
        commandsRequireReview: true,
      },
      requestId: input.requestId,
    });
    await this.audit({
      eventType: "DEMONSTRATION_RECORDING_STARTED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Programming-by-demonstration recording started in semantic-only mode.",
      metadata: {
        recordingId: recording.id,
        macroRecordingAvailable: false,
        coordinatePlaybackAvailable: false,
      },
      requestId: input.requestId,
    });
    return this.dashboard(input.ownerId);
  }

  async recordEvent(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = RecordIntentEventRequestSchema.parse(input.body);
    if (containsSecretLikeKey(parsed.arguments)) {
      throw new GovernanceError(
        400,
        "SECRET_LIKE_RECORDING_ARGUMENT_DENIED",
        "Intent recording cannot store secret-like arguments.",
      );
    }
    if (containsRawRecordingKey(parsed.arguments)) {
      throw new GovernanceError(
        400,
        "RAW_DEMONSTRATION_INPUT_DENIED",
        "Demonstration learning cannot store mouse coordinates, pixels, screenshots, raw keyboard, OCR, vision, camera, or audio payloads.",
      );
    }
    const recording = await this.store.getRecording(input.ownerId, parsed.recordingId);
    if (!recording || recording.status !== "recording") {
      throw new GovernanceError(
        409,
        "NO_ACTIVE_INTENT_RECORDING",
        "No active intent recording exists for this event.",
      );
    }
    const existing = await this.store.listEvents(input.ownerId, recording.id, 500);
    const at = this.now().toISOString();
    const event = RecordedEventRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      recordingId: recording.id,
      sequence: existing.length + 1,
      source: parsed.source,
      type: parsed.type,
      capabilityId: parsed.capabilityId ?? null,
      title: parsed.title,
      semanticSummary: parsed.semanticSummary,
      arguments: parsed.arguments,
      status: parsed.status,
      dependsOnEventIds: parsed.dependsOnEventIds,
      occurredAt: at,
      durationMs: parsed.durationMs,
      redacted: true,
      rawInputCaptured: false,
    });
    await this.store.saveEvent(event);
    await this.store.saveRecording(
      IntentRecordingRecordSchema.parse({
        ...recording,
        eventCount: existing.length + 1,
        updatedAt: at,
      }),
    );
    await this.audit({
      eventType: "INTENT_RECORDING_EVENT_RECORDED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Semantic recording event captured.",
      metadata: {
        recordingId: recording.id,
        eventId: event.id,
        source: event.source,
        type: event.type,
        rawInputCaptured: false,
      },
      requestId: input.requestId,
    });
    await this.audit({
      eventType: "SEMANTIC_DEMONSTRATION_EVENT_RECORDED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Semantic programming-by-demonstration event captured.",
      metadata: {
        recordingId: recording.id,
        eventId: event.id,
        semanticAction: semanticActionFor(event),
        rawMouseCaptured: false,
        rawKeyboardCaptured: false,
        rawPixelsCaptured: false,
      },
      requestId: input.requestId,
    });
    return this.dashboard(input.ownerId);
  }

  async stop(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = StopIntentRecordingRequestSchema.parse(input.body);
    const recording = await this.store.getRecording(input.ownerId, parsed.recordingId);
    if (!recording || recording.status !== "recording") {
      throw new GovernanceError(
        409,
        "NO_ACTIVE_INTENT_RECORDING",
        "No active intent recording can be stopped.",
      );
    }
    const events = await this.store.listEvents(input.ownerId, recording.id, 500);
    const at = this.now().toISOString();
    const objective =
      parsed.primaryObjective ??
      this.inferObjective(recording.name, events) ??
      "Replay the demonstrated semantic workflow with governed capabilities.";
    await this.store.saveRecording(
      IntentRecordingRecordSchema.parse({
        ...recording,
        status: "review_required",
        primaryObjective: objective,
        stoppedAt: at,
        updatedAt: at,
      }),
    );
    await this.synthesize(input.ownerId, recording.id, objective, events, at);
    await this.synthesizeDemonstratedSkill(
      input.ownerId,
      recording.id,
      objective,
      events,
      at,
    );
    await this.audit({
      eventType: "INTENT_RECORDING_STOPPED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Intent recording stopped and synthesized for review.",
      metadata: { recordingId: recording.id, eventCount: events.length },
      requestId: input.requestId,
    });
    return this.dashboard(input.ownerId);
  }

  async saveGeneratedSkill(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = SkillSaveRequestSchema.parse(input.body);
    const skill = await this.store.getGeneratedSkill(input.ownerId, parsed.skillId);
    if (!skill || !["review_required", "approved"].includes(skill.status)) {
      throw new GovernanceError(
        409,
        "DEMONSTRATED_SKILL_NOT_REVIEWABLE",
        "Demonstrated skill must exist and be waiting for review.",
      );
    }
    const at = this.now().toISOString();
    const saved = GeneratedSkillRecordSchema.parse({
      ...skill,
      name: parsed.name ?? skill.name,
      description: parsed.description ?? skill.description,
      status: "saved",
      plannerAvailable: parsed.plannerAvailable,
      updatedAt: at,
    });
    await this.store.saveGeneratedSkill(saved);
    await this.store.saveSkillVersion(
      SkillVersionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        skillId: saved.id,
        version: saved.version,
        timelineId: saved.timelineId,
        changeSummary: "Demonstrated skill reviewed and saved to the Skill Registry.",
        createdAt: at,
      }),
    );
    await this.audit({
      eventType: "DEMONSTRATED_SKILL_SAVED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Demonstrated skill saved after review.",
      requestId: input.requestId,
      metadata: {
        skillId: saved.id,
        plannerAvailable: saved.plannerAvailable,
        automaticExecutionGranted: false,
      },
    });
    return this.dashboard(input.ownerId);
  }

  async validateWorkflow(input: {
    ownerId: string;
    skillId?: string;
    recordingId?: string;
    requestId: string;
    ipAddress: string;
  }) {
    const at = this.now().toISOString();
    const skill = input.skillId
      ? await this.store.getGeneratedSkill(input.ownerId, input.skillId)
      : null;
    const timelines = await this.store.listWorkflowTimelines(input.ownerId, 200);
    const timeline =
      (skill
        ? timelines.find((item) => item.id === skill.timelineId)
        : timelines.find((item) => item.recordingId === input.recordingId)) ?? null;
    const warnings = [
      ...(timeline && timeline.steps.length > 0
        ? []
        : ["Workflow has no semantic timeline steps."]),
      ...(skill && skill.capabilityIds.length === 0
        ? ["Workflow has no registered capability dependencies."]
        : []),
    ];
    const status = warnings.length ? "warning" : "passed";
    const validation = WorkflowValidationRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      recordingId: input.recordingId ?? skill?.recordingId ?? null,
      skillId: skill?.id ?? input.skillId ?? null,
      status,
      targetCheck: timeline && timeline.steps.length > 0 ? "passed" : "warning",
      capabilityCheck: !skill || skill.capabilityIds.length > 0 ? "passed" : "warning",
      dependencyCheck: "passed",
      parameterCheck: "passed",
      warnings,
      validatedAt: at,
    });
    await this.store.saveWorkflowValidation(validation);
    await this.audit({
      eventType: "DEMONSTRATION_WORKFLOW_VALIDATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Demonstrated workflow validated through semantic records.",
      requestId: input.requestId,
      metadata: { skillId: skill?.id ?? null, status },
    });
    return this.dashboard(input.ownerId);
  }

  async editWorkflow(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = WorkflowEditRequestSchema.parse(input.body);
    const skill = await this.store.getGeneratedSkill(input.ownerId, parsed.skillId);
    if (!skill || skill.status === "archived") {
      throw new GovernanceError(
        404,
        "DEMONSTRATED_SKILL_NOT_FOUND",
        "Skill not found.",
      );
    }
    const at = this.now().toISOString();
    if (parsed.operation === "add_condition" || parsed.operation === "add_approval") {
      await this.store.saveWorkflowCondition(
        WorkflowConditionRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          skillId: skill.id,
          stepId: parsed.stepId,
          conditionType:
            parsed.operation === "add_approval" ? "approval_checkpoint" : "if",
          expression:
            typeof parsed.input.expression === "string"
              ? parsed.input.expression
              : "Owner-reviewed condition.",
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
    await this.store.saveSkillVersion(
      SkillVersionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        skillId: skill.id,
        version: skill.version,
        timelineId: skill.timelineId,
        changeSummary: `Workflow editor operation recorded: ${parsed.operation}.`,
        createdAt: at,
      }),
    );
    await this.audit({
      eventType: "DEMONSTRATED_SKILL_EDITED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Workflow editor recorded a reviewable semantic edit.",
      requestId: input.requestId,
      metadata: { skillId: skill.id, operation: parsed.operation },
    });
    return this.dashboard(input.ownerId);
  }

  async simulateWorkflow(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = WorkflowSimulationRequestSchema.parse(input.body);
    const skill = await this.store.getGeneratedSkill(input.ownerId, parsed.skillId);
    if (!skill) {
      throw new GovernanceError(
        404,
        "DEMONSTRATED_SKILL_NOT_FOUND",
        "Skill not found.",
      );
    }
    const at = this.now().toISOString();
    await this.store.saveSkillUsage(
      SkillUsageRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        skillId: skill.id,
        origin: parsed.origin,
        status: "simulated",
        durationMs: 0,
        executedAt: at,
      }),
    );
    await this.audit({
      eventType: "DEMONSTRATED_SKILL_SIMULATED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Demonstrated skill simulated without executing desktop actions.",
      requestId: input.requestId,
      metadata: { skillId: skill.id, origin: parsed.origin, executed: false },
    });
    return this.dashboard(input.ownerId);
  }

  async saveGeneratedCommand(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = SaveGeneratedCommandRequestSchema.parse(input.body);
    const generated = await this.store.getGeneratedCommand(
      input.ownerId,
      parsed.generatedCommandId,
    );
    if (!generated || generated.status !== "review_required") {
      throw new GovernanceError(
        409,
        "GENERATED_COMMAND_NOT_REVIEWABLE",
        "Generated command must exist and be waiting for review.",
      );
    }
    const at = this.now().toISOString();
    const saved = SavedCommandRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      name: parsed.name ?? generated.name,
      requestTemplate: parsed.requestTemplate ?? generated.requestTemplate,
      pinned: parsed.pinned,
      favorite: parsed.favorite,
      version: generated.version,
      createdAt: at,
      updatedAt: at,
    });
    await this.intentStore.saveSavedCommand(saved);
    await this.intentStore.saveTemplate(
      CommandTemplateRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        name: saved.name,
        category: this.categoryFor(generated.requestTemplate),
        template: saved.requestTemplate,
        version: saved.version,
        createdAt: at,
        updatedAt: at,
      }),
    );
    await this.store.saveGeneratedCommand(
      GeneratedCommandRecordSchema.parse({
        ...generated,
        savedCommandId: saved.id,
        name: saved.name,
        requestTemplate: saved.requestTemplate,
        status: "saved",
        updatedAt: at,
      }),
    );
    await this.store.saveVersion(
      CommandVersionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        generatedCommandId: generated.id,
        version: generated.version,
        changeSummary: "Generated command reviewed and published to command library.",
        rollbackAvailable: true,
        createdAt: at,
      }),
    );
    await this.audit({
      eventType: "GENERATED_COMMAND_SAVED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Generated command saved after explicit review.",
      metadata: {
        generatedCommandId: generated.id,
        savedCommandId: saved.id,
        riskLevel: generated.riskLevel,
      },
      requestId: input.requestId,
    });
    return this.dashboard(input.ownerId);
  }

  private async synthesize(
    ownerId: string,
    recordingId: string,
    objective: string,
    events: RecordedEventRecord[],
    at: string,
  ) {
    const category = this.categoryFor(objective);
    const riskLevel = this.riskFor(events, objective);
    const template = WorkflowTemplateRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      recordingId,
      name: titleCase(objective).slice(0, 160),
      objective,
      category,
      stepEventIds: events.map((event) => event.id),
      reusable: events.length > 0,
      confidence:
        events.length === 0 ? 0.3 : Math.min(0.9, 0.55 + events.length * 0.06),
      riskLevel,
      validationSummary:
        "Synthesis validates semantic event structure only. Execution still routes through the Intent Engine and governed providers.",
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveTemplate(template);
    const generatedId = crypto.randomUUID();
    const parameters = this.parametersFor(ownerId, generatedId, events, at);
    for (const parameter of parameters) await this.store.saveParameter(parameter);
    const capabilityIds = [
      ...new Set(
        events.flatMap((event) => (event.capabilityId ? [event.capabilityId] : [])),
      ),
    ];
    const requestTemplate = this.requestTemplateFor(objective, events, parameters);
    const generated = GeneratedCommandRecordSchema.parse({
      id: generatedId,
      ownerId,
      recordingId,
      templateId: template.id,
      savedCommandId: null,
      name: template.name,
      description:
        "Generated from a semantic demonstration. Review parameters and risks before saving.",
      requestTemplate,
      status: "review_required",
      riskLevel,
      approvalRequired: ["moderate_risk", "high_risk", "critical"].includes(riskLevel),
      capabilityIds,
      parameterIds: parameters.map((parameter) => parameter.id),
      version: "1.0.0",
      usageCount: 0,
      successRate: 0,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveGeneratedCommand(generated);
    await this.store.saveVersion(
      CommandVersionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        generatedCommandId: generated.id,
        version: generated.version,
        changeSummary: "Initial command synthesized from demonstration.",
        rollbackAvailable: false,
        createdAt: at,
      }),
    );
    await this.store.saveAnalytics(
      WorkflowAnalyticsRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        generatedCommandId: generated.id,
        recordingId,
        executionFrequency: 0,
        successRate: 0,
        averageDurationMs: events.reduce((total, event) => total + event.durationMs, 0),
        failureCount: events.filter((event) => event.status === "failed").length,
        parameterReuseRate: parameters.length ? 0.5 : 0,
        measuredAt: at,
      }),
    );
    for (const capabilityId of capabilityIds) {
      await this.store.saveDependency(
        CommandDependencyRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          generatedCommandId: generated.id,
          dependencyType: "capability",
          dependencyId: capabilityId,
          required: true,
          health: "unknown",
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
    if (events.length > 3 || parameters.length > 0) {
      await this.store.saveOptimizationSuggestion(
        OptimizationSuggestionRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          generatedCommandId: generated.id,
          recordingId,
          title: parameters.length
            ? "Review inferred parameters"
            : "Consider extracting a reusable sub-workflow",
          rationale:
            "Demonstration synthesis found repeated or variable workflow structure. Any optimization requires approval.",
          impact: parameters.length ? "medium" : "low",
          confidence: 0.68,
          approvalRequired: true,
          status: "open",
          createdAt: at,
        }),
      );
      await this.audit({
        eventType: "COMMAND_OPTIMIZATION_SUGGESTED",
        ownerId,
        ipAddress: "system",
        outcome: "SUCCESS",
        reason: "Advisory optimization generated from demonstration.",
        metadata: { generatedCommandId: generated.id, automaticMutation: false },
        requestId: "system",
      });
    }
    await this.audit({
      eventType: "WORKFLOW_SYNTHESIZED",
      ownerId,
      ipAddress: "system",
      outcome: "SUCCESS",
      reason: "Semantic workflow synthesized from demonstration for review.",
      metadata: {
        recordingId,
        generatedCommandId: generated.id,
        parameterCount: parameters.length,
        riskLevel,
      },
      requestId: "system",
    });
  }

  private async synthesizeDemonstratedSkill(
    ownerId: string,
    recordingId: string,
    objective: string,
    events: RecordedEventRecord[],
    at: string,
  ) {
    const category = this.categoryFor(objective);
    const steps = events.map((event, index) => timelineStepFor(event, index + 1));
    const timeline = WorkflowTimelineRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      recordingId,
      generatedSkillId: null,
      objective,
      steps,
      deterministic: true,
      coordinatePlaybackGenerated: false,
      generatedAt: at,
      updatedAt: at,
    });
    await this.store.saveWorkflowTimeline(timeline);
    const skillId = crypto.randomUUID();
    const skillParameters = skillParametersFor(ownerId, skillId, steps, at);
    const capabilityIds = [
      ...new Set(
        steps.flatMap((step) => (step.capabilityId ? [step.capabilityId] : [])),
      ),
    ];
    const dependencies = capabilityIds.map((capabilityId) =>
      WorkflowDependencyRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        skillId,
        dependencyType: "capability",
        dependencyId: capabilityId,
        required: true,
        health: "unknown",
        createdAt: at,
        updatedAt: at,
      }),
    );
    const skill = GeneratedSkillRecordSchema.parse({
      id: skillId,
      ownerId,
      recordingId,
      timelineId: timeline.id,
      name: titleCase(objective).slice(0, 160),
      description:
        "Reusable skill generated from semantic programming by demonstration. Review before saving.",
      category,
      status: "review_required",
      capabilityIds,
      dependencyIds: dependencies.map((dependency) => dependency.id),
      parameterIds: skillParameters.map((parameter) => parameter.id),
      permissionIds: ["owner_review_required"],
      version: "1.0.0",
      plannerAvailable: false,
      semanticEmbeddingVersion: `deterministic:${recordingId.slice(0, 8)}`,
      usageCount: 0,
      successRate: 0,
      lastExecutionAt: null,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveGeneratedSkill(skill);
    await this.store.saveWorkflowTimeline(
      WorkflowTimelineRecordSchema.parse({
        ...timeline,
        generatedSkillId: skill.id,
        updatedAt: at,
      }),
    );
    for (const parameter of skillParameters) {
      await this.store.saveSkillParameter(parameter);
    }
    for (const dependency of dependencies) {
      await this.store.saveWorkflowDependency(dependency);
    }
    await this.store.saveSkillVersion(
      SkillVersionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        skillId: skill.id,
        version: skill.version,
        timelineId: timeline.id,
        changeSummary: "Initial demonstrated skill generated from semantic timeline.",
        createdAt: at,
      }),
    );
    await this.store.saveWorkflowValidation(
      WorkflowValidationRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        recordingId,
        skillId: skill.id,
        status: steps.length ? "passed" : "warning",
        targetCheck: steps.length ? "passed" : "warning",
        capabilityCheck: "passed",
        dependencyCheck: "passed",
        parameterCheck: "passed",
        warnings: steps.length ? [] : ["No semantic steps were recorded."],
        validatedAt: at,
      }),
    );
    await this.audit({
      eventType: "DEMONSTRATION_WORKFLOW_GENERATED",
      ownerId,
      ipAddress: "system",
      outcome: "SUCCESS",
      reason:
        "Reusable demonstrated skill generated from semantic actions without coordinate playback.",
      requestId: "system",
      metadata: {
        recordingId,
        skillId: skill.id,
        timelineId: timeline.id,
        parameterCount: skillParameters.length,
        coordinatePlaybackGenerated: false,
      },
    });
  }

  private parametersFor(
    ownerId: string,
    generatedCommandId: string,
    events: RecordedEventRecord[],
    at: string,
  ) {
    const byName = new Map<string, { value: unknown; eventIds: string[] }>();
    for (const event of events) {
      for (const [key, value] of Object.entries(event.arguments)) {
        if (!parameterKeyPattern.test(key) || secretKeyPattern.test(key)) continue;
        const normalized = key.replace(/Id$/i, "").replace(/[^a-z0-9_]/gi, "_");
        const current = byName.get(normalized) ?? { value, eventIds: [] };
        current.eventIds.push(event.id);
        byName.set(normalized, current);
      }
    }
    return [...byName.entries()].slice(0, 20).map(([name, details]) =>
      CommandParameterRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        generatedCommandId,
        name,
        label: titleCase(name),
        valueType: this.valueTypeFor(details.value),
        required: true,
        defaultValue: details.value,
        source: "ask_each_execution",
        validationRules: ["Validate server-side before routing."],
        detectedFromEventIds: details.eventIds,
        createdAt: at,
        updatedAt: at,
      }),
    );
  }

  private requestTemplateFor(
    objective: string,
    events: RecordedEventRecord[],
    parameters: Array<{ name: string }>,
  ) {
    const stepText = events
      .slice(0, 12)
      .map((event, index) => `${index + 1}. ${event.semanticSummary}`)
      .join(" ");
    const parameterText = parameters.length
      ? ` Ask for parameters: ${parameters.map((parameter) => `{${parameter.name}}`).join(", ")}.`
      : "";
    return `${objective}.${parameterText} Use this demonstrated semantic workflow: ${stepText}`;
  }

  private inferObjective(name: string, events: RecordedEventRecord[]) {
    if (events.length === 0) return name;
    const first = events[0]?.title ?? name;
    const last = events.at(-1)?.title ?? first;
    return `${first} through ${last}`;
  }

  private valueTypeFor(value: unknown) {
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return "url";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
    if (typeof value === "string" && /^[0-9a-f-]{20,}$/i.test(value)) return "id";
    if (typeof value === "string") return "string";
    return "json";
  }

  private categoryFor(value: string): IntentCategory {
    const lower = value.toLowerCase();
    if (/repository|repo|branch|git/.test(lower)) return "repository_operations";
    if (/browser|url|tab|navigate/.test(lower)) return "research";
    if (/window|application|app|focus|launch/.test(lower)) return "application_control";
    if (/workflow|automation|routine/.test(lower)) return "automation";
    if (/voice|gesture|dashboard|command/.test(lower)) return "productivity";
    return "custom_user_command";
  }

  private riskFor(
    events: RecordedEventRecord[],
    objective: string,
  ): CommandSafetyLevel {
    const combined =
      `${objective} ${events.map((event) => event.semanticSummary).join(" ")}`.toLowerCase();
    if (/delete|payment|bank|secret|credential|sudo|admin/.test(combined))
      return "critical";
    if (/deploy|send|publish|merge|write|mutation/.test(combined)) return "high_risk";
    if (
      events.some(
        (event) =>
          event.source === "desktop_capability" || event.source === "integration",
      )
    )
      return "moderate_risk";
    if (events.some((event) => event.source === "browser_capability"))
      return "read_only";
    return "low_risk";
  }
}

const semanticActionFor = (
  event: Pick<RecordedEventRecord, "type" | "source" | "title" | "semanticSummary">,
): DemonstrationSemanticAction => {
  const combined =
    `${event.type} ${event.source} ${event.title} ${event.semanticSummary}`.toLowerCase();
  if (/open.*app|application opened|launch/.test(combined)) return "open_application";
  if (/focus.*window|window focused/.test(combined)) return "focus_window";
  if (/panel/.test(combined)) return "select_panel";
  if (/button|clicked|click/.test(combined)) return "select_button";
  if (/field|input|updated|set value|fill/.test(combined)) return "fill_field";
  if (/dropdown|selected option|choose/.test(combined)) return "choose_dropdown";
  if (/checkbox|toggle/.test(combined)) return "toggle_checkbox";
  if (/radio/.test(combined)) return "choose_radio";
  if (/menu/.test(combined)) return "open_menu";
  if (/dialog|confirm|accept/.test(combined)) return "confirm_dialog";
  if (/submit|form submitted/.test(combined)) return "submit_form";
  if (/wait|ready|condition/.test(combined)) return "wait_for_condition";
  if (event.source === "planner") return "planner_action";
  if (event.source === "gesture") return "gesture_invocation";
  if (event.source === "voice") return "voice_invocation";
  if (event.type === "intent_submitted") return "command_execution";
  return "capability_invocation";
};

const timelineStepFor = (
  event: RecordedEventRecord,
  sequence: number,
): WorkflowTimelineStep =>
  ({
    id: crypto.randomUUID(),
    sequence,
    timestamp: event.occurredAt,
    semanticAction: semanticActionFor(event),
    capabilityId: event.capabilityId,
    target:
      typeof event.arguments.target === "string"
        ? event.arguments.target
        : typeof event.arguments.elementLabel === "string"
          ? event.arguments.elementLabel
          : event.title,
    arguments: event.arguments,
    dependencies: event.dependsOnEventIds,
    executionStatus: event.status,
    verification:
      event.status === "failed"
        ? "Observed event failed during demonstration."
        : "Observed semantic event is replayable only through governed capabilities.",
  }) satisfies WorkflowTimelineStep;

const skillParametersFor = (
  ownerId: string,
  skillId: string,
  steps: WorkflowTimelineStep[],
  at: string,
) => {
  const candidates = new Map<string, { value: unknown; stepIds: string[] }>();
  for (const step of steps) {
    for (const [key, value] of Object.entries(step.arguments)) {
      if (!parameterKeyPattern.test(key) || secretKeyPattern.test(key)) continue;
      const normalized = key
        .replace(/Id$/i, "")
        .replace(/[^a-z0-9_]/gi, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
      const current = candidates.get(normalized) ?? { value, stepIds: [] };
      current.stepIds.push(step.id);
      candidates.set(normalized, current);
    }
  }
  return [...candidates.entries()].slice(0, 20).map(([name, details]) =>
    SkillParameterRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      skillId,
      name,
      label: titleCase(name),
      description:
        "Detected from semantic demonstration. Owner chooses whether to ask, infer, compute, or keep the recorded value.",
      valueType: skillValueTypeFor(name, details.value),
      required: true,
      defaultValue: details.value,
      source: "ask_each_execution",
      validationRules: ["Validate value before skill execution."],
      detectedFromStepIds: details.stepIds,
      createdAt: at,
      updatedAt: at,
    }),
  );
};

const skillValueTypeFor = (name: string, value: unknown) => {
  if (/repository|repo/.test(name)) return "repository";
  if (/workspace/.test(name)) return "workspace";
  if (/application|app/.test(name)) return "application";
  if (/environment|env/.test(name)) return "environment";
  if (/folder/.test(name)) return "folder";
  if (/file/.test(name)) return "file";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return "url";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
  if (typeof value === "string") return "string";
  return "json";
};
