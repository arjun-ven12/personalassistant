import {
  CrossCompanyCollaborationPolicySchema,
  CrossCompanyServiceRequestSchema,
  DurableActivityReceiptSchema,
  DurableExecutionEventSchema,
  DurableExecutionSchema,
  SandboxExecutionResultSchema,
  type CrossCompanyCollaborationPolicy,
  type CrossCompanyServiceRequest,
  type DurableActivityReceipt,
  type DurableExecution,
  type DurableExecutionEvent,
  type SandboxExecutionResult,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { Awaitable } from "../identity/store.js";

export interface DurableExecutionStore {
  savePolicy(value: CrossCompanyCollaborationPolicy): Awaitable<void>;
  findPolicy(
    ownerId: string,
    companyId: string,
  ): Awaitable<CrossCompanyCollaborationPolicy | undefined>;
  saveServiceRequest(value: CrossCompanyServiceRequest): Awaitable<void>;
  findServiceRequest(
    ownerId: string,
    id: string,
  ): Awaitable<CrossCompanyServiceRequest | undefined>;
  listServiceRequests(
    ownerId: string,
    companyId?: string,
  ): Awaitable<CrossCompanyServiceRequest[]>;
  saveExecution(value: DurableExecution): Awaitable<void>;
  findExecution(ownerId: string, id: string): Awaitable<DurableExecution | undefined>;
  findExecutionByKey(
    ownerId: string,
    deterministicKey: string,
  ): Awaitable<DurableExecution | undefined>;
  listExecutions(ownerId: string, companyId?: string): Awaitable<DurableExecution[]>;
  claimRunnable(input: {
    workerId: string;
    now: string;
    leaseMs: number;
    limit: number;
    maxPerCompany: number;
  }): Awaitable<DurableExecution[]>;
  renewLease(input: {
    ownerId: string;
    executionId: string;
    workerId: string;
    now: string;
    leaseMs: number;
  }): Awaitable<DurableExecution | undefined>;
  releaseLease(ownerId: string, executionId: string, workerId: string): Awaitable<void>;
  appendEvent(value: DurableExecutionEvent): Awaitable<void>;
  listEvents(ownerId: string, executionId: string): Awaitable<DurableExecutionEvent[]>;
  saveReceipt(value: DurableActivityReceipt): Awaitable<void>;
  findReceipt(
    ownerId: string,
    idempotencyKey: string,
  ): Awaitable<DurableActivityReceipt | undefined>;
  saveSandboxResult(value: SandboxExecutionResult): Awaitable<void>;
  listSandboxResults(
    ownerId: string,
    companyId?: string,
  ): Awaitable<SandboxExecutionResult[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
export class InMemoryDurableExecutionStore implements DurableExecutionStore {
  readonly #policies = new Map<string, CrossCompanyCollaborationPolicy>();
  readonly #requests = new Map<string, CrossCompanyServiceRequest>();
  readonly #executions = new Map<string, DurableExecution>();
  readonly #events = new Map<string, DurableExecutionEvent>();
  readonly #receipts = new Map<string, DurableActivityReceipt>();
  readonly #sandboxes = new Map<string, SandboxExecutionResult>();
  savePolicy(value: CrossCompanyCollaborationPolicy) {
    const item = CrossCompanyCollaborationPolicySchema.parse(value);
    this.#policies.set(`${item.ownerId}:${item.companyId}`, clone(item));
  }
  findPolicy(ownerId: string, companyId: string) {
    const item = this.#policies.get(`${ownerId}:${companyId}`);
    return item ? clone(item) : undefined;
  }
  saveServiceRequest(value: CrossCompanyServiceRequest) {
    const item = CrossCompanyServiceRequestSchema.parse(value);
    this.#requests.set(`${item.ownerId}:${item.id}`, clone(item));
  }
  findServiceRequest(ownerId: string, id: string) {
    const item = this.#requests.get(`${ownerId}:${id}`);
    return item ? clone(item) : undefined;
  }
  listServiceRequests(ownerId: string, companyId?: string) {
    return [...this.#requests.values()]
      .filter((item) => item.ownerId === ownerId)
      .filter(
        (item) =>
          !companyId ||
          item.sourceCompanyId === companyId ||
          item.destinationCompanyId === companyId,
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(clone);
  }
  saveExecution(value: DurableExecution) {
    const item = DurableExecutionSchema.parse(value);
    this.#executions.set(`${item.ownerId}:${item.id}`, clone(item));
  }
  findExecution(ownerId: string, id: string) {
    const item = this.#executions.get(`${ownerId}:${id}`);
    return item ? clone(item) : undefined;
  }
  findExecutionByKey(ownerId: string, deterministicKey: string) {
    const item = [...this.#executions.values()].find(
      (value) =>
        value.ownerId === ownerId && value.deterministicKey === deterministicKey,
    );
    return item ? clone(item) : undefined;
  }
  listExecutions(ownerId: string, companyId?: string) {
    return [...this.#executions.values()]
      .filter(
        (item) =>
          item.ownerId === ownerId && (!companyId || item.companyId === companyId),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(clone);
  }
  claimRunnable(input: {
    workerId: string;
    now: string;
    leaseMs: number;
    limit: number;
    maxPerCompany: number;
  }) {
    const leasedByCompany = new Map<string, number>();
    for (const item of this.#executions.values()) {
      if (item.leaseExpiresAt && item.leaseExpiresAt > input.now)
        leasedByCompany.set(
          item.companyId,
          (leasedByCompany.get(item.companyId) ?? 0) + 1,
        );
    }
    const candidates = [...this.#executions.values()]
      .filter((item) => ["QUEUED", "RUNNING"].includes(item.status))
      .filter((item) => !item.nextRunAt || item.nextRunAt <= input.now)
      .filter((item) => !item.leaseExpiresAt || item.leaseExpiresAt <= input.now)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
    const claimed: DurableExecution[] = [];
    for (const item of candidates) {
      if (claimed.length >= input.limit) break;
      const count = leasedByCompany.get(item.companyId) ?? 0;
      if (count >= input.maxPerCompany) continue;
      const leaseExpiresAt = new Date(
        new Date(input.now).getTime() + input.leaseMs,
      ).toISOString();
      const updated = DurableExecutionSchema.parse({
        ...item,
        leaseOwner: input.workerId,
        leaseAcquiredAt: input.now,
        leaseExpiresAt,
        lastHeartbeatAt: input.now,
        leaseGeneration: item.leaseGeneration + 1,
        updatedAt: input.now,
      });
      this.#executions.set(`${updated.ownerId}:${updated.id}`, clone(updated));
      leasedByCompany.set(item.companyId, count + 1);
      claimed.push(clone(updated));
    }
    return claimed;
  }
  renewLease(input: {
    ownerId: string;
    executionId: string;
    workerId: string;
    now: string;
    leaseMs: number;
  }) {
    const item = this.#executions.get(`${input.ownerId}:${input.executionId}`);
    if (
      !item ||
      item.leaseOwner !== input.workerId ||
      !item.leaseExpiresAt ||
      item.leaseExpiresAt <= input.now
    )
      return undefined;
    const updated = DurableExecutionSchema.parse({
      ...item,
      leaseExpiresAt: new Date(
        new Date(input.now).getTime() + input.leaseMs,
      ).toISOString(),
      lastHeartbeatAt: input.now,
      updatedAt: input.now,
    });
    this.#executions.set(`${updated.ownerId}:${updated.id}`, clone(updated));
    return clone(updated);
  }
  releaseLease(ownerId: string, executionId: string, workerId: string) {
    const item = this.#executions.get(`${ownerId}:${executionId}`);
    if (!item || item.leaseOwner !== workerId) return;
    this.#executions.set(
      `${ownerId}:${executionId}`,
      clone(
        DurableExecutionSchema.parse({
          ...item,
          leaseOwner: null,
          leaseAcquiredAt: null,
          leaseExpiresAt: null,
          lastHeartbeatAt: null,
        }),
      ),
    );
  }
  appendEvent(value: DurableExecutionEvent) {
    const item = DurableExecutionEventSchema.parse(value);
    const duplicate = [...this.#events.values()].find(
      (event) =>
        event.ownerId === item.ownerId &&
        event.executionId === item.executionId &&
        event.sequence === item.sequence,
    );
    if (!duplicate) this.#events.set(`${item.ownerId}:${item.id}`, clone(item));
  }
  listEvents(ownerId: string, executionId: string) {
    return [...this.#events.values()]
      .filter((item) => item.ownerId === ownerId && item.executionId === executionId)
      .sort((a, b) => a.sequence - b.sequence)
      .map(clone);
  }
  saveReceipt(value: DurableActivityReceipt) {
    const item = DurableActivityReceiptSchema.parse(value);
    this.#receipts.set(`${item.ownerId}:${item.idempotencyKey}`, clone(item));
  }
  findReceipt(ownerId: string, idempotencyKey: string) {
    const item = this.#receipts.get(`${ownerId}:${idempotencyKey}`);
    return item ? clone(item) : undefined;
  }
  saveSandboxResult(value: SandboxExecutionResult) {
    const item = SandboxExecutionResultSchema.parse(value);
    this.#sandboxes.set(`${item.ownerId}:${item.id}`, clone(item));
  }
  listSandboxResults(ownerId: string, companyId?: string) {
    return [...this.#sandboxes.values()]
      .filter(
        (item) =>
          item.ownerId === ownerId && (!companyId || item.companyId === companyId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }
}

type Row = { record: unknown };
export class PostgresDurableExecutionStore implements DurableExecutionStore {
  constructor(readonly pool: Pool) {}
  async savePolicy(value: CrossCompanyCollaborationPolicy) {
    const item = CrossCompanyCollaborationPolicySchema.parse(value);
    await this.pool.query(
      `INSERT INTO cross_company_collaboration_policies(id,owner_id,company_id,status,version,record,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(owner_id,company_id) DO UPDATE SET status=EXCLUDED.status,version=EXCLUDED.version,record=EXCLUDED.record,updated_at=EXCLUDED.updated_at`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.status,
        item.version,
        item,
        item.createdAt,
        item.updatedAt,
      ],
    );
  }
  async findPolicy(ownerId: string, companyId: string) {
    const result = await this.pool.query<Row>(
      "SELECT record FROM cross_company_collaboration_policies WHERE owner_id=$1 AND company_id=$2 AND status='ACTIVE'",
      [ownerId, companyId],
    );
    return result.rows[0]
      ? CrossCompanyCollaborationPolicySchema.parse(result.rows[0].record)
      : undefined;
  }
  async saveServiceRequest(value: CrossCompanyServiceRequest) {
    const item = CrossCompanyServiceRequestSchema.parse(value);
    await this.pool.query(
      `INSERT INTO cross_company_service_requests(id,owner_id,source_company_id,destination_company_id,status,trace_id,approval_id,deadline,record,created_at,updated_at,paying_company_id,paying_assignment_id,economy_reservation_id,economy_state,estimated_cost_credits,reserved_cost_credits,settled_cost_credits) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT(owner_id,id) DO UPDATE SET status=EXCLUDED.status,approval_id=EXCLUDED.approval_id,record=EXCLUDED.record,updated_at=EXCLUDED.updated_at,paying_company_id=EXCLUDED.paying_company_id,paying_assignment_id=EXCLUDED.paying_assignment_id,economy_reservation_id=EXCLUDED.economy_reservation_id,economy_state=EXCLUDED.economy_state,estimated_cost_credits=EXCLUDED.estimated_cost_credits,reserved_cost_credits=EXCLUDED.reserved_cost_credits,settled_cost_credits=EXCLUDED.settled_cost_credits`,
      [
        item.id,
        item.ownerId,
        item.sourceCompanyId,
        item.destinationCompanyId,
        item.status,
        item.traceId,
        item.approvalId,
        item.deadline,
        item,
        item.createdAt,
        item.updatedAt,
        item.payingCompanyId,
        item.payingAssignmentId,
        item.economyReservationId,
        item.economyState,
        item.estimatedCostCredits,
        item.reservedCostCredits,
        item.settledCostCredits,
      ],
    );
  }
  async findServiceRequest(ownerId: string, id: string) {
    const result = await this.pool.query<Row>(
      "SELECT record FROM cross_company_service_requests WHERE owner_id=$1 AND id=$2",
      [ownerId, id],
    );
    return result.rows[0]
      ? CrossCompanyServiceRequestSchema.parse(result.rows[0].record)
      : undefined;
  }
  async listServiceRequests(ownerId: string, companyId?: string) {
    const result = await this.pool.query<Row>(
      `SELECT record FROM cross_company_service_requests WHERE owner_id=$1 AND ($2::uuid IS NULL OR source_company_id=$2 OR destination_company_id=$2) ORDER BY updated_at DESC LIMIT 1000`,
      [ownerId, companyId ?? null],
    );
    return result.rows.map((row) => CrossCompanyServiceRequestSchema.parse(row.record));
  }
  async saveExecution(value: DurableExecution) {
    const item = DurableExecutionSchema.parse(value);
    await this.pool.query(
      `INSERT INTO durable_workflow_executions(id,owner_id,company_id,service_request_id,deterministic_key,status,backend,trace_id,record,created_at,updated_at,completed_at,next_run_at,lease_owner,lease_acquired_at,lease_expires_at,last_heartbeat_at,lease_generation) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT(owner_id,id) DO UPDATE SET status=EXCLUDED.status,record=EXCLUDED.record,updated_at=EXCLUDED.updated_at,completed_at=EXCLUDED.completed_at,next_run_at=EXCLUDED.next_run_at,lease_owner=EXCLUDED.lease_owner,lease_acquired_at=EXCLUDED.lease_acquired_at,lease_expires_at=EXCLUDED.lease_expires_at,last_heartbeat_at=EXCLUDED.last_heartbeat_at,lease_generation=EXCLUDED.lease_generation`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.serviceRequestId,
        item.deterministicKey,
        item.status,
        item.backend,
        item.traceId,
        item,
        item.createdAt,
        item.updatedAt,
        item.completedAt,
        item.nextRunAt,
        item.leaseOwner,
        item.leaseAcquiredAt,
        item.leaseExpiresAt,
        item.lastHeartbeatAt,
        item.leaseGeneration,
      ],
    );
  }
  async findExecution(ownerId: string, id: string) {
    const result = await this.pool.query<Row>(
      "SELECT record FROM durable_workflow_executions WHERE owner_id=$1 AND id=$2",
      [ownerId, id],
    );
    return result.rows[0]
      ? DurableExecutionSchema.parse(result.rows[0].record)
      : undefined;
  }
  async findExecutionByKey(ownerId: string, deterministicKey: string) {
    const result = await this.pool.query<Row>(
      "SELECT record FROM durable_workflow_executions WHERE owner_id=$1 AND deterministic_key=$2",
      [ownerId, deterministicKey],
    );
    return result.rows[0]
      ? DurableExecutionSchema.parse(result.rows[0].record)
      : undefined;
  }
  async listExecutions(ownerId: string, companyId?: string) {
    const result = await this.pool.query<Row>(
      "SELECT record FROM durable_workflow_executions WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY updated_at DESC LIMIT 2000",
      [ownerId, companyId ?? null],
    );
    return result.rows.map((row) => DurableExecutionSchema.parse(row.record));
  }
  async claimRunnable(input: {
    workerId: string;
    now: string;
    leaseMs: number;
    limit: number;
    maxPerCompany: number;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<
        Row & {
          id: string;
          owner_id: string;
          company_id: string;
          active_leases: string;
        }
      >(
        `SELECT d.id,d.owner_id,d.company_id,d.record,
                (SELECT count(*) FROM durable_workflow_executions active
                  WHERE active.owner_id=d.owner_id AND active.company_id=d.company_id
                    AND active.lease_expires_at > $1)::text AS active_leases
           FROM durable_workflow_executions d
           JOIN companies c ON c.owner_id=d.owner_id AND c.id=d.company_id
          WHERE d.status IN ('QUEUED','RUNNING')
            AND c.status='ACTIVE'
            AND (d.next_run_at IS NULL OR d.next_run_at <= $1)
            AND (d.lease_expires_at IS NULL OR d.lease_expires_at <= $1)
            AND pg_try_advisory_xact_lock(
                  hashtextextended(d.owner_id::text || ':' || d.company_id::text, 0)
                )
            AND (SELECT count(*) FROM durable_workflow_executions active
                  WHERE active.owner_id=d.owner_id AND active.company_id=d.company_id
                    AND active.lease_expires_at > $1) < $3
          ORDER BY (SELECT count(*) FROM durable_workflow_executions active
                    WHERE active.owner_id=d.owner_id AND active.company_id=d.company_id
                      AND active.lease_expires_at > $1), d.updated_at, d.id
          FOR UPDATE OF d SKIP LOCKED
          LIMIT ($2 * $3)`,
        [input.now, input.limit, input.maxPerCompany],
      );
      const leaseExpiresAt = new Date(
        new Date(input.now).getTime() + input.leaseMs,
      ).toISOString();
      const claimed: DurableExecution[] = [];
      const claimedByCompany = new Map<string, number>();
      for (const row of result.rows) {
        if (claimed.length >= input.limit) break;
        const companyClaims = claimedByCompany.get(row.company_id) ?? 0;
        if (Number(row.active_leases) + companyClaims >= input.maxPerCompany) continue;
        const current = DurableExecutionSchema.parse(row.record);
        const updated = DurableExecutionSchema.parse({
          ...current,
          leaseOwner: input.workerId,
          leaseAcquiredAt: input.now,
          leaseExpiresAt,
          lastHeartbeatAt: input.now,
          leaseGeneration: current.leaseGeneration + 1,
          updatedAt: input.now,
        });
        await client.query(
          `UPDATE durable_workflow_executions
              SET lease_owner=$3,lease_acquired_at=$4,lease_expires_at=$5,
                  last_heartbeat_at=$4,lease_generation=$6,record=$7,updated_at=$4
            WHERE owner_id=$1 AND id=$2`,
          [
            updated.ownerId,
            updated.id,
            input.workerId,
            input.now,
            leaseExpiresAt,
            updated.leaseGeneration,
            updated,
          ],
        );
        claimedByCompany.set(row.company_id, companyClaims + 1);
        claimed.push(updated);
      }
      await client.query("COMMIT");
      return claimed;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async renewLease(input: {
    ownerId: string;
    executionId: string;
    workerId: string;
    now: string;
    leaseMs: number;
  }) {
    const expires = new Date(
      new Date(input.now).getTime() + input.leaseMs,
    ).toISOString();
    const result = await this.pool.query<Row>(
      `UPDATE durable_workflow_executions
          SET lease_expires_at=$4,last_heartbeat_at=$3,updated_at=$3,
              record=jsonb_set(jsonb_set(record,'{leaseExpiresAt}',to_jsonb($4::text)),'{lastHeartbeatAt}',to_jsonb($3::text))
        WHERE owner_id=$1 AND id=$2 AND lease_owner=$5 AND lease_expires_at>$3
        RETURNING record`,
      [input.ownerId, input.executionId, input.now, expires, input.workerId],
    );
    return result.rows[0]
      ? DurableExecutionSchema.parse(result.rows[0].record)
      : undefined;
  }
  async releaseLease(ownerId: string, executionId: string, workerId: string) {
    await this.pool.query(
      `UPDATE durable_workflow_executions
          SET lease_owner=NULL,lease_acquired_at=NULL,lease_expires_at=NULL,last_heartbeat_at=NULL,
              record=record || '{"leaseOwner":null,"leaseAcquiredAt":null,"leaseExpiresAt":null,"lastHeartbeatAt":null}'::jsonb
        WHERE owner_id=$1 AND id=$2 AND lease_owner=$3`,
      [ownerId, executionId, workerId],
    );
  }
  async appendEvent(value: DurableExecutionEvent) {
    const item = DurableExecutionEventSchema.parse(value);
    await this.pool.query(
      `INSERT INTO durable_workflow_events(id,owner_id,company_id,execution_id,sequence,event_type,record,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(owner_id,execution_id,sequence) DO NOTHING`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.executionId,
        item.sequence,
        item.eventType,
        item,
        item.createdAt,
      ],
    );
  }
  async listEvents(ownerId: string, executionId: string) {
    const result = await this.pool.query<Row>(
      "SELECT record FROM durable_workflow_events WHERE owner_id=$1 AND execution_id=$2 ORDER BY sequence",
      [ownerId, executionId],
    );
    return result.rows.map((row) => DurableExecutionEventSchema.parse(row.record));
  }
  async saveReceipt(value: DurableActivityReceipt) {
    const item = DurableActivityReceiptSchema.parse(value);
    await this.pool.query(
      `INSERT INTO durable_activity_receipts(id,owner_id,company_id,execution_id,idempotency_key,status,record,created_at,updated_at,request_digest,commit_evidence_ref,result_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(owner_id,idempotency_key) DO UPDATE SET status=EXCLUDED.status,record=EXCLUDED.record,updated_at=EXCLUDED.updated_at,request_digest=EXCLUDED.request_digest,commit_evidence_ref=EXCLUDED.commit_evidence_ref,result_ref=EXCLUDED.result_ref`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.executionId,
        item.idempotencyKey,
        item.status,
        item,
        item.createdAt,
        item.updatedAt,
        item.requestDigest,
        item.commitEvidenceRef,
        item.resultRef,
      ],
    );
  }
  async findReceipt(ownerId: string, idempotencyKey: string) {
    const result = await this.pool.query<Row>(
      "SELECT record FROM durable_activity_receipts WHERE owner_id=$1 AND idempotency_key=$2",
      [ownerId, idempotencyKey],
    );
    return result.rows[0]
      ? DurableActivityReceiptSchema.parse(result.rows[0].record)
      : undefined;
  }
  async saveSandboxResult(value: SandboxExecutionResult) {
    const item = SandboxExecutionResultSchema.parse(value);
    await this.pool.query(
      `INSERT INTO sandbox_execution_results(id,owner_id,company_id,assignment_id,task_id,status,trace_id,record,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.assignmentId,
        item.taskId,
        item.status,
        item.traceId,
        item,
        item.createdAt,
      ],
    );
  }
  async listSandboxResults(ownerId: string, companyId?: string) {
    const result = await this.pool.query<Row>(
      "SELECT record FROM sandbox_execution_results WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY created_at DESC LIMIT 1000",
      [ownerId, companyId ?? null],
    );
    return result.rows.map((row) => SandboxExecutionResultSchema.parse(row.record));
  }
}
