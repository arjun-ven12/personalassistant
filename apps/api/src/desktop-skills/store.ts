import {
  ApprovalCheckpointRecordSchema,
  DesktopSkillRecordSchema,
  DesktopWorkflowMetricRecordSchema,
  ExecutionConditionRecordSchema,
  ExecutionContextRecordSchema,
  ExecutionDependencyRecordSchema,
  ExecutionGraphRecordSchema,
  DesktopExecutionStepRecordSchema,
  SkillExecutionRecordSchema,
  WorkflowFailureRecordSchema,
  WorkflowRecoveryRecordSchema,
  type ApprovalCheckpointRecord,
  type DesktopSkillRecord,
  type DesktopWorkflowMetricRecord,
  type ExecutionConditionRecord,
  type ExecutionContextRecord,
  type ExecutionDependencyRecord,
  type ExecutionGraphRecord,
  type DesktopExecutionStepRecord,
  type SkillExecutionRecord,
  type WorkflowFailureRecord,
  type WorkflowRecoveryRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface DesktopSkillStore {
  saveDesktopSkill(record: DesktopSkillRecord): Awaitable<void>;
  listDesktopSkills(ownerId: string, limit: number): Awaitable<DesktopSkillRecord[]>;
  getDesktopSkill(
    ownerId: string,
    skillId: string,
  ): Awaitable<DesktopSkillRecord | null>;
  saveSkillExecution(record: SkillExecutionRecord): Awaitable<void>;
  listSkillExecutions(
    ownerId: string,
    limit: number,
  ): Awaitable<SkillExecutionRecord[]>;
  getSkillExecution(
    ownerId: string,
    executionId: string,
  ): Awaitable<SkillExecutionRecord | null>;
  saveExecutionStep(record: DesktopExecutionStepRecord): Awaitable<void>;
  listExecutionSteps(
    ownerId: string,
    limit: number,
  ): Awaitable<DesktopExecutionStepRecord[]>;
  saveExecutionGraph(record: ExecutionGraphRecord): Awaitable<void>;
  listExecutionGraphs(
    ownerId: string,
    limit: number,
  ): Awaitable<ExecutionGraphRecord[]>;
  saveExecutionContext(record: ExecutionContextRecord): Awaitable<void>;
  listExecutionContext(
    ownerId: string,
    limit: number,
  ): Awaitable<ExecutionContextRecord[]>;
  saveExecutionCondition(record: ExecutionConditionRecord): Awaitable<void>;
  listExecutionConditions(
    ownerId: string,
    limit: number,
  ): Awaitable<ExecutionConditionRecord[]>;
  saveExecutionDependency(record: ExecutionDependencyRecord): Awaitable<void>;
  listExecutionDependencies(
    ownerId: string,
    limit: number,
  ): Awaitable<ExecutionDependencyRecord[]>;
  saveApprovalCheckpoint(record: ApprovalCheckpointRecord): Awaitable<void>;
  listApprovalCheckpoints(
    ownerId: string,
    limit: number,
  ): Awaitable<ApprovalCheckpointRecord[]>;
  saveWorkflowFailure(record: WorkflowFailureRecord): Awaitable<void>;
  listWorkflowFailures(
    ownerId: string,
    limit: number,
  ): Awaitable<WorkflowFailureRecord[]>;
  saveWorkflowRecovery(record: WorkflowRecoveryRecord): Awaitable<void>;
  listWorkflowRecovery(
    ownerId: string,
    limit: number,
  ): Awaitable<WorkflowRecoveryRecord[]>;
  saveDesktopWorkflowMetric(record: DesktopWorkflowMetricRecord): Awaitable<void>;
  listDesktopWorkflowMetrics(
    ownerId: string,
    limit: number,
  ): Awaitable<DesktopWorkflowMetricRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemoryDesktopSkillStore implements DesktopSkillStore {
  readonly #skills = new Map<string, DesktopSkillRecord>();
  readonly #executions = new Map<string, SkillExecutionRecord>();
  readonly #steps = new Map<string, DesktopExecutionStepRecord>();
  readonly #graphs = new Map<string, ExecutionGraphRecord>();
  readonly #contexts = new Map<string, ExecutionContextRecord>();
  readonly #conditions = new Map<string, ExecutionConditionRecord>();
  readonly #dependencies = new Map<string, ExecutionDependencyRecord>();
  readonly #checkpoints = new Map<string, ApprovalCheckpointRecord>();
  readonly #failures = new Map<string, WorkflowFailureRecord>();
  readonly #recovery = new Map<string, WorkflowRecoveryRecord>();
  readonly #metrics = new Map<string, DesktopWorkflowMetricRecord>();

  saveDesktopSkill(record: DesktopSkillRecord) {
    this.#skills.set(record.id, clone(DesktopSkillRecordSchema.parse(record)));
  }
  listDesktopSkills(ownerId: string, limit: number) {
    return ordered(
      [...this.#skills.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getDesktopSkill(ownerId: string, skillId: string) {
    const skill = this.#skills.get(skillId);
    return skill?.ownerId === ownerId ? clone(skill) : null;
  }
  saveSkillExecution(record: SkillExecutionRecord) {
    this.#executions.set(record.id, clone(SkillExecutionRecordSchema.parse(record)));
  }
  listSkillExecutions(ownerId: string, limit: number) {
    return ordered(
      [...this.#executions.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getSkillExecution(ownerId: string, executionId: string) {
    const execution = this.#executions.get(executionId);
    return execution?.ownerId === ownerId ? clone(execution) : null;
  }
  saveExecutionStep(record: DesktopExecutionStepRecord) {
    this.#steps.set(record.id, clone(DesktopExecutionStepRecordSchema.parse(record)));
  }
  listExecutionSteps(ownerId: string, limit: number) {
    return ordered(
      [...this.#steps.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveExecutionGraph(record: ExecutionGraphRecord) {
    this.#graphs.set(record.id, clone(ExecutionGraphRecordSchema.parse(record)));
  }
  listExecutionGraphs(ownerId: string, limit: number) {
    return ordered(
      [...this.#graphs.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveExecutionContext(record: ExecutionContextRecord) {
    this.#contexts.set(record.id, clone(ExecutionContextRecordSchema.parse(record)));
  }
  listExecutionContext(ownerId: string, limit: number) {
    return ordered(
      [...this.#contexts.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveExecutionCondition(record: ExecutionConditionRecord) {
    this.#conditions.set(
      record.id,
      clone(ExecutionConditionRecordSchema.parse(record)),
    );
  }
  listExecutionConditions(ownerId: string, limit: number) {
    return ordered(
      [...this.#conditions.values()].filter((item) => item.ownerId === ownerId),
      "evaluatedAt",
      limit,
    );
  }
  saveExecutionDependency(record: ExecutionDependencyRecord) {
    this.#dependencies.set(
      record.id,
      clone(ExecutionDependencyRecordSchema.parse(record)),
    );
  }
  listExecutionDependencies(ownerId: string, limit: number) {
    return ordered(
      [...this.#dependencies.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveApprovalCheckpoint(record: ApprovalCheckpointRecord) {
    this.#checkpoints.set(
      record.id,
      clone(ApprovalCheckpointRecordSchema.parse(record)),
    );
  }
  listApprovalCheckpoints(ownerId: string, limit: number) {
    return ordered(
      [...this.#checkpoints.values()].filter((item) => item.ownerId === ownerId),
      "requestedAt",
      limit,
    );
  }
  saveWorkflowFailure(record: WorkflowFailureRecord) {
    this.#failures.set(record.id, clone(WorkflowFailureRecordSchema.parse(record)));
  }
  listWorkflowFailures(ownerId: string, limit: number) {
    return ordered(
      [...this.#failures.values()].filter((item) => item.ownerId === ownerId),
      "occurredAt",
      limit,
    );
  }
  saveWorkflowRecovery(record: WorkflowRecoveryRecord) {
    this.#recovery.set(record.id, clone(WorkflowRecoveryRecordSchema.parse(record)));
  }
  listWorkflowRecovery(ownerId: string, limit: number) {
    return ordered(
      [...this.#recovery.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveDesktopWorkflowMetric(record: DesktopWorkflowMetricRecord) {
    this.#metrics.set(
      record.id,
      clone(DesktopWorkflowMetricRecordSchema.parse(record)),
    );
  }
  listDesktopWorkflowMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#metrics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
}
