import {
  AIObservabilityTraceSchema,
  SystemTelemetrySpanSchema,
  type AIObservabilityTrace,
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
  purgeExpired(before: string): Awaitable<number>;
}

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryObservabilityStore implements ObservabilityStore {
  readonly #spans = new Map<string, SystemTelemetrySpan>();
  readonly #ai = new Map<string, AIObservabilityTrace>();
  readonly #alerts = new Map<string, PortfolioAlertState>();

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
