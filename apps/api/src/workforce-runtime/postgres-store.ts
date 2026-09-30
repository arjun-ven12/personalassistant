import {
  WorkforceRuntimeMessageSchema,
  WorkforceRuntimeReviewSchema,
  WorkforceRuntimeTaskSchema,
  type WorkforceRuntimeMessage,
  type WorkforceRuntimeReview,
  type WorkforceRuntimeTask,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import { leaseLost, type WorkforceExecutionLease, type WorkforceRuntimeStore } from "./store.js";
import { companyScope } from "../companies/scope.js";

export class PostgresWorkforceRuntimeStore implements WorkforceRuntimeStore {
  constructor(readonly pool: Pool) {}
  async saveTask(task: WorkforceRuntimeTask, lease?: WorkforceExecutionLease) {
    const p = WorkforceRuntimeTaskSchema.parse(task);
    const result = await this.pool.query(`INSERT INTO workforce_runtime_tasks(id,owner_id,status,assigned_agent_id,root_task_id,parent_task_id,created_at,updated_at,record,company_id,lifecycle_pending)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::uuid,(SELECT default_company_id FROM owners WHERE id=$2)),$3 IN ('COMPLETED','FAILED','CANCELLED','REVIEW_REQUIRED'))
      ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,assigned_agent_id=EXCLUDED.assigned_agent_id,updated_at=EXCLUDED.updated_at,record=EXCLUDED.record,lifecycle_pending=EXCLUDED.lifecycle_pending
      WHERE workforce_runtime_tasks.owner_id=EXCLUDED.owner_id AND workforce_runtime_tasks.company_id=EXCLUDED.company_id
        AND (($11::uuid IS NULL AND workforce_runtime_tasks.execution_lease_owner IS NULL)
          OR (workforce_runtime_tasks.execution_lease_token=$11 AND workforce_runtime_tasks.execution_lease_owner=$12
            AND workforce_runtime_tasks.execution_lease_expires_at>clock_timestamp())) RETURNING id`,
    [p.id,p.ownerId,p.status,p.assignedAgentId,p.rootTaskId,p.parentTaskId,p.createdAt,p.updatedAt,p,companyScope.companyId(p.ownerId)??null,lease?.token??null,lease?.workerId??null]);
    if (result.rowCount !== 1 && lease) throw leaseLost();
    if (result.rowCount !== 1) throw new Error("Workforce task owner/company scope changed; write denied.");
  }
  async claimExecution(ownerId: string, taskId: string, workerId: string, recovery = false) {
    const token = crypto.randomUUID();
    const result = await this.pool.query(`UPDATE workforce_runtime_tasks
      SET execution_lease_token=$4,execution_lease_owner=$5,execution_lease_expires_at=clock_timestamp()+interval '60 seconds'
      WHERE owner_id=$1 AND id=$2
        AND company_id=COALESCE($3::uuid,(SELECT default_company_id FROM owners WHERE id=$1))
        AND (execution_lease_expires_at IS NULL OR execution_lease_expires_at<=clock_timestamp())
        AND (($6::boolean=false AND status IN ('QUEUED','MATCHING','WAITING','RESERVED'))
          OR ($6=true AND ((status IN ('RUNNING','RESERVED')
            AND (execution_lease_expires_at IS NOT NULL OR updated_at<clock_timestamp()-interval '15 minutes'))
            OR (status IN ('QUEUED','MATCHING','WAITING') AND execution_lease_expires_at IS NOT NULL))))
      RETURNING id`, [ownerId,taskId,companyScope.companyId(ownerId)??null,token,workerId,recovery]);
    return result.rowCount === 1 ? { taskId, token, workerId } : undefined;
  }
  async renewExecution(ownerId: string, lease: WorkforceExecutionLease) {
    const result = await this.pool.query(`UPDATE workforce_runtime_tasks
      SET execution_lease_expires_at=clock_timestamp()+interval '60 seconds'
      WHERE owner_id=$1 AND id=$2 AND execution_lease_token=$4 AND execution_lease_owner=$5
        AND execution_lease_expires_at>clock_timestamp()
        AND company_id=COALESCE($3::uuid,(SELECT default_company_id FROM owners WHERE id=$1)) RETURNING id`,
    [ownerId,lease.taskId,companyScope.companyId(ownerId)??null,lease.token,lease.workerId]);
    return result.rowCount === 1;
  }
  async releaseExecution(ownerId: string, lease: WorkforceExecutionLease) {
    await this.pool.query(`UPDATE workforce_runtime_tasks SET execution_lease_owner=NULL,execution_lease_expires_at=NULL
      WHERE owner_id=$1 AND id=$2 AND execution_lease_token=$4 AND execution_lease_owner=$5
        AND company_id=COALESCE($3::uuid,(SELECT default_company_id FROM owners WHERE id=$1))`,
    [ownerId,lease.taskId,companyScope.companyId(ownerId)??null,lease.token,lease.workerId]);
  }
  async activeExecutionTaskIds(ownerId: string) {
    const result = await this.pool.query<{ id: string }>(`SELECT id FROM workforce_runtime_tasks
      WHERE owner_id=$1 AND company_id=COALESCE($2::uuid,(SELECT default_company_id FROM owners WHERE id=$1))
        AND execution_lease_owner IS NOT NULL AND execution_lease_token IS NOT NULL
        AND execution_lease_expires_at>clock_timestamp()
        AND status NOT IN ('COMPLETED','FAILED','CANCELLED','EXPIRED')
      ORDER BY created_at LIMIT 500`, [ownerId, companyScope.companyId(ownerId) ?? null]);
    return result.rows.map((row) => row.id);
  }
  async cancelExecution(ownerId: string, taskId: string) {
    await this.pool.query(`UPDATE workforce_runtime_tasks
      SET status='CANCELLED',record=jsonb_set(record,'{status}','"CANCELLED"'),
        execution_lease_owner=NULL,execution_lease_expires_at=NULL
      WHERE owner_id=$1 AND id=$2 AND company_id=COALESCE($3::uuid,(SELECT default_company_id FROM owners WHERE id=$1))
        AND status NOT IN ('COMPLETED','FAILED','CANCELLED','EXPIRED')`,
    [ownerId,taskId,companyScope.companyId(ownerId)??null]);
  }
  // Internal scheduler inventory only; callers must enter each explicit scope.
  async expiredExecutionScopes() {
    const result = await this.pool.query<{ ownerId: string; companyId: string }>(`SELECT DISTINCT owner_id AS "ownerId",company_id AS "companyId"
      FROM workforce_runtime_tasks WHERE company_id IS NOT NULL AND
        ((status IN ('QUEUED','MATCHING','WAITING','RUNNING','RESERVED') AND (execution_lease_expires_at<=clock_timestamp()
          OR (status IN ('RUNNING','RESERVED') AND execution_lease_expires_at IS NULL AND updated_at<clock_timestamp()-interval '15 minutes')))
        OR (lifecycle_pending AND (execution_lease_owner IS NULL OR execution_lease_expires_at<=clock_timestamp()))) LIMIT 50`);
    return result.rows;
  }
  async pendingLifecycleTasks(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(`SELECT record FROM workforce_runtime_tasks
      WHERE owner_id=$1 AND company_id=COALESCE($2::uuid,(SELECT default_company_id FROM owners WHERE id=$1))
        AND lifecycle_pending AND (execution_lease_owner IS NULL OR execution_lease_expires_at<=clock_timestamp())
      ORDER BY updated_at LIMIT 50`, [ownerId,companyScope.companyId(ownerId)??null]);
    return result.rows.map((row) => WorkforceRuntimeTaskSchema.parse(row.record));
  }
  async acknowledgeLifecycle(task: WorkforceRuntimeTask) {
    await this.pool.query(`UPDATE workforce_runtime_tasks SET lifecycle_pending=false
      WHERE owner_id=$1 AND id=$2 AND company_id=COALESCE($3::uuid,(SELECT default_company_id FROM owners WHERE id=$1))
        AND record=$4::jsonb`, [task.ownerId,task.id,companyScope.companyId(task.ownerId)??null,task]);
  }
  async findTask(ownerId: string, taskId: string) {
    const result = await this.pool.query<{record: unknown}>("SELECT record FROM workforce_runtime_tasks WHERE owner_id=$1 AND id=$2 AND company_id=COALESCE($3::uuid,(SELECT default_company_id FROM owners WHERE id=$1))",[ownerId,taskId,companyScope.companyId(ownerId)??null]);
    return result.rows[0] ? WorkforceRuntimeTaskSchema.parse(result.rows[0].record) : undefined;
  }
  async listTasks(ownerId: string, limit: number) {
    const result = await this.pool.query<{record: unknown}>("SELECT record FROM workforce_runtime_tasks WHERE owner_id=$1 AND company_id=COALESCE($3::uuid,(SELECT default_company_id FROM owners WHERE id=$1)) ORDER BY created_at DESC LIMIT $2",[ownerId,limit,companyScope.companyId(ownerId)??null]);
    return result.rows.map((row) => WorkforceRuntimeTaskSchema.parse(row.record));
  }
  async saveMessage(message: WorkforceRuntimeMessage) {
    const p = WorkforceRuntimeMessageSchema.parse(message);
    const result = await this.pool.query(`INSERT INTO workforce_runtime_messages(id,owner_id,task_id,message_type,created_at,record,company_id)
      SELECT $1,$2,$3,$4,$5,$6,t.company_id FROM workforce_runtime_tasks t
      WHERE t.id=$3 AND t.owner_id=$2 AND t.company_id=COALESCE($7::uuid,(SELECT default_company_id FROM owners WHERE id=$2))
      ON CONFLICT(id) DO UPDATE SET record=workforce_runtime_messages.record
      WHERE workforce_runtime_messages.owner_id=EXCLUDED.owner_id
        AND workforce_runtime_messages.company_id=EXCLUDED.company_id
        AND workforce_runtime_messages.task_id=EXCLUDED.task_id
        AND workforce_runtime_messages.record=EXCLUDED.record
      RETURNING id`,[p.id,p.ownerId,p.taskId,p.type,p.createdAt,p,companyScope.companyId(p.ownerId)??null]);
    if (result.rowCount !== 1) throw new Error("Workforce message task scope is invalid or the message already exists.");
  }
  async listMessages(ownerId: string, limit: number) {
    const result = await this.pool.query<{record: unknown}>("SELECT record FROM workforce_runtime_messages WHERE owner_id=$1 AND company_id=COALESCE($3::uuid,(SELECT default_company_id FROM owners WHERE id=$1)) ORDER BY created_at DESC LIMIT $2",[ownerId,limit,companyScope.companyId(ownerId)??null]);
    return result.rows.map((row) => WorkforceRuntimeMessageSchema.parse(row.record));
  }
  async saveReview(review: WorkforceRuntimeReview) {
    const p = WorkforceRuntimeReviewSchema.parse(review);
    const result = await this.pool.query(`INSERT INTO workforce_runtime_reviews(id,owner_id,task_id,reviewer_agent_id,verdict,created_at,record,company_id)
      SELECT $1,$2,$3,$4,$5,$6,$7,t.company_id FROM workforce_runtime_tasks t
      WHERE t.id=$3 AND t.owner_id=$2 AND t.company_id=COALESCE($8::uuid,(SELECT default_company_id FROM owners WHERE id=$2))
      ON CONFLICT(id) DO UPDATE SET record=workforce_runtime_reviews.record
      WHERE workforce_runtime_reviews.owner_id=EXCLUDED.owner_id
        AND workforce_runtime_reviews.company_id=EXCLUDED.company_id
        AND workforce_runtime_reviews.task_id=EXCLUDED.task_id
        AND workforce_runtime_reviews.record=EXCLUDED.record
      RETURNING id`,[p.id,p.ownerId,p.taskId,p.reviewerAgentId,p.verdict,p.createdAt,p,companyScope.companyId(p.ownerId)??null]);
    if (result.rowCount !== 1) throw new Error("Workforce review task scope is invalid or the review already exists.");
  }
  async listReviews(ownerId: string, limit: number) {
    const result = await this.pool.query<{record: unknown}>("SELECT record FROM workforce_runtime_reviews WHERE owner_id=$1 AND company_id=COALESCE($3::uuid,(SELECT default_company_id FROM owners WHERE id=$1)) ORDER BY created_at DESC LIMIT $2",[ownerId,limit,companyScope.companyId(ownerId)??null]);
    return result.rows.map((row) => WorkforceRuntimeReviewSchema.parse(row.record));
  }
}
