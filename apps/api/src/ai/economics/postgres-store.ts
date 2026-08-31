import {
  AIBudgetPolicySchema,
  AIBudgetReservationSchema,
  AIEconomicOverrideDescriptorSchema,
  AIEconomicOverrideGrantSchema,
  AIPricingSchema,
  AIUsageLedgerEntrySchema,
  type AIBudgetPolicy,
  type AIBudgetReservation,
  type AIPricing,
  type AIUsageLedgerEntry,
} from "@alexa-control/shared";
import type pg from "pg";
import { AIEconomicError } from "./errors.js";
import { digestEconomicOverride } from "./override-digest.js";
import {
  assertReservationAllowed,
  decimalToUnits,
  policyApplies,
  type AIEconomicsStore,
  type AtomicReservationInput,
  type AtomicSettlementInput,
  type OverrideGrantReservationInput,
  type OverrideGrantWithDescriptor,
  assertOverrideBindings,
} from "./store.js";
import { companyScope } from "../../companies/scope.js";

type Row = Record<string, unknown>;
const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : String(value);
const optionalIso = (value: unknown) =>
  value === null || value === undefined ? undefined : iso(value);
const optionalString = (value: unknown) =>
  value === null || value === undefined
    ? undefined
    : typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "bigint"
        ? `${value}`
        : undefined;
const optionalNumber = (value: unknown) =>
  value === null || value === undefined ? undefined : Number(value);

const pricingFromRow = (row: Row): AIPricing =>
  AIPricingSchema.parse({
    id: row.id,
    providerId: row.provider_key,
    modelId: row.model_key,
    currency: row.currency,
    inputPerMillionTokens: optionalString(row.input_per_million_tokens),
    cachedInputPerMillionTokens: optionalString(row.cached_input_per_million_tokens),
    outputPerMillionTokens: optionalString(row.output_per_million_tokens),
    requestFee: optionalString(row.request_fee),
    effectiveFrom: iso(row.effective_from),
    effectiveUntil: optionalIso(row.effective_until),
    version: row.version,
    source: optionalString(row.source),
    status: row.status,
  });

const policyFromRow = (row: Row): AIBudgetPolicy =>
  AIBudgetPolicySchema.parse({
    id: row.id,
    ownerId: row.owner_id,
    scope: row.scope,
    scopeId: optionalString(row.scope_id),
    period: row.period,
    currency: row.currency,
    limitUsd: String(row.limit_usd),
    warningThresholdPct: Number(row.warning_threshold_pct),
    throttleThresholdPct: optionalNumber(row.throttle_threshold_pct),
    hardStopThresholdPct: Number(row.hard_stop_threshold_pct),
    overflowBehavior: row.overflow_behavior,
    enabled: row.enabled,
    priority: optionalNumber(row.priority),
    maxCallsPerMinute: optionalNumber(row.max_calls_per_minute),
    maxCallsPerRun: optionalNumber(row.max_calls_per_run),
    maxCloudCallsPerRun: optionalNumber(row.max_cloud_calls_per_run),
    effectiveFrom: iso(row.effective_from),
    effectiveUntil: optionalIso(row.effective_until),
  });

const reservationFromRow = (row: Row): AIBudgetReservation =>
  AIBudgetReservationSchema.parse({
    id: row.id,
    ownerId: row.owner_id,
    requestId: row.request_id,
    routeId: optionalString(row.route_id),
    attemptId: optionalString(row.attempt_id),
    providerId: optionalString(row.provider_key),
    modelId: optionalString(row.model_key),
    pricingVersion: optionalString(row.pricing_version),
    policyIds: row.policy_ids ?? [],
    context: row.context_json ?? undefined,
    amountUsd: String(row.amount_usd),
    status: row.status,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    settledAmountUsd: optionalString(row.settled_amount_usd),
  });

