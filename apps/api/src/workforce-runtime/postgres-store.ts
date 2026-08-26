import {
  WorkforceRuntimeMessageSchema,
  WorkforceRuntimeReviewSchema,
  WorkforceRuntimeTaskSchema,
  type WorkforceRuntimeMessage,
  type WorkforceRuntimeReview,
  type WorkforceRuntimeTask,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { WorkforceRuntimeStore } from "./store.js";

export class PostgresWorkforceRuntimeStore implements WorkforceRuntimeStore {
  constructor(readonly pool: Pool) {}
  async saveTask(task: WorkforceRuntimeTask) {
    const p = WorkforceRuntimeTaskSchema.parse(task);
    await this.pool.query(`INSERT INTO workforce_runtime_tasks(id,owner_id,status,assigned_agent_id,root_task_id,parent_task_id,created_at,updated_at,record)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET status=$3,assigned_agent_id=$4,updated_at=$8,record=$9`,
    [p.id,p.ownerId,p.status,p.assignedAgentId,p.rootTaskId,p.parentTaskId,p.createdAt,p.updatedAt,p]);
  }
  async findTask(ownerId: string, taskId: string) {
    const result = await this.pool.query<{record: unknown}>("SELECT record FROM workforce_runtime_tasks WHERE owner_id=$1 AND id=$2",[ownerId,taskId]);
    return result.rows[0] ? WorkforceRuntimeTaskSchema.parse(result.rows[0].record) : undefined;
  }
  async listTasks(ownerId: string, limit: number) {
    const result = await this.pool.query<{record: unknown}>("SELECT record FROM workforce_runtime_tasks WHERE owner_id=$1 ORDER BY created_at DESC LIMIT $2",[ownerId,limit]);
    return result.rows.map((row) => WorkforceRuntimeTaskSchema.parse(row.record));
  }
  async saveMessage(message: WorkforceRuntimeMessage) {
    const p = WorkforceRuntimeMessageSchema.parse(message);
    await this.pool.query(`INSERT INTO workforce_runtime_messages(id,owner_id,task_id,message_type,created_at,record)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,[p.id,p.ownerId,p.taskId,p.type,p.createdAt,p]);
  }
  async listMessages(ownerId: string, limit: number) {
    const result = await this.pool.query<{record: unknown}>("SELECT record FROM workforce_runtime_messages WHERE owner_id=$1 ORDER BY created_at DESC LIMIT $2",[ownerId,limit]);
    return result.rows.map((row) => WorkforceRuntimeMessageSchema.parse(row.record));
  }
  async saveReview(review: WorkforceRuntimeReview) {
    const p = WorkforceRuntimeReviewSchema.parse(review);
    await this.pool.query(`INSERT INTO workforce_runtime_reviews(id,owner_id,task_id,reviewer_agent_id,verdict,created_at,record)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,[p.id,p.ownerId,p.taskId,p.reviewerAgentId,p.verdict,p.createdAt,p]);
  }
  async listReviews(ownerId: string, limit: number) {
    const result = await this.pool.query<{record: unknown}>("SELECT record FROM workforce_runtime_reviews WHERE owner_id=$1 ORDER BY created_at DESC LIMIT $2",[ownerId,limit]);
    return result.rows.map((row) => WorkforceRuntimeReviewSchema.parse(row.record));
  }
}
