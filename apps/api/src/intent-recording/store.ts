import {
  CommandDependencyRecordSchema,
  CommandParameterRecordSchema,
  CommandVersionRecordSchema,
  DemonstrationSessionRecordSchema,
  GeneratedSkillRecordSchema,
  GeneratedCommandRecordSchema,
  IntentRecordingRecordSchema,
  OptimizationSuggestionRecordSchema,
  RecordedEventRecordSchema,
  SemanticRecordingRecordSchema,
  SkillParameterRecordSchema,
  SkillUsageRecordSchema,
  SkillVersionRecordSchema,
  WorkflowConditionRecordSchema,
  WorkflowDependencyRecordSchema,
  WorkflowTimelineRecordSchema,
  WorkflowValidationRecordSchema,
  WorkflowAnalyticsRecordSchema,
  WorkflowTemplateRecordSchema,
  type CommandDependencyRecord,
  type CommandParameterRecord,
  type CommandVersionRecord,
  type DemonstrationSessionRecord,
  type GeneratedSkillRecord,
  type GeneratedCommandRecord,
  type IntentRecordingRecord,
  type OptimizationSuggestionRecord,
  type RecordedEventRecord,
  type SemanticRecordingRecord,
  type SkillParameterRecord,
  type SkillUsageRecord,
  type SkillVersionRecord,
  type WorkflowConditionRecord,
  type WorkflowDependencyRecord,
  type WorkflowTimelineRecord,
  type WorkflowValidationRecord,
  type WorkflowAnalyticsRecord,
  type WorkflowTemplateRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface IntentRecordingStore {
  saveRecording(record: IntentRecordingRecord): Awaitable<void>;
  listRecordings(ownerId: string, limit: number): Awaitable<IntentRecordingRecord[]>;
  getRecording(
    ownerId: string,
    recordingId: string,
  ): Awaitable<IntentRecordingRecord | null>;
  saveEvent(record: RecordedEventRecord): Awaitable<void>;
  listEvents(
    ownerId: string,
    recordingId: string | null,
    limit: number,
  ): Awaitable<RecordedEventRecord[]>;
  saveTemplate(record: WorkflowTemplateRecord): Awaitable<void>;
  listTemplates(ownerId: string, limit: number): Awaitable<WorkflowTemplateRecord[]>;
  saveGeneratedCommand(record: GeneratedCommandRecord): Awaitable<void>;
  listGeneratedCommands(
    ownerId: string,
    limit: number,
  ): Awaitable<GeneratedCommandRecord[]>;
  getGeneratedCommand(
    ownerId: string,
    generatedCommandId: string,
  ): Awaitable<GeneratedCommandRecord | null>;
  saveParameter(record: CommandParameterRecord): Awaitable<void>;
  listParameters(ownerId: string, limit: number): Awaitable<CommandParameterRecord[]>;
  saveVersion(record: CommandVersionRecord): Awaitable<void>;
  listVersions(ownerId: string, limit: number): Awaitable<CommandVersionRecord[]>;
  saveAnalytics(record: WorkflowAnalyticsRecord): Awaitable<void>;
  listAnalytics(ownerId: string, limit: number): Awaitable<WorkflowAnalyticsRecord[]>;
  saveDemonstrationSession(record: DemonstrationSessionRecord): Awaitable<void>;
  listDemonstrationSessions(
    ownerId: string,
    limit: number,
  ): Awaitable<DemonstrationSessionRecord[]>;
  saveOptimizationSuggestion(record: OptimizationSuggestionRecord): Awaitable<void>;
  listOptimizationSuggestions(
    ownerId: string,
    limit: number,
  ): Awaitable<OptimizationSuggestionRecord[]>;
  saveDependency(record: CommandDependencyRecord): Awaitable<void>;
  listDependencies(
    ownerId: string,
    limit: number,
  ): Awaitable<CommandDependencyRecord[]>;
  saveSemanticRecording(record: SemanticRecordingRecord): Awaitable<void>;
  listSemanticRecordings(
    ownerId: string,
    limit: number,
  ): Awaitable<SemanticRecordingRecord[]>;
  saveWorkflowTimeline(record: WorkflowTimelineRecord): Awaitable<void>;
  listWorkflowTimelines(
    ownerId: string,
    limit: number,
  ): Awaitable<WorkflowTimelineRecord[]>;
  getWorkflowTimeline(
    ownerId: string,
    timelineId: string,
  ): Awaitable<WorkflowTimelineRecord | null>;
  saveGeneratedSkill(record: GeneratedSkillRecord): Awaitable<void>;
  listGeneratedSkills(
    ownerId: string,
    limit: number,
  ): Awaitable<GeneratedSkillRecord[]>;
  getGeneratedSkill(
    ownerId: string,
    skillId: string,
  ): Awaitable<GeneratedSkillRecord | null>;
  saveSkillParameter(record: SkillParameterRecord): Awaitable<void>;
  listSkillParameters(
    ownerId: string,
    limit: number,
  ): Awaitable<SkillParameterRecord[]>;
  saveSkillVersion(record: SkillVersionRecord): Awaitable<void>;
  listSkillVersions(ownerId: string, limit: number): Awaitable<SkillVersionRecord[]>;
  saveSkillUsage(record: SkillUsageRecord): Awaitable<void>;
  listSkillUsage(ownerId: string, limit: number): Awaitable<SkillUsageRecord[]>;
  saveWorkflowValidation(record: WorkflowValidationRecord): Awaitable<void>;
  listWorkflowValidation(
    ownerId: string,
    limit: number,
  ): Awaitable<WorkflowValidationRecord[]>;
  saveWorkflowCondition(record: WorkflowConditionRecord): Awaitable<void>;
  listWorkflowConditions(
    ownerId: string,
    limit: number,
  ): Awaitable<WorkflowConditionRecord[]>;
  saveWorkflowDependency(record: WorkflowDependencyRecord): Awaitable<void>;
  listWorkflowDependencies(
    ownerId: string,
    limit: number,
  ): Awaitable<WorkflowDependencyRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemoryIntentRecordingStore implements IntentRecordingStore {
  readonly #recordings = new Map<string, IntentRecordingRecord>();
  readonly #events = new Map<string, RecordedEventRecord>();
  readonly #templates = new Map<string, WorkflowTemplateRecord>();
  readonly #generatedCommands = new Map<string, GeneratedCommandRecord>();
  readonly #parameters = new Map<string, CommandParameterRecord>();
  readonly #versions = new Map<string, CommandVersionRecord>();
  readonly #analytics = new Map<string, WorkflowAnalyticsRecord>();
  readonly #sessions = new Map<string, DemonstrationSessionRecord>();
  readonly #suggestions = new Map<string, OptimizationSuggestionRecord>();
  readonly #dependencies = new Map<string, CommandDependencyRecord>();
  readonly #semanticRecordings = new Map<string, SemanticRecordingRecord>();
  readonly #workflowTimelines = new Map<string, WorkflowTimelineRecord>();
  readonly #generatedSkills = new Map<string, GeneratedSkillRecord>();
  readonly #skillParameters = new Map<string, SkillParameterRecord>();
  readonly #skillVersions = new Map<string, SkillVersionRecord>();
  readonly #skillUsage = new Map<string, SkillUsageRecord>();
  readonly #workflowValidation = new Map<string, WorkflowValidationRecord>();
  readonly #workflowConditions = new Map<string, WorkflowConditionRecord>();
  readonly #workflowDependencies = new Map<string, WorkflowDependencyRecord>();

  saveRecording(record: IntentRecordingRecord) {
    this.#recordings.set(record.id, clone(IntentRecordingRecordSchema.parse(record)));
  }
  listRecordings(ownerId: string, limit: number) {
    return ordered(
      [...this.#recordings.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getRecording(ownerId: string, recordingId: string) {
    const recording = this.#recordings.get(recordingId);
    return recording?.ownerId === ownerId ? clone(recording) : null;
  }
  saveEvent(record: RecordedEventRecord) {
    this.#events.set(record.id, clone(RecordedEventRecordSchema.parse(record)));
  }
  listEvents(ownerId: string, recordingId: string | null, limit: number) {
    return ordered(
      [...this.#events.values()].filter(
        (item) =>
          item.ownerId === ownerId &&
          (!recordingId || item.recordingId === recordingId),
      ),
      "sequence",
      limit,
    );
  }
  saveTemplate(record: WorkflowTemplateRecord) {
    this.#templates.set(record.id, clone(WorkflowTemplateRecordSchema.parse(record)));
  }
  listTemplates(ownerId: string, limit: number) {
    return ordered(
      [...this.#templates.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveGeneratedCommand(record: GeneratedCommandRecord) {
    this.#generatedCommands.set(
      record.id,
      clone(GeneratedCommandRecordSchema.parse(record)),
    );
  }
  listGeneratedCommands(ownerId: string, limit: number) {
    return ordered(
      [...this.#generatedCommands.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getGeneratedCommand(ownerId: string, generatedCommandId: string) {
    const command = this.#generatedCommands.get(generatedCommandId);
    return command?.ownerId === ownerId ? clone(command) : null;
  }
  saveParameter(record: CommandParameterRecord) {
    this.#parameters.set(record.id, clone(CommandParameterRecordSchema.parse(record)));
  }
  listParameters(ownerId: string, limit: number) {
    return ordered(
      [...this.#parameters.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveVersion(record: CommandVersionRecord) {
    this.#versions.set(record.id, clone(CommandVersionRecordSchema.parse(record)));
  }
  listVersions(ownerId: string, limit: number) {
    return ordered(
      [...this.#versions.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveAnalytics(record: WorkflowAnalyticsRecord) {
    this.#analytics.set(record.id, clone(WorkflowAnalyticsRecordSchema.parse(record)));
  }
  listAnalytics(ownerId: string, limit: number) {
    return ordered(
      [...this.#analytics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  saveDemonstrationSession(record: DemonstrationSessionRecord) {
    this.#sessions.set(
      record.id,
      clone(DemonstrationSessionRecordSchema.parse(record)),
    );
  }
  listDemonstrationSessions(ownerId: string, limit: number) {
    return ordered(
      [...this.#sessions.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveOptimizationSuggestion(record: OptimizationSuggestionRecord) {
    this.#suggestions.set(
      record.id,
      clone(OptimizationSuggestionRecordSchema.parse(record)),
    );
  }
  listOptimizationSuggestions(ownerId: string, limit: number) {
    return ordered(
      [...this.#suggestions.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveDependency(record: CommandDependencyRecord) {
    this.#dependencies.set(
      record.id,
      clone(CommandDependencyRecordSchema.parse(record)),
    );
  }
  listDependencies(ownerId: string, limit: number) {
    return ordered(
      [...this.#dependencies.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveSemanticRecording(record: SemanticRecordingRecord) {
    this.#semanticRecordings.set(
      record.id,
      clone(SemanticRecordingRecordSchema.parse(record)),
    );
  }
  listSemanticRecordings(ownerId: string, limit: number) {
    return ordered(
      [...this.#semanticRecordings.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveWorkflowTimeline(record: WorkflowTimelineRecord) {
    this.#workflowTimelines.set(
      record.id,
      clone(WorkflowTimelineRecordSchema.parse(record)),
    );
  }
  listWorkflowTimelines(ownerId: string, limit: number) {
    return ordered(
      [...this.#workflowTimelines.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getWorkflowTimeline(ownerId: string, timelineId: string) {
    const timeline = this.#workflowTimelines.get(timelineId);
    return timeline?.ownerId === ownerId ? clone(timeline) : null;
  }
  saveGeneratedSkill(record: GeneratedSkillRecord) {
    this.#generatedSkills.set(
      record.id,
      clone(GeneratedSkillRecordSchema.parse(record)),
    );
  }
  listGeneratedSkills(ownerId: string, limit: number) {
    return ordered(
      [...this.#generatedSkills.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getGeneratedSkill(ownerId: string, skillId: string) {
    const skill = this.#generatedSkills.get(skillId);
    return skill?.ownerId === ownerId ? clone(skill) : null;
  }
  saveSkillParameter(record: SkillParameterRecord) {
    this.#skillParameters.set(
      record.id,
      clone(SkillParameterRecordSchema.parse(record)),
    );
  }
  listSkillParameters(ownerId: string, limit: number) {
    return ordered(
      [...this.#skillParameters.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveSkillVersion(record: SkillVersionRecord) {
    this.#skillVersions.set(record.id, clone(SkillVersionRecordSchema.parse(record)));
  }
  listSkillVersions(ownerId: string, limit: number) {
    return ordered(
      [...this.#skillVersions.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveSkillUsage(record: SkillUsageRecord) {
    this.#skillUsage.set(record.id, clone(SkillUsageRecordSchema.parse(record)));
  }
  listSkillUsage(ownerId: string, limit: number) {
    return ordered(
      [...this.#skillUsage.values()].filter((item) => item.ownerId === ownerId),
      "executedAt",
      limit,
    );
  }
  saveWorkflowValidation(record: WorkflowValidationRecord) {
    this.#workflowValidation.set(
      record.id,
      clone(WorkflowValidationRecordSchema.parse(record)),
    );
  }
  listWorkflowValidation(ownerId: string, limit: number) {
    return ordered(
      [...this.#workflowValidation.values()].filter((item) => item.ownerId === ownerId),
      "validatedAt",
      limit,
    );
  }
  saveWorkflowCondition(record: WorkflowConditionRecord) {
    this.#workflowConditions.set(
      record.id,
      clone(WorkflowConditionRecordSchema.parse(record)),
    );
  }
  listWorkflowConditions(ownerId: string, limit: number) {
    return ordered(
      [...this.#workflowConditions.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveWorkflowDependency(record: WorkflowDependencyRecord) {
    this.#workflowDependencies.set(
      record.id,
      clone(WorkflowDependencyRecordSchema.parse(record)),
    );
  }
  listWorkflowDependencies(ownerId: string, limit: number) {
    return ordered(
      [...this.#workflowDependencies.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }
}
