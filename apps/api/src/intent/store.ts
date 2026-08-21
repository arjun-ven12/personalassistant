import {
  ClarificationSessionRecordSchema,
  CommandHistoryRecordSchema,
  CommandMetricRecordSchema,
  CommandRecordSchema,
  CommandSuggestionRecordSchema,
  CommandTemplateRecordSchema,
  ExecutionPlanRecordSchema,
  ExecutionStepRecordSchema,
  IntentAnalysisRecordSchema,
  MacroRecordSchema,
  SavedCommandRecordSchema,
  type ClarificationSessionRecord,
  type CommandHistoryRecord,
  type CommandMetricRecord,
  type CommandRecord,
  type CommandSuggestionRecord,
  type CommandTemplateRecord,
  type ExecutionPlanRecord,
  type ExecutionStepRecord,
  type IntentAnalysisRecord,
  type MacroRecord,
  type SavedCommandRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface IntentStore {
  saveCommand(record: CommandRecord): Awaitable<void>;
  listCommands(ownerId: string, limit: number): Awaitable<CommandRecord[]>;
  saveIntent(record: IntentAnalysisRecord): Awaitable<void>;
  listIntents(ownerId: string, limit: number): Awaitable<IntentAnalysisRecord[]>;
  savePlan(record: ExecutionPlanRecord): Awaitable<void>;
  listPlans(ownerId: string, limit: number): Awaitable<ExecutionPlanRecord[]>;
  saveStep(record: ExecutionStepRecord): Awaitable<void>;
  listSteps(ownerId: string, limit: number): Awaitable<ExecutionStepRecord[]>;
  saveHistory(record: CommandHistoryRecord): Awaitable<void>;
  listHistory(ownerId: string, limit: number): Awaitable<CommandHistoryRecord[]>;
  saveMacro(record: MacroRecord): Awaitable<void>;
  listMacros(ownerId: string): Awaitable<MacroRecord[]>;
  saveSavedCommand(record: SavedCommandRecord): Awaitable<void>;
  listSavedCommands(ownerId: string): Awaitable<SavedCommandRecord[]>;
  saveTemplate(record: CommandTemplateRecord): Awaitable<void>;
  listTemplates(ownerId: string): Awaitable<CommandTemplateRecord[]>;
  saveClarification(record: ClarificationSessionRecord): Awaitable<void>;
  listClarifications(
    ownerId: string,
    limit: number,
  ): Awaitable<ClarificationSessionRecord[]>;
  saveMetric(record: CommandMetricRecord): Awaitable<void>;
  listMetrics(ownerId: string, limit: number): Awaitable<CommandMetricRecord[]>;
  saveSuggestion(record: CommandSuggestionRecord): Awaitable<void>;
  listSuggestions(ownerId: string, limit: number): Awaitable<CommandSuggestionRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemoryIntentStore implements IntentStore {
  readonly #commands = new Map<string, CommandRecord>();
  readonly #intents = new Map<string, IntentAnalysisRecord>();
  readonly #plans = new Map<string, ExecutionPlanRecord>();
  readonly #steps = new Map<string, ExecutionStepRecord>();
  readonly #history = new Map<string, CommandHistoryRecord>();
  readonly #macros = new Map<string, MacroRecord>();
  readonly #saved = new Map<string, SavedCommandRecord>();
  readonly #templates = new Map<string, CommandTemplateRecord>();
  readonly #clarifications = new Map<string, ClarificationSessionRecord>();
  readonly #metrics = new Map<string, CommandMetricRecord>();
  readonly #suggestions = new Map<string, CommandSuggestionRecord>();

  saveCommand(record: CommandRecord) {
    this.#commands.set(record.id, clone(CommandRecordSchema.parse(record)));
  }
  listCommands(ownerId: string, limit: number) {
    return ordered(
      [...this.#commands.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveIntent(record: IntentAnalysisRecord) {
    this.#intents.set(record.id, clone(IntentAnalysisRecordSchema.parse(record)));
  }
  listIntents(ownerId: string, limit: number) {
    return ordered(
      [...this.#intents.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  savePlan(record: ExecutionPlanRecord) {
    this.#plans.set(record.id, clone(ExecutionPlanRecordSchema.parse(record)));
  }
  listPlans(ownerId: string, limit: number) {
    return ordered(
      [...this.#plans.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveStep(record: ExecutionStepRecord) {
    this.#steps.set(record.id, clone(ExecutionStepRecordSchema.parse(record)));
  }
  listSteps(ownerId: string, limit: number) {
    return ordered(
      [...this.#steps.values()].filter((item) => item.ownerId === ownerId),
      "sequence",
      limit,
    );
  }
  saveHistory(record: CommandHistoryRecord) {
    this.#history.set(record.id, clone(CommandHistoryRecordSchema.parse(record)));
  }
  listHistory(ownerId: string, limit: number) {
    return ordered(
      [...this.#history.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveMacro(record: MacroRecord) {
    this.#macros.set(record.id, clone(MacroRecordSchema.parse(record)));
  }
  listMacros(ownerId: string) {
    return [...this.#macros.values()]
      .filter((item) => item.ownerId === ownerId)
      .map(clone);
  }
  saveSavedCommand(record: SavedCommandRecord) {
    this.#saved.set(record.id, clone(SavedCommandRecordSchema.parse(record)));
  }
  listSavedCommands(ownerId: string) {
    return [...this.#saved.values()]
      .filter((item) => item.ownerId === ownerId)
      .map(clone);
  }
  saveTemplate(record: CommandTemplateRecord) {
    this.#templates.set(record.id, clone(CommandTemplateRecordSchema.parse(record)));
  }
  listTemplates(ownerId: string) {
    return [...this.#templates.values()]
      .filter((item) => item.ownerId === ownerId)
      .map(clone);
  }
  saveClarification(record: ClarificationSessionRecord) {
    this.#clarifications.set(
      record.id,
      clone(ClarificationSessionRecordSchema.parse(record)),
    );
  }
  listClarifications(ownerId: string, limit: number) {
    return ordered(
      [...this.#clarifications.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveMetric(record: CommandMetricRecord) {
    this.#metrics.set(record.id, clone(CommandMetricRecordSchema.parse(record)));
  }
  listMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#metrics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  saveSuggestion(record: CommandSuggestionRecord) {
    this.#suggestions.set(
      record.id,
      clone(CommandSuggestionRecordSchema.parse(record)),
    );
  }
  listSuggestions(ownerId: string, limit: number) {
    return ordered(
      [...this.#suggestions.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
}