const ledgerFromRow = (row: Row): AIUsageLedgerEntry =>
  AIUsageLedgerEntrySchema.parse({
    id: row.id,
    ownerId: row.owner_id,
    requestId: row.request_id,
    routeId: optionalString(row.route_id),
    attemptId: optionalString(row.attempt_id),
    reservationId: optionalString(row.reservation_id),
    providerId: row.provider_key,
    modelId: row.model_key,
    agentId: optionalString(row.agent_id),
    departmentId: optionalString(row.department_id),
    workflowId: optionalString(row.workflow_id),
    workflowRunId: optionalString(row.workflow_run_id),
    taskId: optionalString(row.task_id),
    conversationId: optionalString(row.conversation_id),
    purpose: row.purpose,
    locality: row.locality,
    usage: {
      inputTokens: optionalNumber(row.input_tokens),
      cachedInputTokens: optionalNumber(row.cached_input_tokens),
      outputTokens: optionalNumber(row.output_tokens),
      reasoningTokens: optionalNumber(row.reasoning_tokens),
      totalTokens: optionalNumber(row.total_tokens),
      source: row.usage_source,
    },
    estimatedCostUsd: optionalString(row.estimated_cost_usd),
    actualCostUsd: optionalString(row.actual_cost_usd),
    pricingVersion: optionalString(row.pricing_version),
    status: row.status,
    startedAt: iso(row.started_at),
    completedAt: optionalIso(row.completed_at),
    metadata: {
      ...((row.metadata_json as Record<string, unknown> | null) ?? {}),
      ...(optionalString(row.cost_center)
        ? { costCenter: optionalString(row.cost_center) }
        : {}),
    },
  });

const grantFromRow = (row: Row): OverrideGrantWithDescriptor => {
  const descriptor = AIEconomicOverrideDescriptorSchema.parse(row.descriptor_json);
  return {
    grant: AIEconomicOverrideGrantSchema.parse({
      id: row.id,
      ownerId: row.owner_id,
      approvalId: row.approval_id,
      requestId: row.request_id,
      digest: row.digest,
      maxAdditionalSpendUsd: String(row.max_additional_spend_usd),
      expiresAt: iso(row.expires_at),
      status: row.status,
      createdAt: iso(row.created_at),
      ...(row.consumed_at ? { consumedAt: iso(row.consumed_at) } : {}),
    }),
    descriptor,
  };
};

const insertLedger = async (client: pg.PoolClient, entry: AIUsageLedgerEntry) => {
  await client.query(
    `INSERT INTO ai_usage_ledger(
      id, owner_id, request_id, route_id, attempt_id, reservation_id,
      provider_key, model_key, agent_id, department_id, workflow_id,
      workflow_run_id, task_id, conversation_id, purpose, locality,
      input_tokens, cached_input_tokens, output_tokens, reasoning_tokens,
      total_tokens, usage_source, estimated_cost_usd, actual_cost_usd,
      pricing_version, status, started_at, completed_at, metadata_json, cost_center, company_id
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
      $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31
    )`,
    [
      entry.id,
      entry.ownerId,
      entry.requestId,
      entry.routeId ?? null,
      entry.attemptId ?? null,
      entry.reservationId ?? null,
      entry.providerId,
      entry.modelId,
      entry.agentId ?? null,
      entry.departmentId ?? null,
      entry.workflowId ?? null,
      entry.workflowRunId ?? null,
      entry.taskId ?? null,
      entry.conversationId ?? null,
      entry.purpose,
      entry.locality,
      entry.usage.inputTokens ?? null,
      entry.usage.cachedInputTokens ?? null,
      entry.usage.outputTokens ?? null,
      entry.usage.reasoningTokens ?? null,
      entry.usage.totalTokens ?? null,
      entry.usage.source,
      entry.estimatedCostUsd ?? null,
      entry.actualCostUsd ?? null,
      entry.pricingVersion ?? null,
      entry.status,
      entry.startedAt,
      entry.completedAt ?? null,
      entry.metadata ?? {},
      typeof entry.metadata?.costCenter === "string" ? entry.metadata.costCenter : null,
      companyScope.companyId(entry.ownerId) ?? null,
    ],
  );
};

export class PostgresAIEconomicsStore implements AIEconomicsStore {
  readonly persistence = "POSTGRESQL" as const;
  constructor(private readonly pool: pg.Pool) {}

  async health() {
    try {
      await this.pool.query("SELECT 1 FROM ai_budget_policies LIMIT 1");
      return true;
    } catch {
      return false;
    }
  }

  async listPricing() {
    const result = await this.pool.query<Row>(
      `SELECT * FROM ai_pricing_versions ORDER BY provider_key, model_key, effective_from DESC`,
    );
    return result.rows.map(pricingFromRow);
  }

