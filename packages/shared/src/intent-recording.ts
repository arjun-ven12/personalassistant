import { z } from "zod";

import { CommandSafetyLevelSchema, IntentCategorySchema } from "./intent.js";

export const IntentRecordingStatusSchema = z.enum([
  "countdown",
  "recording",
  "stopped",
  "analysing",
  "review_required",
  "saved",
  "cancelled",
  "failed",
  "archived",
]);

export const RecordedEventSourceSchema = z.enum([
  "desktop_capability",
  "semantic_interaction",
  "planner",
  "intent_engine",
  "browser_capability",
  "gesture",
  "voice",
  "agent",
  "workflow",
  "integration",
  "dashboard",
]);

export const RecordedEventTypeSchema = z.enum([
  "capability_invoked",
  "semantic_interaction",
  "application_opened",
  "window_focused",
  "panel_selected",
  "button_clicked",
  "field_updated",
  "dropdown_selected",
  "checkbox_toggled",
  "menu_opened",
  "dialog_confirmed",
  "form_submitted",
  "wait_condition",
  "intent_submitted",
  "planner_step_created",
  "application_focused",
  "window_interaction",
  "browser_navigation",
  "gesture_confirmed",
  "voice_command",
  "agent_message",
  "workflow_event",
  "execution_result",
  "semantic_note",
]);

export const WorkflowVariableSourceSchema = z.enum([
  "recorded_value",
  "ask_each_execution",
  "current_context",
  "computed",
  "default",
]);

export const CommandReviewStatusSchema = z.enum([
  "draft",
  "review_required",
  "approved",
  "saved",
  "rejected",
  "archived",
]);

export const IntentRecordingRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(160),
    description: z.string().min(1).max(1_000),
    status: IntentRecordingStatusSchema,
    primaryObjective: z.string().min(1).max(1_000).nullable(),
    source: z.enum(["dashboard", "voice", "gesture", "api"]),
    countdownSeconds: z.number().int().min(0).max(30),
    eventCount: z.number().int().nonnegative(),
    startedAt: z.iso.datetime().nullable(),
    stoppedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const RecordedEventRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    recordingId: z.string().uuid(),
    sequence: z.number().int().positive(),
    source: RecordedEventSourceSchema,
    type: RecordedEventTypeSchema,
    capabilityId: z.string().min(1).max(160).nullable(),
    title: z.string().min(1).max(240),
    semanticSummary: z.string().min(1).max(1_000),
    arguments: z.record(z.string().min(1).max(80), z.json()).default({}),
    status: z.enum(["observed", "succeeded", "failed", "skipped"]),
    dependsOnEventIds: z.array(z.string().uuid()).max(20),
    occurredAt: z.iso.datetime(),
    durationMs: z.number().int().nonnegative(),
    redacted: z.literal(true),
    rawInputCaptured: z.literal(false),
  })
  .strict();

