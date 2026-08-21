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
import type { Pool } from "pg";

import type { CrossApplicationWorkflowStore } from "./store.js";

const list = async <T>(
  pool: Pool,
  table: string,
  ownerId: string,
  graphId: string | null,
  order: string,
  limit: number,
  schema: { parse: (value: unknown) => T },
) => {
  const graphClause = graphId ? "AND graph_id=$3" : "";
  const values = graphId ? [ownerId, limit, graphId] : [ownerId, limit];
  const result = await pool.query<{ record: unknown }>(
    `SELECT record FROM ${table}
     WHERE owner_id=$1 ${graphClause}
     ORDER BY ${order} DESC
     LIMIT $2`,
    values,
  );
  return result.rows.map((row) => schema.parse(row.record));
};

const insertRecord = async (
  pool: Pool,
  table: string,
  record: { id: string; ownerId: string },
  columns: Record<string, string | number | boolean | null>,
) => {
  const names = ["id", "owner_id", ...Object.keys(columns), "record"];
  const values = [record.id, record.ownerId, ...Object.values(columns), record];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
  const updates = [...Object.keys(columns), "record"]
    .map((name) => `${name}=EXCLUDED.${name}`)
    .join(",");
  await pool.query(
    `INSERT INTO ${table}(${names.join(",")}) VALUES (${placeholders})
     ON CONFLICT (owner_id, id) DO UPDATE SET ${updates}`,
    values,
  );
};

