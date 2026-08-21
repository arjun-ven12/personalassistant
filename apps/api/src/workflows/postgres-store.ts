import {
  WorkflowCheckpointSchema,
  WorkflowEventSchema,
  WorkflowRecordSchema,
  WorkflowReportSchema,
  WorkflowTaskSchema,
  type WorkflowCheckpoint,
  type WorkflowEvent,
  type WorkflowRecord,
  type WorkflowReport,
  type WorkflowTask,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { WorkflowStore } from "./store.js";

const parseWorkflow = (row: { record: unknown }) =>
  WorkflowRecordSchema.parse(row.record);
const parseTask = (row: { record: unknown }) => WorkflowTaskSchema.parse(row.record);
const parseCheckpoint = (row: { record: unknown }) =>
  WorkflowCheckpointSchema.parse(row.record);
const parseEvent = (row: { record: unknown }) => WorkflowEventSchema.parse(row.record);

export class PostgresWorkflowStore implements WorkflowStore {
  constructor(readonly pool: Pool) {}

  async create(input: {
    workflow: WorkflowRecord;
    tasks: WorkflowTask[];
    checkpoints: WorkflowCheckpoint[];
    events: WorkflowEvent[];
  }) {
    const workflow = WorkflowRecordSchema.parse(input.workflow);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO workflows(id,owner_id,status,created_at,updated_at,record)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          workflow.id,
          workflow.ownerId,
          workflow.status,
          workflow.createdAt,
          workflow.updatedAt,
          workflow,
        ],
      );
      for (const task of input.tasks) {
        const parsed = WorkflowTaskSchema.parse(task);
        await client.query(
          `INSERT INTO workflow_tasks(id,workflow_id,status,created_at,updated_at,record)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            parsed.id,
            parsed.workflowId,
            parsed.status,
            parsed.createdAt,
            parsed.updatedAt,
            parsed,
          ],
        );
        for (const dependencyId of parsed.dependencies) {
          await client.query(
            `INSERT INTO workflow_dependencies(workflow_id,task_id,depends_on_task_id)
             VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [parsed.workflowId, parsed.id, dependencyId],
          );
        }
      }
      for (const checkpoint of input.checkpoints) {
        const parsed = WorkflowCheckpointSchema.parse(checkpoint);
        await client.query(
          `INSERT INTO workflow_checkpoints(id,workflow_id,task_id,kind,status,created_at,record)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            parsed.id,
            parsed.workflowId,
            parsed.taskId,
            parsed.kind,
            parsed.status,
            parsed.createdAt,
            parsed,
          ],
        );
      }
      for (const event of input.events) {
        const parsed = WorkflowEventSchema.parse(event);
        await client.query(
          `INSERT INTO workflow_events(id,workflow_id,task_id,event_type,created_at,record)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            parsed.id,
            parsed.workflowId,
            parsed.taskId,
            parsed.eventType,
            parsed.createdAt,
            parsed,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return workflow;
  }

  async find(id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM workflows WHERE id=$1",
      [id],
    );
    return result.rows[0] ? parseWorkflow(result.rows[0]) : undefined;
  }

  async list(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM workflows WHERE owner_id=$1 ORDER BY created_at DESC LIMIT $2",
      [ownerId, limit],
    );
    return result.rows.map(parseWorkflow);
  }

  async update(workflow: WorkflowRecord) {
    const parsed = WorkflowRecordSchema.parse(workflow);
    await this.pool.query(
      "UPDATE workflows SET status=$2,updated_at=$3,record=$4 WHERE id=$1 AND owner_id=$5",
      [parsed.id, parsed.status, parsed.updatedAt, parsed, parsed.ownerId],
    );
  }

  async listTasks(workflowId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM workflow_tasks WHERE workflow_id=$1 ORDER BY created_at ASC",
      [workflowId],
    );
    return result.rows.map(parseTask);
  }

  async updateTask(task: WorkflowTask) {
    const parsed = WorkflowTaskSchema.parse(task);
    await this.pool.query(
      "UPDATE workflow_tasks SET status=$2,updated_at=$3,record=$4 WHERE id=$1 AND workflow_id=$5",
      [parsed.id, parsed.status, parsed.updatedAt, parsed, parsed.workflowId],
    );
  }

  async listCheckpoints(workflowId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM workflow_checkpoints WHERE workflow_id=$1 ORDER BY created_at ASC",
      [workflowId],
    );
    return result.rows.map(parseCheckpoint);
  }

  async addCheckpoint(checkpoint: WorkflowCheckpoint) {
    const parsed = WorkflowCheckpointSchema.parse(checkpoint);
    await this.pool.query(
      `INSERT INTO workflow_checkpoints(id,workflow_id,task_id,kind,status,created_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        parsed.id,
        parsed.workflowId,
        parsed.taskId,
        parsed.kind,
        parsed.status,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  async listEvents(workflowId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM workflow_events WHERE workflow_id=$1 ORDER BY created_at DESC LIMIT $2",
      [workflowId, limit],
    );
    return result.rows.map(parseEvent);
  }

  async addEvent(event: WorkflowEvent) {
    const parsed = WorkflowEventSchema.parse(event);
    await this.pool.query(
      `INSERT INTO workflow_events(id,workflow_id,task_id,event_type,created_at,record)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        parsed.id,
        parsed.workflowId,
        parsed.taskId,
        parsed.eventType,
        parsed.createdAt,
        parsed,
      ],
    );
  }

  async saveReport(report: WorkflowReport) {
    const parsed = WorkflowReportSchema.parse(report);
    await this.pool.query(
      `INSERT INTO workflow_reports(workflow_id,created_at,record)
       VALUES ($1,$2,$3)
       ON CONFLICT (workflow_id) DO UPDATE SET created_at=$2,record=$3`,
      [parsed.workflowId, parsed.generatedAt, parsed],
    );
  }

  async getReport(workflowId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM workflow_reports WHERE workflow_id=$1",
      [workflowId],
    );
    return result.rows[0]
      ? WorkflowReportSchema.parse(result.rows[0].record)
      : undefined;
  }
}