export const WorkflowTemplateRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    recordingId: z.string().uuid(),
    name: z.string().min(1).max(160),
    objective: z.string().min(1).max(1_000),
    category: IntentCategorySchema,
    stepEventIds: z.array(z.string().uuid()).max(100),
    reusable: z.boolean(),
    confidence: z.number().min(0).max(1),
    riskLevel: CommandSafetyLevelSchema,
    validationSummary: z.string().min(1).max(1_000),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const GeneratedCommandRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    recordingId: z.string().uuid(),
    templateId: z.string().uuid(),
    savedCommandId: z.string().uuid().nullable(),
    name: z.string().min(1).max(160),
    description: z.string().min(1).max(1_000),
    requestTemplate: z.string().min(1).max(4_000),
    status: CommandReviewStatusSchema,
    riskLevel: CommandSafetyLevelSchema,
    approvalRequired: z.boolean(),
    capabilityIds: z.array(z.string().min(1).max(160)).max(100),
    parameterIds: z.array(z.string().uuid()).max(100),
    version: z.string().min(1).max(40),
    usageCount: z.number().int().nonnegative(),
    successRate: z.number().min(0).max(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CommandParameterRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    generatedCommandId: z.string().uuid(),
    name: z.string().min(1).max(80),
    label: z.string().min(1).max(160),
    valueType: z.enum(["string", "number", "boolean", "date", "url", "id", "json"]),
    required: z.boolean(),
    defaultValue: z.json().nullable(),
    source: WorkflowVariableSourceSchema,
    validationRules: z.array(z.string().min(1).max(240)).max(20),
    detectedFromEventIds: z.array(z.string().uuid()).max(50),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CommandVersionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    generatedCommandId: z.string().uuid(),
    version: z.string().min(1).max(40),
    changeSummary: z.string().min(1).max(1_000),
    rollbackAvailable: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const WorkflowAnalyticsRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    generatedCommandId: z.string().uuid().nullable(),
    recordingId: z.string().uuid().nullable(),
    executionFrequency: z.number().int().nonnegative(),
    successRate: z.number().min(0).max(1),
    averageDurationMs: z.number().nonnegative(),
    failureCount: z.number().int().nonnegative(),
    parameterReuseRate: z.number().min(0).max(1),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const DemonstrationSessionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    recordingId: z.string().uuid(),
    status: z.enum(["active", "completed", "cancelled", "failed"]),
    observedEventCount: z.number().int().nonnegative(),
    inferredObjective: z.string().min(1).max(1_000).nullable(),
    confidence: z.number().min(0).max(1),
    lessons: z.array(z.string().min(1).max(500)).max(20),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const OptimizationSuggestionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    generatedCommandId: z.string().uuid().nullable(),
    recordingId: z.string().uuid().nullable(),
    title: z.string().min(1).max(160),
    rationale: z.string().min(1).max(1_000),
    impact: z.enum(["low", "medium", "high"]),
    confidence: z.number().min(0).max(1),
    approvalRequired: z.literal(true),
    status: z.enum(["open", "accepted", "rejected", "archived"]),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const CommandDependencyRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    generatedCommandId: z.string().uuid(),
    dependencyType: z.enum([
      "capability",
      "integration",
      "application",
      "workspace",
      "approval",
      "profile",
    ]),
    dependencyId: z.string().min(1).max(200),
    required: z.boolean(),
    health: z.enum(["ready", "missing", "unavailable", "unknown"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DemonstrationStageSchema = z.enum([
  "create_skill",
  "countdown",
  "recording",
  "review",
  "approved",
  "saved",
  "cancelled",
  "failed",
]);

export const DemonstrationSemanticActionSchema = z.enum([
  "open_application",
  "focus_window",
  "select_panel",
  "select_button",
  "fill_field",
  "choose_dropdown",
  "toggle_checkbox",
  "choose_radio",
  "open_menu",
  "confirm_dialog",
  "submit_form",
  "planner_action",
  "capability_invocation",
  "command_execution",
  "gesture_invocation",
  "voice_invocation",
  "wait_for_condition",
]);

export const DemonstrationVariableSourceSchema = z.enum([
  "always_use_recorded_value",
  "ask_each_execution",
  "infer_from_current_context",
  "computed",
  "default",
]);

export const DemonstrationVariableTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "date",
  "url",
  "application",
  "workspace",
  "repository",
  "file",
  "folder",
  "environment",
  "json",
]);

export const SemanticRecordingRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    recordingId: z.string().uuid(),
    stage: DemonstrationStageSchema,
    visibleStatus: z.string().min(1).max(240),
    semanticOnly: z.literal(true),
    rawMouseCaptured: z.literal(false),
    rawKeyboardCaptured: z.literal(false),
    rawPixelsCaptured: z.literal(false),
    rawAudioCaptured: z.literal(false),
    rawCameraFramesCaptured: z.literal(false),
    secureTextCaptured: z.literal(false),
    startedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const WorkflowTimelineStepSchema = z
  .object({
    id: z.string().uuid(),
    sequence: z.number().int().positive(),
    timestamp: z.iso.datetime(),
    semanticAction: DemonstrationSemanticActionSchema,
    capabilityId: z.string().min(1).max(160).nullable(),
    target: z.string().min(1).max(240),
    arguments: z.record(z.string().min(1).max(80), z.json()).default({}),
    dependencies: z.array(z.string().uuid()).max(20),
    executionStatus: z.enum(["observed", "succeeded", "failed", "skipped"]),
    verification: z.string().min(1).max(500),
  })
  .strict();

export const WorkflowTimelineRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    recordingId: z.string().uuid(),
    generatedSkillId: z.string().uuid().nullable(),
    objective: z.string().min(1).max(1_000),
    steps: z.array(WorkflowTimelineStepSchema).max(200),
    deterministic: z.literal(true),
    coordinatePlaybackGenerated: z.literal(false),
    generatedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const GeneratedSkillRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    recordingId: z.string().uuid(),
    timelineId: z.string().uuid(),
    name: z.string().min(1).max(160),
    description: z.string().min(1).max(1_000),
    category: IntentCategorySchema,
    status: z.enum([
      "draft",
      "review_required",
      "approved",
      "saved",
      "rejected",
      "archived",
    ]),
    capabilityIds: z.array(z.string().min(1).max(160)).max(100),
    dependencyIds: z.array(z.string().uuid()).max(100),
    parameterIds: z.array(z.string().uuid()).max(100),
    permissionIds: z.array(z.string().min(1).max(160)).max(100),
    version: z.string().min(1).max(40),
    plannerAvailable: z.boolean(),
    semanticEmbeddingVersion: z.string().min(1).max(80),
    usageCount: z.number().int().nonnegative(),
    successRate: z.number().min(0).max(1),
    lastExecutionAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SkillParameterRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    skillId: z.string().uuid(),
    name: z.string().min(1).max(80),
    label: z.string().min(1).max(160),
    description: z.string().min(1).max(500),
    valueType: DemonstrationVariableTypeSchema,
    required: z.boolean(),
    defaultValue: z.json().nullable(),
    source: DemonstrationVariableSourceSchema,
    validationRules: z.array(z.string().min(1).max(240)).max(20),
    detectedFromStepIds: z.array(z.string().uuid()).max(50),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const SkillVersionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    skillId: z.string().uuid(),
    version: z.string().min(1).max(40),
    timelineId: z.string().uuid(),
    changeSummary: z.string().min(1).max(1_000),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const SkillUsageRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    skillId: z.string().uuid(),
    origin: z.enum(["planner", "agent", "voice", "gesture", "dashboard", "command"]),
    status: z.enum(["simulated", "completed", "failed", "denied"]),
    durationMs: z.number().int().nonnegative(),
    executedAt: z.iso.datetime(),
  })
  .strict();