export class PostgresCrossApplicationWorkflowStore
  implements CrossApplicationWorkflowStore
{
  constructor(readonly pool: Pool) {}

  async saveGraph(record: CrossApplicationWorkflowGraph) {
    const parsed = CrossApplicationWorkflowGraphSchema.parse(record);
    await insertRecord(this.pool, "workflow_graphs", parsed, {
      status: parsed.status,
      template_id: parsed.templateId,
      updated_at: parsed.updatedAt,
    });
  }
  async findGraph(ownerId: string, graphId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM workflow_graphs WHERE owner_id=$1 AND id=$2",
      [ownerId, graphId],
    );
    return result.rows[0]
      ? CrossApplicationWorkflowGraphSchema.parse(result.rows[0].record)
      : undefined;
  }
  listGraphs(ownerId: string, limit: number) {
    return list(
      this.pool,
      "workflow_graphs",
      ownerId,
      null,
      "updated_at",
      limit,
      CrossApplicationWorkflowGraphSchema,
    );
  }
  async saveNode(record: CrossApplicationWorkflowNode) {
    const parsed = CrossApplicationWorkflowNodeSchema.parse(record);
    await insertRecord(this.pool, "workflow_nodes", parsed, {
      graph_id: parsed.graphId,
      status: parsed.status,
      adapter_id: parsed.adapterId,
      capability_id: parsed.semanticCapabilityId,
      updated_at: parsed.updatedAt,
    });
  }
  listNodes(ownerId: string, graphId: string | null, limit: number) {
    return list(
      this.pool,
      "workflow_nodes",
      ownerId,
      graphId,
      "updated_at",
      limit,
      CrossApplicationWorkflowNodeSchema,
    );
  }
  async saveTemplate(record: CrossApplicationWorkflowTemplate) {
    const parsed = CrossApplicationWorkflowTemplateSchema.parse(record);
    await insertRecord(this.pool, "cross_application_workflow_templates", parsed, {
      category: parsed.category,
      updated_at: parsed.updatedAt,
    });
  }
  listTemplates(ownerId: string, limit: number) {
    return list(
      this.pool,
      "cross_application_workflow_templates",
      ownerId,
      null,
      "updated_at",
      limit,
      CrossApplicationWorkflowTemplateSchema,
    );
  }
  async saveVariable(record: WorkflowVariable18F) {
    const parsed = WorkflowVariable18FSchema.parse(record);
    await insertRecord(this.pool, "cross_application_workflow_variables", parsed, {
      graph_id: parsed.graphId,
      key: parsed.key,
      updated_at: parsed.updatedAt,
    });
  }
  listVariables(ownerId: string, graphId: string | null, limit: number) {
    return list(
      this.pool,
      "cross_application_workflow_variables",
      ownerId,
      graphId,
      "updated_at",
      limit,
      WorkflowVariable18FSchema,
    );
  }
  async saveHistory(record: WorkflowExecutionHistory18F) {
    const parsed = WorkflowExecutionHistory18FSchema.parse(record);
    await insertRecord(this.pool, "workflow_execution_history", parsed, {
      graph_id: parsed.graphId,
      node_id: parsed.nodeId,
      event_type: parsed.eventType,
      created_at: parsed.createdAt,
    });
  }
  listHistory(ownerId: string, graphId: string | null, limit: number) {
    return list(
      this.pool,
      "workflow_execution_history",
      ownerId,
      graphId,
      "created_at",
      limit,
      WorkflowExecutionHistory18FSchema,
    );
  }
  async saveMetric(record: WorkflowMetric18F) {
    const parsed = WorkflowMetric18FSchema.parse(record);
    await insertRecord(this.pool, "cross_application_workflow_metrics", parsed, {
      graph_id: parsed.graphId,
      measured_at: parsed.measuredAt,
    });
  }
  listMetrics(ownerId: string, graphId: string | null, limit: number) {
    return list(
      this.pool,
      "cross_application_workflow_metrics",
      ownerId,
      graphId,
      "measured_at",
      limit,
      WorkflowMetric18FSchema,
    );
  }
  async saveFailure(record: WorkflowFailure18F) {
    const parsed = WorkflowFailure18FSchema.parse(record);
    await insertRecord(this.pool, "cross_application_workflow_failures", parsed, {
      graph_id: parsed.graphId,
      node_id: parsed.nodeId,
      error_code: parsed.errorCode,
      created_at: parsed.createdAt,
    });
  }
  listFailures(ownerId: string, graphId: string | null, limit: number) {
    return list(
      this.pool,
      "cross_application_workflow_failures",
      ownerId,
      graphId,
      "created_at",
      limit,
      WorkflowFailure18FSchema,
    );
  }
  async saveRecovery(record: WorkflowRecovery18F) {
    const parsed = WorkflowRecovery18FSchema.parse(record);
    await insertRecord(this.pool, "cross_application_workflow_recovery", parsed, {
      graph_id: parsed.graphId,
      node_id: parsed.nodeId,
      status: parsed.status,
      created_at: parsed.createdAt,
    });
  }
  listRecovery(ownerId: string, graphId: string | null, limit: number) {
    return list(
      this.pool,
      "cross_application_workflow_recovery",
      ownerId,
      graphId,
      "created_at",
      limit,
      WorkflowRecovery18FSchema,
    );
  }
  async saveCheckpoint(record: WorkflowCheckpoint18F) {
    const parsed = WorkflowCheckpoint18FSchema.parse(record);
    await insertRecord(this.pool, "cross_application_workflow_checkpoints", parsed, {
      graph_id: parsed.graphId,
      node_id: parsed.nodeId,
      status: parsed.status,
      created_at: parsed.createdAt,
    });
  }
  listCheckpoints(ownerId: string, graphId: string | null, limit: number) {
    return list(
      this.pool,
      "cross_application_workflow_checkpoints",
      ownerId,
      graphId,
      "created_at",
      limit,
      WorkflowCheckpoint18FSchema,
    );
  }
  async saveContext(record: WorkflowContext18F) {
    const parsed = WorkflowContext18FSchema.parse(record);
    await insertRecord(this.pool, "cross_application_workflow_context", parsed, {
      graph_id: parsed.graphId,
      current_node_id: parsed.currentNodeId,
      updated_at: parsed.updatedAt,
    });
  }
  listContext(ownerId: string, graphId: string | null, limit: number) {
    return list(
      this.pool,
      "cross_application_workflow_context",
      ownerId,
      graphId,
      "updated_at",
      limit,
      WorkflowContext18FSchema,
    );
  }
}
