import {
  AIObservabilityTraceSchema,
  GovernorProposalSchema,
  PortfolioObjectiveSchema,
  SystemTelemetrySpanSchema,
  type AIObservabilityTrace,
  type GovernorProposal,
  type PortfolioObjective,
  type SystemTelemetrySpan,
} from "@alexa-control/shared";
import type { Pool } from "pg";
import { z } from "zod";

import type { Awaitable } from "../identity/store.js";

export const PortfolioAlertStateSchema = z
  .object({
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    signalId: z.string().min(1).max(240),
    status: z.enum(["ACKNOWLEDGED", "SNOOZED"]),
    snoozedUntil: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type PortfolioAlertState = z.infer<typeof PortfolioAlertStateSchema>;

export interface ObservabilityStore {
  saveSystemSpan(value: SystemTelemetrySpan): Awaitable<void>;
  listSystemSpans(
    ownerId: string,
    query: {
      companyId?: string;
      traceId?: string;
      status?: "OK" | "ERROR";
      limit: number;
    },
  ): Awaitable<SystemTelemetrySpan[]>;
  saveAITrace(value: AIObservabilityTrace): Awaitable<void>;
  listAITraces(
    ownerId: string,
    query: {
      companyId?: string;
      provider?: string;
      model?: string;
      taskClass?: string;
      limit: number;
    },
  ): Awaitable<AIObservabilityTrace[]>;
  saveAlertState(value: PortfolioAlertState): Awaitable<void>;
  listAlertStates(ownerId: string): Awaitable<PortfolioAlertState[]>;
  findPortfolioObjectiveByIdempotencyKey(
    ownerId: string,
    idempotencyKey: string,
  ): Awaitable<PortfolioObjective | null>;
  savePortfolioObjective(value: PortfolioObjective): Awaitable<void>;
  updatePortfolioObjective(value: PortfolioObjective): Awaitable<void>;
  listPortfolioObjectives(ownerId: string): Awaitable<PortfolioObjective[]>;
  saveGovernorProposal(value: GovernorProposal): Awaitable<void>;
  findGovernorProposal(ownerId: string, id: string): Awaitable<GovernorProposal | null>;
  listGovernorProposals(ownerId: string, portfolioObjectiveId?: string): Awaitable<GovernorProposal[]>;
  claimGovernorProposals(input: { workerId: string; now: string; leaseMs: number; limit: number }): Awaitable<GovernorProposal[]>;
  renewGovernorProposalLease(input: { ownerId: string; proposalId: string; workerId: string; now: string; leaseMs: number }): Awaitable<GovernorProposal | null>;
  releaseGovernorProposalLease(ownerId: string, proposalId: string, workerId: string): Awaitable<void>;
  purgeExpired(before: string): Awaitable<number>;
}

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryObservabilityStore implements ObservabilityStore {
  readonly #spans = new Map<string, SystemTelemetrySpan>();
  readonly #ai = new Map<string, AIObservabilityTrace>();
  readonly #alerts = new Map<string, PortfolioAlertState>();
  readonly #objectives = new Map<string, PortfolioObjective>();
  readonly #governorProposals = new Map<string, GovernorProposal>();

  saveSystemSpan(value: SystemTelemetrySpan) {
    const item = SystemTelemetrySpanSchema.parse(value);
    this.#spans.set(`${item.ownerId}:${item.id}`, clone(item));
  }
  listSystemSpans(
    ownerId: string,
    query: {
      companyId?: string;
      traceId?: string;
      status?: "OK" | "ERROR";
      limit: number;
    },
  ) {
    return [...this.#spans.values()]
      .filter((item) => item.ownerId === ownerId)
      .filter((item) => !query.companyId || item.companyId === query.companyId)
      .filter((item) => !query.traceId || item.traceId === query.traceId)
      .filter((item) => !query.status || item.status === query.status)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, query.limit)
      .map(clone);
  }
  saveAITrace(value: AIObservabilityTrace) {
    const item = AIObservabilityTraceSchema.parse(value);
    this.#ai.set(`${item.ownerId}:${item.companyId}:${item.id}`, clone(item));
  }
  listAITraces(
    ownerId: string,
    query: {
      companyId?: string;
      provider?: string;
      model?: string;
      taskClass?: string;
      limit: number;
    },
  ) {
    return [...this.#ai.values()]
      .filter((item) => item.ownerId === ownerId)
      .filter((item) => !query.companyId || item.companyId === query.companyId)
      .filter((item) => !query.provider || item.provider === query.provider)
      .filter((item) => !query.model || item.model === query.model)
      .filter((item) => !query.taskClass || item.taskClass === query.taskClass)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, query.limit)
      .map(clone);
  }
  saveAlertState(value: PortfolioAlertState) {
    const item = PortfolioAlertStateSchema.parse(value);
    this.#alerts.set(`${item.ownerId}:${item.signalId}`, clone(item));
  }
  listAlertStates(ownerId: string) {
    return [...this.#alerts.values()]
      .filter((item) => item.ownerId === ownerId)
      .map(clone);
  }
  findPortfolioObjectiveByIdempotencyKey(ownerId: string, idempotencyKey: string) {
    return [...this.#objectives.values()].find(
      (item) => item.ownerId === ownerId && item.idempotencyKey === idempotencyKey,
    ) ?? null;
  }
  savePortfolioObjective(value: PortfolioObjective) {
    const item = PortfolioObjectiveSchema.parse(value);
    this.#objectives.set(`${item.ownerId}:${item.id}`, clone(item));
  }
  updatePortfolioObjective(value: PortfolioObjective) {
    const item = PortfolioObjectiveSchema.parse(value);
    const key = `${item.ownerId}:${item.id}`;
    if (!this.#objectives.has(key)) throw Object.assign(new Error("Portfolio objective not found."), { code: "PORTFOLIO_OBJECTIVE_NOT_FOUND" });
    this.#objectives.set(key, clone(item));
  }
  listPortfolioObjectives(ownerId: string) {
    return [...this.#objectives.values()]
      .filter((item) => item.ownerId === ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }
  saveGovernorProposal(value: GovernorProposal) {
    const item = GovernorProposalSchema.parse(value);
    const duplicate = [...this.#governorProposals.values()].find((entry) => entry.ownerId === item.ownerId && entry.idempotencyKey === item.idempotencyKey);
    if (duplicate && duplicate.id !== item.id) return;
    this.#governorProposals.set(`${item.ownerId}:${item.id}`, clone(item));
  }
  findGovernorProposal(ownerId: string, id: string) {
    const value = this.#governorProposals.get(`${ownerId}:${id}`);
    return value ? clone(value) : null;
  }
  listGovernorProposals(ownerId: string, portfolioObjectiveId?: string) {
    return [...this.#governorProposals.values()]
      .filter((item) => item.ownerId === ownerId && (!portfolioObjectiveId || item.portfolioObjectiveId === portfolioObjectiveId))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)).map(clone);
  }
  claimGovernorProposals(input: { workerId: string; now: string; leaseMs: number; limit: number }) {
    const claimed: GovernorProposal[] = [];
    const candidates = [...this.#governorProposals.values()]
      .filter((item) => ["DELIVERED", "UNDER_REVIEW"].includes(item.status))
      .filter((item) => item.expiresAt > input.now)
      .filter((item) => !item.leaseExpiresAt || item.leaseExpiresAt <= input.now)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
    for (const item of candidates.slice(0, input.limit)) {
      const updated = GovernorProposalSchema.parse({
        ...item, status: "UNDER_REVIEW", leaseOwner: input.workerId,
        leaseAcquiredAt: input.now,
        leaseExpiresAt: new Date(new Date(input.now).getTime() + input.leaseMs).toISOString(),
        leaseGeneration: item.leaseGeneration + 1, attemptCount: Math.min(100, item.attemptCount + 1),
        updatedAt: input.now,
      });
      this.#governorProposals.set(`${updated.ownerId}:${updated.id}`, clone(updated));
      claimed.push(clone(updated));
    }
    return claimed;
  }
  renewGovernorProposalLease(input: { ownerId: string; proposalId: string; workerId: string; now: string; leaseMs: number }) {
    const item = this.#governorProposals.get(`${input.ownerId}:${input.proposalId}`);
    if (!item || item.leaseOwner !== input.workerId || !item.leaseExpiresAt || item.leaseExpiresAt <= input.now) return null;
    const updated = GovernorProposalSchema.parse({
      ...item,
      leaseExpiresAt: new Date(new Date(input.now).getTime() + input.leaseMs).toISOString(),
      updatedAt: input.now,
    });
    this.#governorProposals.set(`${updated.ownerId}:${updated.id}`, clone(updated));
    return clone(updated);
  }
  releaseGovernorProposalLease(ownerId: string, proposalId: string, workerId: string) {
    const item = this.#governorProposals.get(`${ownerId}:${proposalId}`);
    if (!item || item.leaseOwner !== workerId) return;
    this.#governorProposals.set(`${ownerId}:${proposalId}`, GovernorProposalSchema.parse({
      ...item, status: item.status === "UNDER_REVIEW" ? "DELIVERED" : item.status,
      leaseOwner: null, leaseAcquiredAt: null, leaseExpiresAt: null,
    }));
  }
  purgeExpired(before: string) {
    let removed = 0;
    for (const [key, item] of this.#spans)
      if (item.expiresAt <= before) {
        this.#spans.delete(key);
        removed += 1;
      }
    for (const [key, item] of this.#ai)
      if (item.expiresAt <= before) {
        this.#ai.delete(key);
        removed += 1;
      }
    return removed;
  }
}

type RecordRow = { record: unknown };
export class PostgresObservabilityStore implements ObservabilityStore {
  constructor(readonly pool: Pool) {}

  async saveSystemSpan(value: SystemTelemetrySpan) {
    const item = SystemTelemetrySpanSchema.parse(value);
    await this.pool.query(
      `INSERT INTO owner_system_telemetry_spans(id,owner_id,company_id,trace_id,span_id,parent_span_id,service,operation,status,error_source,objective_id,workflow_id,task_id,assignment_id,provider,model,started_at,ended_at,expires_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT(owner_id,trace_id,span_id) DO UPDATE SET status=EXCLUDED.status,error_source=EXCLUDED.error_source,ended_at=EXCLUDED.ended_at,record=EXCLUDED.record`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.traceId,
        item.spanId,
        item.parentSpanId,
        item.service,
        item.operation,
        item.status,
        item.errorSource,
        item.objectiveId,
        item.workflowId,
        item.taskId,
        item.assignmentId,
        item.provider,
        item.model,
        item.startedAt,
        item.endedAt,
        item.expiresAt,
        item,
      ],
    );
  }
  async listSystemSpans(
    ownerId: string,
    query: {
      companyId?: string;
      traceId?: string;
      status?: "OK" | "ERROR";
      limit: number;
    },
  ) {
    const result = await this.pool.query<RecordRow>(
      `SELECT record FROM owner_system_telemetry_spans WHERE owner_id=$1
       AND ($2::uuid IS NULL OR company_id=$2) AND ($3::text IS NULL OR trace_id=$3)
       AND ($4::text IS NULL OR status=$4) ORDER BY started_at DESC LIMIT $5`,
      [
        ownerId,
        query.companyId ?? null,
        query.traceId ?? null,
        query.status ?? null,
        query.limit,
      ],
    );
    return result.rows.map((row) => SystemTelemetrySpanSchema.parse(row.record));
  }
  async saveAITrace(value: AIObservabilityTrace) {
    const item = AIObservabilityTraceSchema.parse(value);
    await this.pool.query(
      `INSERT INTO owner_ai_observability_traces(id,owner_id,company_id,trace_id,assignment_id,objective_id,workflow_id,task_id,provider,model,task_class,prompt_version,policy_version,success,cost_credits,started_at,ended_at,expires_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT(owner_id,company_id,id) DO UPDATE SET success=EXCLUDED.success,cost_credits=EXCLUDED.cost_credits,ended_at=EXCLUDED.ended_at,record=EXCLUDED.record`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.traceId,
        item.assignmentId,
        item.objectiveId,
        item.workflowId,
        item.taskId,
        item.provider,
        item.model,
        item.taskClass,
        item.promptVersion,
        item.policyVersion,
        item.success,
        item.costCredits,
        item.startedAt,
        item.endedAt,
        item.expiresAt,
        item,
      ],
    );
  }
  async listAITraces(
    ownerId: string,
    query: {
      companyId?: string;
      provider?: string;
      model?: string;
      taskClass?: string;
      limit: number;
    },
  ) {
    const result = await this.pool.query<RecordRow>(
      `SELECT record FROM owner_ai_observability_traces WHERE owner_id=$1
       AND ($2::uuid IS NULL OR company_id=$2) AND ($3::text IS NULL OR provider=$3)
       AND ($4::text IS NULL OR model=$4) AND ($5::text IS NULL OR task_class=$5)
       ORDER BY started_at DESC LIMIT $6`,
      [
        ownerId,
        query.companyId ?? null,
        query.provider ?? null,
        query.model ?? null,
        query.taskClass ?? null,
        query.limit,
      ],
    );
    return result.rows.map((row) => AIObservabilityTraceSchema.parse(row.record));
  }
  async saveAlertState(value: PortfolioAlertState) {
    const item = PortfolioAlertStateSchema.parse(value);
    await this.pool.query(
      `INSERT INTO owner_portfolio_alert_states(owner_id,signal_id,company_id,status,snoozed_until,updated_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(owner_id,signal_id) DO UPDATE SET status=EXCLUDED.status,snoozed_until=EXCLUDED.snoozed_until,updated_at=EXCLUDED.updated_at,record=EXCLUDED.record`,
      [
        item.ownerId,
        item.signalId,
        item.companyId,
        item.status,
        item.snoozedUntil,
        item.updatedAt,
        item,
      ],
    );
  }
  async listAlertStates(ownerId: string) {
    const result = await this.pool.query<RecordRow>(
      "SELECT record FROM owner_portfolio_alert_states WHERE owner_id=$1 ORDER BY updated_at DESC",
      [ownerId],
    );
    return result.rows.map((row) => PortfolioAlertStateSchema.parse(row.record));
  }
  async findPortfolioObjectiveByIdempotencyKey(ownerId: string, idempotencyKey: string) {
    const result = await this.pool.query<RecordRow>(
      "SELECT record FROM owner_portfolio_objectives WHERE owner_id=$1 AND idempotency_key=$2",
      [ownerId, idempotencyKey],
    );
    return result.rows[0]
      ? PortfolioObjectiveSchema.parse(result.rows[0].record)
      : null;
  }
  async savePortfolioObjective(value: PortfolioObjective) {
    const item = PortfolioObjectiveSchema.parse(value);
    await this.pool.query(
      `INSERT INTO owner_portfolio_objectives(id,owner_id,idempotency_key,status,created_at,updated_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(owner_id,idempotency_key) DO NOTHING`,
      [item.id, item.ownerId, item.idempotencyKey, item.status, item.createdAt, item.updatedAt, item],
    );
  }
  async updatePortfolioObjective(value: PortfolioObjective) {
    const item = PortfolioObjectiveSchema.parse(value);
    const result = await this.pool.query(
      "UPDATE owner_portfolio_objectives SET status=$3,updated_at=$4,record=$5 WHERE id=$1 AND owner_id=$2",
      [item.id, item.ownerId, item.status, item.updatedAt, item],
    );
    if (result.rowCount !== 1) throw Object.assign(new Error("Portfolio objective not found."), { code: "PORTFOLIO_OBJECTIVE_NOT_FOUND" });
  }
  async listPortfolioObjectives(ownerId: string) {
    const result = await this.pool.query<RecordRow>(
      "SELECT record FROM owner_portfolio_objectives WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 500",
      [ownerId],
    );
    return result.rows.map((row) => PortfolioObjectiveSchema.parse(row.record));
  }
  async saveGovernorProposal(value: GovernorProposal) {
    const item = GovernorProposalSchema.parse(value);
    await this.pool.query(
      `INSERT INTO owner_governor_proposals(id,owner_id,company_id,portfolio_objective_id,status,idempotency_key,expires_at,
         lease_owner,lease_acquired_at,lease_expires_at,lease_generation,attempt_count,created_at,updated_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT(owner_id,idempotency_key) DO UPDATE SET status=EXCLUDED.status,
         lease_owner=EXCLUDED.lease_owner,lease_acquired_at=EXCLUDED.lease_acquired_at,
         lease_expires_at=EXCLUDED.lease_expires_at,lease_generation=EXCLUDED.lease_generation,
         attempt_count=EXCLUDED.attempt_count,updated_at=EXCLUDED.updated_at,record=EXCLUDED.record
       WHERE owner_governor_proposals.id=EXCLUDED.id`,
      [item.id, item.ownerId, item.companyId, item.portfolioObjectiveId, item.status,
        item.idempotencyKey, item.expiresAt, item.leaseOwner, item.leaseAcquiredAt,
        item.leaseExpiresAt, item.leaseGeneration, item.attemptCount,
        item.createdAt, item.updatedAt, item],
    );
  }
  async findGovernorProposal(ownerId: string, id: string) {
    const result = await this.pool.query<RecordRow>("SELECT record FROM owner_governor_proposals WHERE owner_id=$1 AND id=$2", [ownerId, id]);
    return result.rows[0] ? GovernorProposalSchema.parse(result.rows[0].record) : null;
  }
  async listGovernorProposals(ownerId: string, portfolioObjectiveId?: string) {
    const result = await this.pool.query<RecordRow>(
      "SELECT record FROM owner_governor_proposals WHERE owner_id=$1 AND ($2::uuid IS NULL OR portfolio_objective_id=$2) ORDER BY created_at DESC LIMIT 1000",
      [ownerId, portfolioObjectiveId ?? null],
    );
    return result.rows.map((row) => GovernorProposalSchema.parse(row.record));
  }
  async claimGovernorProposals(input: { workerId: string; now: string; leaseMs: number; limit: number }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<RecordRow & { id: string }>(
        `SELECT id,record FROM owner_governor_proposals
         WHERE status IN ('DELIVERED','UNDER_REVIEW') AND expires_at>$1
           AND (lease_expires_at IS NULL OR lease_expires_at<=$1)
         ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT $2`,
        [input.now, input.limit],
      );
      const claimed: GovernorProposal[] = [];
      for (const row of result.rows) {
        const item = GovernorProposalSchema.parse(row.record);
        const updated = GovernorProposalSchema.parse({
          ...item, status: "UNDER_REVIEW", leaseOwner: input.workerId,
          leaseAcquiredAt: input.now,
          leaseExpiresAt: new Date(new Date(input.now).getTime() + input.leaseMs).toISOString(),
          leaseGeneration: item.leaseGeneration + 1, attemptCount: Math.min(100, item.attemptCount + 1),
          updatedAt: input.now,
        });
        await client.query(
          `UPDATE owner_governor_proposals SET status=$3,lease_owner=$4,lease_acquired_at=$5,
             lease_expires_at=$6,lease_generation=$7,attempt_count=$8,updated_at=$9,record=$10
           WHERE owner_id=$1 AND id=$2`,
          [updated.ownerId, updated.id, updated.status, updated.leaseOwner, updated.leaseAcquiredAt,
            updated.leaseExpiresAt, updated.leaseGeneration, updated.attemptCount, updated.updatedAt, updated],
        );
        claimed.push(updated);
      }
      await client.query("COMMIT");
      return claimed;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  async renewGovernorProposalLease(input: { ownerId: string; proposalId: string; workerId: string; now: string; leaseMs: number }) {
    const item = await this.findGovernorProposal(input.ownerId, input.proposalId);
    if (!item || item.leaseOwner !== input.workerId || !item.leaseExpiresAt || item.leaseExpiresAt <= input.now) return null;
    const updated = GovernorProposalSchema.parse({
      ...item,
      leaseExpiresAt: new Date(new Date(input.now).getTime() + input.leaseMs).toISOString(),
      updatedAt: input.now,
    });
    const result = await this.pool.query(
      `UPDATE owner_governor_proposals SET lease_expires_at=$4,updated_at=$5,record=$6
       WHERE owner_id=$1 AND id=$2 AND lease_owner=$3 AND lease_expires_at>$5`,
      [input.ownerId, input.proposalId, input.workerId, updated.leaseExpiresAt, input.now, updated],
    );
    return result.rowCount === 1 ? updated : null;
  }
  async releaseGovernorProposalLease(ownerId: string, proposalId: string, workerId: string) {
    const item = await this.findGovernorProposal(ownerId, proposalId);
    if (!item || item.leaseOwner !== workerId) return;
    const updated = GovernorProposalSchema.parse({
      ...item, status: item.status === "UNDER_REVIEW" ? "DELIVERED" : item.status,
      leaseOwner: null, leaseAcquiredAt: null, leaseExpiresAt: null,
    });
    await this.pool.query(
      `UPDATE owner_governor_proposals SET status=$4,lease_owner=NULL,lease_acquired_at=NULL,
         lease_expires_at=NULL,record=$5 WHERE owner_id=$1 AND id=$2 AND lease_owner=$3`,
      [ownerId, proposalId, workerId, updated.status, updated],
    );
  }
  async purgeExpired(before: string) {
    const [spans, ai] = await Promise.all([
      this.pool.query("DELETE FROM owner_system_telemetry_spans WHERE expires_at<$1", [
        before,
      ]),
      this.pool.query("DELETE FROM owner_ai_observability_traces WHERE expires_at<$1", [
        before,
      ]),
    ]);
    return (spans.rowCount ?? 0) + (ai.rowCount ?? 0);
  }
}
