import {
  CrossApplicationWorkflowGraphSchema,
  CrossApplicationWorkflowNodeSchema,
  CrossApplicationWorkflowTemplateSchema,
  WorkflowCheckpoint18FSchema,
  WorkflowContext18FSchema,
  WorkflowExecutionHistory18FSchema,
  WorkflowFailure18FSchema,
  WorkflowMetric18FSchema,
  WorkflowRecovery18FSchema,
  WorkflowVariable18FSchema,
  type CrossApplicationWorkflowGraph,
  type CrossApplicationWorkflowNode,
  type CrossApplicationWorkflowTemplate,
  type WorkflowCheckpoint18F,
  type WorkflowContext18F,
  type WorkflowExecutionHistory18F,
  type WorkflowFailure18F,
  type WorkflowMetric18F,
  type WorkflowRecovery18F,
  type WorkflowVariable18F,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface CrossApplicationWorkflowStore {
  saveGraph(record: CrossApplicationWorkflowGraph): Awaitable<void>;
  findGraph(ownerId: string, graphId: string): Awaitable<CrossApplicationWorkflowGraph | undefined>;
  listGraphs(ownerId: string, limit: number): Awaitable<CrossApplicationWorkflowGraph[]>;
  saveNode(record: CrossApplicationWorkflowNode): Awaitable<void>;
  listNodes(ownerId: string, graphId: string | null, limit: number): Awaitable<CrossApplicationWorkflowNode[]>;
  saveTemplate(record: CrossApplicationWorkflowTemplate): Awaitable<void>;
  listTemplates(ownerId: string, limit: number): Awaitable<CrossApplicationWorkflowTemplate[]>;
  saveVariable(record: WorkflowVariable18F): Awaitable<void>;
  listVariables(ownerId: string, graphId: string | null, limit: number): Awaitable<WorkflowVariable18F[]>;
  saveHistory(record: WorkflowExecutionHistory18F): Awaitable<void>;
  listHistory(ownerId: string, graphId: string | null, limit: number): Awaitable<WorkflowExecutionHistory18F[]>;
  saveMetric(record: WorkflowMetric18F): Awaitable<void>;
  listMetrics(ownerId: string, graphId: string | null, limit: number): Awaitable<WorkflowMetric18F[]>;
  saveFailure(record: WorkflowFailure18F): Awaitable<void>;
  listFailures(ownerId: string, graphId: string | null, limit: number): Awaitable<WorkflowFailure18F[]>;
  saveRecovery(record: WorkflowRecovery18F): Awaitable<void>;
  listRecovery(ownerId: string, graphId: string | null, limit: number): Awaitable<WorkflowRecovery18F[]>;
  saveCheckpoint(record: WorkflowCheckpoint18F): Awaitable<void>;
  listCheckpoints(ownerId: string, graphId: string | null, limit: number): Awaitable<WorkflowCheckpoint18F[]>;
  saveContext(record: WorkflowContext18F): Awaitable<void>;
  listContext(ownerId: string, graphId: string | null, limit: number): Awaitable<WorkflowContext18F[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const order = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemoryCrossApplicationWorkflowStore
  implements CrossApplicationWorkflowStore
{
  readonly #graphs = new Map<string, CrossApplicationWorkflowGraph>();
  readonly #nodes = new Map<string, CrossApplicationWorkflowNode>();
  readonly #templates = new Map<string, CrossApplicationWorkflowTemplate>();
  readonly #variables = new Map<string, WorkflowVariable18F>();
  readonly #history = new Map<string, WorkflowExecutionHistory18F>();
  readonly #metrics = new Map<string, WorkflowMetric18F>();
  readonly #failures = new Map<string, WorkflowFailure18F>();
  readonly #recovery = new Map<string, WorkflowRecovery18F>();
  readonly #checkpoints = new Map<string, WorkflowCheckpoint18F>();
  readonly #context = new Map<string, WorkflowContext18F>();

  saveGraph(record: CrossApplicationWorkflowGraph) {
    this.#graphs.set(record.id, clone(CrossApplicationWorkflowGraphSchema.parse(record)));
  }
  findGraph(ownerId: string, graphId: string) {
    const graph = this.#graphs.get(graphId);
    return graph?.ownerId === ownerId ? clone(graph) : undefined;
  }
  listGraphs(ownerId: string, limit: number) {
    return order([...this.#graphs.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveNode(record: CrossApplicationWorkflowNode) {
    this.#nodes.set(record.id, clone(CrossApplicationWorkflowNodeSchema.parse(record)));
  }
  listNodes(ownerId: string, graphId: string | null, limit: number) {
    return order([...this.#nodes.values()].filter((item) => item.ownerId === ownerId && (!graphId || item.graphId === graphId)), "updatedAt", limit);
  }
  saveTemplate(record: CrossApplicationWorkflowTemplate) {
    this.#templates.set(record.id, clone(CrossApplicationWorkflowTemplateSchema.parse(record)));
  }
  listTemplates(ownerId: string, limit: number) {
    return order([...this.#templates.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveVariable(record: WorkflowVariable18F) {
    this.#variables.set(record.id, clone(WorkflowVariable18FSchema.parse(record)));
  }
  listVariables(ownerId: string, graphId: string | null, limit: number) {
    return order([...this.#variables.values()].filter((item) => item.ownerId === ownerId && (!graphId || item.graphId === graphId)), "updatedAt", limit);
  }
  saveHistory(record: WorkflowExecutionHistory18F) {
    this.#history.set(record.id, clone(WorkflowExecutionHistory18FSchema.parse(record)));
  }
  listHistory(ownerId: string, graphId: string | null, limit: number) {
    return order([...this.#history.values()].filter((item) => item.ownerId === ownerId && (!graphId || item.graphId === graphId)), "createdAt", limit);
  }
  saveMetric(record: WorkflowMetric18F) {
    this.#metrics.set(record.id, clone(WorkflowMetric18FSchema.parse(record)));
  }
  listMetrics(ownerId: string, graphId: string | null, limit: number) {
    return order([...this.#metrics.values()].filter((item) => item.ownerId === ownerId && (!graphId || item.graphId === graphId)), "measuredAt", limit);
  }
  saveFailure(record: WorkflowFailure18F) {
    this.#failures.set(record.id, clone(WorkflowFailure18FSchema.parse(record)));
  }
  listFailures(ownerId: string, graphId: string | null, limit: number) {
    return order([...this.#failures.values()].filter((item) => item.ownerId === ownerId && (!graphId || item.graphId === graphId)), "createdAt", limit);
  }
  saveRecovery(record: WorkflowRecovery18F) {
    this.#recovery.set(record.id, clone(WorkflowRecovery18FSchema.parse(record)));
  }
  listRecovery(ownerId: string, graphId: string | null, limit: number) {
    return order([...this.#recovery.values()].filter((item) => item.ownerId === ownerId && (!graphId || item.graphId === graphId)), "createdAt", limit);
  }
  saveCheckpoint(record: WorkflowCheckpoint18F) {
    this.#checkpoints.set(record.id, clone(WorkflowCheckpoint18FSchema.parse(record)));
  }
  listCheckpoints(ownerId: string, graphId: string | null, limit: number) {
    return order([...this.#checkpoints.values()].filter((item) => item.ownerId === ownerId && (!graphId || item.graphId === graphId)), "createdAt", limit);
  }
  saveContext(record: WorkflowContext18F) {
    this.#context.set(record.id, clone(WorkflowContext18FSchema.parse(record)));
  }
  listContext(ownerId: string, graphId: string | null, limit: number) {
    return order([...this.#context.values()].filter((item) => item.ownerId === ownerId && (!graphId || item.graphId === graphId)), "updatedAt", limit);
  }
}