  async upsertPricing(input: AIPricing) {
    const item = AIPricingSchema.parse(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (item.status === "ACTIVE")
        await client.query(
          `UPDATE ai_pricing_versions SET status='HISTORICAL', effective_until=COALESCE(effective_until, $3)
           WHERE provider_key=$1 AND model_key=$2 AND status='ACTIVE' AND version<>$4`,
          [item.providerId, item.modelId, item.effectiveFrom, item.version],
        );
      await client.query(
        `INSERT INTO ai_pricing_versions(
          id, provider_key, model_key, currency, input_per_million_tokens,
          cached_input_per_million_tokens, output_per_million_tokens, request_fee,
          version, effective_from, effective_until, source, status, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
        ON CONFLICT(provider_key, model_key, version) DO NOTHING`,
        [
          item.id,
          item.providerId,
          item.modelId,
          item.currency,
          item.inputPerMillionTokens ?? null,
          item.cachedInputPerMillionTokens ?? null,
          item.outputPerMillionTokens ?? null,
          item.requestFee ?? null,
          item.version,
          item.effectiveFrom,
          item.effectiveUntil ?? null,
          item.source ?? null,
          item.status,
        ],
      );
      const stored = await client.query<Row>(
        `SELECT * FROM ai_pricing_versions WHERE provider_key=$1 AND model_key=$2 AND version=$3`,
        [item.providerId, item.modelId, item.version],
      );
      await client.query("COMMIT");
      return pricingFromRow(stored.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listPolicies(ownerId: string) {
    const result = await this.pool.query<Row>(
      `SELECT * FROM ai_budget_policies WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY scope, scope_id NULLS FIRST, id`,
      [ownerId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map(policyFromRow);
  }

  async upsertPolicy(input: AIBudgetPolicy) {
    const item = AIBudgetPolicySchema.parse(input);
    const result = await this.pool.query<Row>(
      `INSERT INTO ai_budget_policies(
        id, owner_id, scope, scope_id, period, currency, limit_usd,
        warning_threshold_pct, throttle_threshold_pct, hard_stop_threshold_pct,
        overflow_behavior, enabled, priority, effective_from, effective_until,
        max_calls_per_minute, max_calls_per_run, max_cloud_calls_per_run,
        created_at, updated_at, company_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW(),$19)
      ON CONFLICT(id) DO UPDATE SET
        scope=EXCLUDED.scope, scope_id=EXCLUDED.scope_id, period=EXCLUDED.period,
        currency=EXCLUDED.currency, limit_usd=EXCLUDED.limit_usd,
        warning_threshold_pct=EXCLUDED.warning_threshold_pct,
        throttle_threshold_pct=EXCLUDED.throttle_threshold_pct,
        hard_stop_threshold_pct=EXCLUDED.hard_stop_threshold_pct,
        overflow_behavior=EXCLUDED.overflow_behavior, enabled=EXCLUDED.enabled,
        priority=EXCLUDED.priority, effective_from=EXCLUDED.effective_from,
        effective_until=EXCLUDED.effective_until,
        max_calls_per_minute=EXCLUDED.max_calls_per_minute,
        max_calls_per_run=EXCLUDED.max_calls_per_run,
        max_cloud_calls_per_run=EXCLUDED.max_cloud_calls_per_run,
        updated_at=NOW()
      WHERE ai_budget_policies.owner_id=EXCLUDED.owner_id AND ai_budget_policies.company_id=EXCLUDED.company_id
      RETURNING *`,
      [
        item.id,
        item.ownerId,
        item.scope,
        item.scopeId ?? null,
        item.period,
        item.currency,
        item.limitUsd,
        item.warningThresholdPct,
        item.throttleThresholdPct ?? null,
        item.hardStopThresholdPct,
        item.overflowBehavior,
        item.enabled,
        item.priority ?? null,
        item.effectiveFrom,
        item.effectiveUntil ?? null,
        item.maxCallsPerMinute ?? null,
        item.maxCallsPerRun ?? null,
        item.maxCloudCallsPerRun ?? null,
        companyScope.companyId(item.ownerId) ?? null,
      ],
    );
    if (!result.rows[0]) throw new Error("BUDGET_POLICY_OWNER_MISMATCH");
    return policyFromRow(result.rows[0]);
  }

  async disablePolicy(ownerId: string, id: string) {
    const result = await this.pool.query(
      `UPDATE ai_budget_policies SET enabled=FALSE, updated_at=NOW() WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR company_id=$3)`,
      [id, ownerId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rowCount === 1;
  }

  async listReservations(ownerId: string) {
    const result = await this.pool.query<Row>(
      `SELECT * FROM ai_budget_reservations WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY created_at DESC`,
      [ownerId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map(reservationFromRow);
  }

  async listLedger(ownerId: string, limit: number) {
    const result = await this.pool.query<Row>(
      `SELECT * FROM ai_usage_ledger WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY started_at DESC LIMIT $2`,
      [ownerId, limit, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows.map(ledgerFromRow);
  }

  async reserveAtomic(input: AtomicReservationInput) {
    const client = await this.pool.connect();
    const companyId = companyScope.companyId(input.reservation.ownerId) ?? null;
    try {
      await client.query("BEGIN");
      const duplicate = await client.query<Row>(
        `SELECT * FROM ai_budget_reservations
         WHERE owner_id=$1 AND request_id=$2 AND attempt_id=$3 AND ($4::uuid IS NULL OR company_id=$4) FOR UPDATE`,
        [
          input.reservation.ownerId,
          input.reservation.requestId,
          input.reservation.attemptId,
          companyId,
        ],
      );
      if (duplicate.rows[0]) {
        await client.query("COMMIT");
        return reservationFromRow(duplicate.rows[0]);
      }
      const policyRows = await client.query<Row>(
        `SELECT * FROM ai_budget_policies
         WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) AND enabled=TRUE
           AND effective_from <= NOW()
           AND (effective_until IS NULL OR effective_until > NOW())
         ORDER BY scope, scope_id NULLS FIRST, id FOR UPDATE`,
        [input.reservation.ownerId, companyId],
      );
      const policies = policyRows.rows
        .map(policyFromRow)
        .filter((policy) => policyApplies(policy, input.context, input.candidate));
      const ledgerRows = await client.query<Row>(
        `SELECT * FROM ai_usage_ledger WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY started_at DESC`,
        [input.reservation.ownerId, companyId],
      );
      const reservationRows = await client.query<Row>(
        `SELECT * FROM ai_budget_reservations
         WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) AND status='ACTIVE' AND expires_at > NOW() FOR UPDATE`,
        [input.reservation.ownerId, companyId],
      );
      const reservation = AIBudgetReservationSchema.parse({
        ...input.reservation,
        policyIds: policies.map((policy) => policy.id),
      });
      assertReservationAllowed({
        policies,
        ledger: ledgerRows.rows.map(ledgerFromRow),
        activeReservations: reservationRows.rows.map(reservationFromRow),
        reservation,
        context: input.context,
        candidate: input.candidate,
      });
      const inserted = await client.query<Row>(
        `INSERT INTO ai_budget_reservations(
          id, owner_id, request_id, route_id, attempt_id, provider_key,
          model_key, pricing_version, policy_ids, context_json, amount_usd, status,
          created_at, expires_at, settled_amount_usd, company_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING *`,
        [
          reservation.id,
          reservation.ownerId,
          reservation.requestId,
          reservation.routeId ?? null,
          reservation.attemptId ?? null,
          reservation.providerId ?? null,
          reservation.modelId ?? null,
          reservation.pricingVersion ?? null,
          reservation.policyIds ?? [],
          reservation.context ?? {},
          reservation.amountUsd,
          reservation.status,
          reservation.createdAt,
          reservation.expiresAt,
          reservation.settledAmountUsd ?? null,
          companyId,
        ],
      );
      await client.query("COMMIT");
      return reservationFromRow(inserted.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async settleAtomic(input: AtomicSettlementInput) {
    const client = await this.pool.connect();
    const companyId = companyScope.companyId(input.ownerId) ?? null;
    try {
      await client.query("BEGIN");
      const existing = input.entry.attemptId
        ? await client.query<Row>(
            `SELECT * FROM ai_usage_ledger WHERE owner_id=$1 AND request_id=$2 AND attempt_id=$3 AND ($4::uuid IS NULL OR company_id=$4) FOR UPDATE`,
            [input.ownerId, input.entry.requestId, input.entry.attemptId, companyId],
          )
        : { rows: [] as Row[] };
      if (existing.rows[0]) {
        await client.query("COMMIT");
        return ledgerFromRow(existing.rows[0]);
      }
      let reservation: AIBudgetReservation | undefined;
      if (input.reservationId) {
        const result = await client.query<Row>(
          `SELECT * FROM ai_budget_reservations WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR company_id=$3) FOR UPDATE`,
          [input.reservationId, input.ownerId, companyId],
        );
        if (!result.rows[0])
          throw new AIEconomicError("RESERVATION_FAILED", "Reservation was not found.");
        reservation = reservationFromRow(result.rows[0]);
      }
      await insertLedger(client, input.entry);
      if (reservation) {
        await client.query(
          `UPDATE ai_budget_reservations
           SET status=$3, settled_amount_usd=$4 WHERE id=$1 AND owner_id=$2 AND ($5::uuid IS NULL OR company_id=$5)`,
          [
            reservation.id,
            input.ownerId,
            input.entry.status === "SETTLED" ? "SETTLED" : "RELEASED",
            input.entry.actualCostUsd ?? "0",
            companyId,
          ],
        );
        if (
          decimalToUnits(input.entry.actualCostUsd ?? "0") >
          decimalToUnits(reservation.amountUsd)
        )
          await client.query(
            `INSERT INTO ai_economic_anomalies(
              id, owner_id, request_id, attempt_id, anomaly_type, severity,
              metadata_json, created_at, company_id
            ) VALUES ($1,$2,$3,$4,'OVER_RESERVATION','CRITICAL',$5,NOW(),$6)`,
            [
              crypto.randomUUID(),
              input.ownerId,
              input.entry.requestId,
              input.entry.attemptId ?? null,
              {
                reservedUsd: reservation.amountUsd,
                actualUsd: input.entry.actualCostUsd ?? "0",
              },
              companyId,
            ],
          );
      }
      await client.query("COMMIT");
      return input.entry;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async release(ownerId: string, reservationId: string) {
    const result = await this.pool.query<Row>(
      `UPDATE ai_budget_reservations SET status='RELEASED', settled_amount_usd=0
       WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR company_id=$3) AND status='ACTIVE' RETURNING *`,
      [reservationId, ownerId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows[0] ? reservationFromRow(result.rows[0]) : undefined;
  }

  async reconcileExpired(now: Date) {
    const result = await this.pool.query(
      `UPDATE ai_budget_reservations SET status='EXPIRED'
       WHERE status='ACTIVE' AND expires_at <= $1`,
      [now.toISOString()],
    );
    return result.rowCount ?? 0;
  }

  async findActiveReservation(ownerId: string, reservationId: string) {
    const result = await this.pool.query<Row>(
      `SELECT * FROM ai_budget_reservations
       WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR company_id=$3) AND status='ACTIVE' AND expires_at > NOW()`,
      [reservationId, ownerId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows[0] ? reservationFromRow(result.rows[0]) : undefined;
  }

  async createOverrideGrant(input: OverrideGrantWithDescriptor) {
    const descriptor = AIEconomicOverrideDescriptorSchema.parse(input.descriptor);
    const grant = AIEconomicOverrideGrantSchema.parse(input.grant);
    if (grant.ownerId !== descriptor.ownerId || grant.requestId !== descriptor.requestId)
      throw new AIEconomicError("OVERRIDE_REQUIRED", "Override grant binding is invalid.");
    const result = await this.pool.query<Row>(
      `INSERT INTO ai_budget_override_grants(
        id, owner_id, approval_id, request_id, workflow_run_id, scope, scope_id,
        max_additional_spend_usd, expires_at, status, created_at, digest,
        descriptor_json, agent_id, workflow_id, task_id, cost_center,
        provider_key, model_key, company_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *`,
      [
        grant.id, grant.ownerId, grant.approvalId, grant.requestId,
        descriptor.workflowRunId ?? null, "REQUEST", descriptor.requestId,
        grant.maxAdditionalSpendUsd, grant.expiresAt, grant.status, grant.createdAt,
        grant.digest, descriptor, descriptor.agentId ?? null, descriptor.workflowId ?? null,
        descriptor.taskId ?? null, descriptor.costCenter ?? null,
        descriptor.providerId ?? null, descriptor.modelId ?? null,
        companyScope.companyId(grant.ownerId) ?? null,
      ],
    );
    return grantFromRow(result.rows[0]!).grant;
  }

  async getOverrideGrant(ownerId: string, grantId: string) {
    const result = await this.pool.query<Row>(
      `SELECT * FROM ai_budget_override_grants WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR company_id=$3)`,
      [grantId, ownerId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rows[0] ? grantFromRow(result.rows[0]) : undefined;
  }

  async consumeOverrideGrantWithReservation(input: OverrideGrantReservationInput) {
    const client = await this.pool.connect();
    const companyId = companyScope.companyId(input.ownerId) ?? null;
    try {
      await client.query("BEGIN");
      const grantResult = await client.query<Row>(
        `SELECT * FROM ai_budget_override_grants WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR company_id=$3) FOR UPDATE`,
        [input.grantId, input.ownerId, companyId],
      );
      const row = grantResult.rows[0];
      if (!row) throw new AIEconomicError("OVERRIDE_REQUIRED", "Override grant was not found.");
      const record = grantFromRow(row);
      if (record.grant.status !== "ACTIVE")
        throw new AIEconomicError("OVERRIDE_REQUIRED", "Override grant was already used or revoked.");
      if (Date.parse(record.grant.expiresAt) <= Date.now())
        throw new AIEconomicError("OVERRIDE_REQUIRED", "Override grant has expired.");
      if (record.grant.requestId !== input.reservation.requestId ||
          digestEconomicOverride(input.descriptor) !== record.grant.digest)
        throw new AIEconomicError("OVERRIDE_REQUIRED", "Override grant binding does not match this request.");
      if (decimalToUnits(input.reservation.amountUsd) > decimalToUnits(record.grant.maxAdditionalSpendUsd))
        throw new AIEconomicError("OVERRIDE_REQUIRED", "Override grant amount was exceeded.");
      assertOverrideBindings(record.descriptor, input.context, input.candidate);
      const policyRows = await client.query<Row>(
        `SELECT * FROM ai_budget_policies WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) AND enabled=TRUE
         AND effective_from <= NOW() AND (effective_until IS NULL OR effective_until > NOW())
         ORDER BY scope, scope_id NULLS FIRST, id FOR UPDATE`, [input.ownerId, companyId],
      );
      const policies = policyRows.rows.map(policyFromRow).filter((policy) =>
        policyApplies(policy, input.context, input.candidate),
      );
      if (!policies.length) throw new AIEconomicError("OVERRIDE_REQUIRED", "No applicable budget policy exists.");
      const duplicate = await client.query<Row>(
        `SELECT * FROM ai_budget_reservations WHERE owner_id=$1 AND request_id=$2 AND attempt_id=$3 AND ($4::uuid IS NULL OR company_id=$4) FOR UPDATE`,
        [input.ownerId, input.reservation.requestId, input.reservation.attemptId, companyId],
      );
      if (duplicate.rows[0]) throw new AIEconomicError("OVERRIDE_REQUIRED", "Override reservation already exists.");
      const reservation = AIBudgetReservationSchema.parse({
        ...input.reservation,
        policyIds: policies.map((policy) => policy.id),
      });
      const inserted = await client.query<Row>(
        `INSERT INTO ai_budget_reservations(
          id, owner_id, request_id, route_id, attempt_id, provider_key, model_key,
          pricing_version, policy_ids, context_json, amount_usd, status, created_at,
          expires_at, settled_amount_usd, company_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [reservation.id, reservation.ownerId, reservation.requestId, reservation.routeId ?? null,
         reservation.attemptId ?? null, reservation.providerId ?? null, reservation.modelId ?? null,
         reservation.pricingVersion ?? null, reservation.policyIds ?? [], reservation.context ?? {},
         reservation.amountUsd, reservation.status, reservation.createdAt, reservation.expiresAt,
         reservation.settledAmountUsd ?? null, companyId],
      );
      await client.query(
        `UPDATE ai_budget_override_grants SET status='CONSUMED', consumed_at=NOW(), reservation_id=$1
         WHERE id=$2 AND owner_id=$3 AND ($4::uuid IS NULL OR company_id=$4) AND status='ACTIVE'`,
        [reservation.id, input.grantId, input.ownerId, companyId],
      );
      await client.query("COMMIT");
      return reservationFromRow(inserted.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async expireOverrideGrant(ownerId: string, grantId: string) {
    const result = await this.pool.query(
      `UPDATE ai_budget_override_grants SET status='EXPIRED'
       WHERE id=$1 AND owner_id=$2 AND ($3::uuid IS NULL OR company_id=$3) AND status='ACTIVE' AND expires_at <= NOW()`,
      [grantId, ownerId, companyScope.companyId(ownerId) ?? null],
    );
    return result.rowCount === 1;
  }
}