export const WorkflowValidationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    recordingId: z.string().uuid().nullable(),
    skillId: z.string().uuid().nullable(),
    status: z.enum(["passed", "warning", "failed"]),
    targetCheck: z.enum(["passed", "warning", "failed"]),
    capabilityCheck: z.enum(["passed", "warning", "failed"]),
    dependencyCheck: z.enum(["passed", "warning", "failed"]),
    parameterCheck: z.enum(["passed", "warning", "failed"]),
    warnings: z.array(z.string().min(1).max(500)).max(50),
    validatedAt: z.iso.datetime(),
  })
  .strict();

export const WorkflowConditionRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    skillId: z.string().uuid(),
    stepId: z.string().uuid().nullable(),
    conditionType: z.enum([
      "if",
      "else",
      "wait",
      "retry",
      "timeout",
      "repeat",
      "loop",
      "parallel",
      "approval_checkpoint",
    ]),
    expression: z.string().min(1).max(500),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const WorkflowDependencyRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    skillId: z.string().uuid(),
    dependencyType: z.enum([
      "capability",
      "application",
      "workspace",
      "semantic_object",
      "approval",
      "skill",
    ]),
    dependencyId: z.string().min(1).max(200),
    required: z.boolean(),
    health: z.enum(["ready", "missing", "unavailable", "unknown"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const WorkflowEditRequestSchema = z
  .object({
    skillId: z.string().uuid(),
    operation: z.enum([
      "rename_step",
      "delete_step",
      "insert_step",
      "reorder_step",
      "replace_capability",
      "edit_parameter",
      "add_condition",
      "add_approval",
      "add_delay",
      "undo",
      "redo",
    ]),
    stepId: z.string().uuid().nullable().default(null),
    input: z.record(z.string().min(1).max(80), z.json()).default({}),
  })
  .strict();

export const SkillSaveRequestSchema = z
  .object({
    skillId: z.string().uuid(),
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().min(1).max(1_000).optional(),
    plannerAvailable: z.boolean().default(true),
  })
  .strict();

export const WorkflowSimulationRequestSchema = z
  .object({
    skillId: z.string().uuid(),
    origin: z
      .enum(["planner", "agent", "voice", "gesture", "dashboard", "command"])
      .default("dashboard"),
  })
  .strict();

export const StartIntentRecordingRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(1_000).default("Recorded workflow"),
    source: z.enum(["dashboard", "voice", "gesture", "api"]).default("dashboard"),
    countdownSeconds: z.number().int().min(0).max(30).default(3),
  })
  .strict();

export const RecordIntentEventRequestSchema = z
  .object({
    recordingId: z.string().uuid(),
    source: RecordedEventSourceSchema,
    type: RecordedEventTypeSchema,
    capabilityId: z.string().min(1).max(160).nullable().optional(),
    title: z.string().trim().min(1).max(240),
    semanticSummary: z.string().trim().min(1).max(1_000),
    arguments: z.record(z.string().min(1).max(80), z.json()).default({}),
    status: z.enum(["observed", "succeeded", "failed", "skipped"]).default("observed"),
    dependsOnEventIds: z.array(z.string().uuid()).max(20).default([]),
    durationMs: z.number().int().nonnegative().default(0),
  })
  .strict();

export const StopIntentRecordingRequestSchema = z
  .object({
    recordingId: z.string().uuid(),
    primaryObjective: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict();

export const SaveGeneratedCommandRequestSchema = z
  .object({
    generatedCommandId: z.string().uuid(),
    name: z.string().trim().min(1).max(160).optional(),
    requestTemplate: z.string().trim().min(1).max(4_000).optional(),
    pinned: z.boolean().default(false),
    favorite: z.boolean().default(false),
  })
  .strict();

export const CommandStudioResponseSchema = z
  .object({
    recordings: z.array(IntentRecordingRecordSchema),
    events: z.array(RecordedEventRecordSchema),
    templates: z.array(WorkflowTemplateRecordSchema),
    generatedCommands: z.array(GeneratedCommandRecordSchema),
    parameters: z.array(CommandParameterRecordSchema),
    versions: z.array(CommandVersionRecordSchema),
    analytics: z.array(WorkflowAnalyticsRecordSchema),
    demonstrationSessions: z.array(DemonstrationSessionRecordSchema),
    optimizationSuggestions: z.array(OptimizationSuggestionRecordSchema),
    dependencies: z.array(CommandDependencyRecordSchema),
    semanticRecordings: z.array(SemanticRecordingRecordSchema).max(200),
    workflowTimelines: z.array(WorkflowTimelineRecordSchema).max(200),
    generatedSkills: z.array(GeneratedSkillRecordSchema).max(200),
    skillParameters: z.array(SkillParameterRecordSchema).max(500),
    skillVersions: z.array(SkillVersionRecordSchema).max(200),
    skillUsage: z.array(SkillUsageRecordSchema).max(500),
    workflowValidation: z.array(WorkflowValidationRecordSchema).max(500),
    workflowConditions: z.array(WorkflowConditionRecordSchema).max(500),
    workflowDependencies: z.array(WorkflowDependencyRecordSchema).max(500),
    recordingActive: z.boolean(),
    semanticOnly: z.literal(true),
    rawInputCaptured: z.literal(false),
    commandsRequireReview: z.literal(true),
    programmingByDemonstrationAvailable: z.literal(true),
    macroRecordingAvailable: z.literal(false),
    coordinatePlaybackAvailable: z.literal(false),
    skillsRequireReview: z.literal(true),
  })
  .strict();

export type IntentRecordingStatus = z.infer<typeof IntentRecordingStatusSchema>;
export type RecordedEventSource = z.infer<typeof RecordedEventSourceSchema>;
export type RecordedEventType = z.infer<typeof RecordedEventTypeSchema>;
export type WorkflowVariableSource = z.infer<typeof WorkflowVariableSourceSchema>;
export type CommandReviewStatus = z.infer<typeof CommandReviewStatusSchema>;
export type IntentRecordingRecord = z.infer<typeof IntentRecordingRecordSchema>;
export type RecordedEventRecord = z.infer<typeof RecordedEventRecordSchema>;
export type WorkflowTemplateRecord = z.infer<typeof WorkflowTemplateRecordSchema>;
export type GeneratedCommandRecord = z.infer<typeof GeneratedCommandRecordSchema>;
export type CommandParameterRecord = z.infer<typeof CommandParameterRecordSchema>;
export type CommandVersionRecord = z.infer<typeof CommandVersionRecordSchema>;
export type WorkflowAnalyticsRecord = z.infer<typeof WorkflowAnalyticsRecordSchema>;
export type DemonstrationSessionRecord = z.infer<
  typeof DemonstrationSessionRecordSchema
>;
export type OptimizationSuggestionRecord = z.infer<
  typeof OptimizationSuggestionRecordSchema
>;
export type CommandDependencyRecord = z.infer<typeof CommandDependencyRecordSchema>;
export type DemonstrationStage = z.infer<typeof DemonstrationStageSchema>;
export type DemonstrationSemanticAction = z.infer<
  typeof DemonstrationSemanticActionSchema
>;
export type SemanticRecordingRecord = z.infer<typeof SemanticRecordingRecordSchema>;
export type WorkflowTimelineRecord = z.infer<typeof WorkflowTimelineRecordSchema>;
export type WorkflowTimelineStep = z.infer<typeof WorkflowTimelineStepSchema>;
export type GeneratedSkillRecord = z.infer<typeof GeneratedSkillRecordSchema>;
export type SkillParameterRecord = z.infer<typeof SkillParameterRecordSchema>;
export type SkillVersionRecord = z.infer<typeof SkillVersionRecordSchema>;
export type SkillUsageRecord = z.infer<typeof SkillUsageRecordSchema>;
export type WorkflowValidationRecord = z.infer<typeof WorkflowValidationRecordSchema>;
export type WorkflowConditionRecord = z.infer<typeof WorkflowConditionRecordSchema>;
export type WorkflowDependencyRecord = z.infer<typeof WorkflowDependencyRecordSchema>;
export type WorkflowEditRequest = z.infer<typeof WorkflowEditRequestSchema>;
export type SkillSaveRequest = z.infer<typeof SkillSaveRequestSchema>;
export type WorkflowSimulationRequest = z.infer<typeof WorkflowSimulationRequestSchema>;
export type StartIntentRecordingRequest = z.infer<
  typeof StartIntentRecordingRequestSchema
>;
export type RecordIntentEventRequest = z.infer<typeof RecordIntentEventRequestSchema>;
export type StopIntentRecordingRequest = z.infer<
  typeof StopIntentRecordingRequestSchema
>;
export type SaveGeneratedCommandRequest = z.infer<
  typeof SaveGeneratedCommandRequestSchema
>;
export type CommandStudioResponse = z.infer<typeof CommandStudioResponseSchema>;
