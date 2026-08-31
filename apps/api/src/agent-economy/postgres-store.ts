import {
  AgentEconomyAccountSchema,
  AgentEconomyLedgerEntrySchema,
  AgentEconomyPerformanceSchema,
  AgentEconomyReservationSchema,
  type AgentEconomyAccount,
  type AgentEconomyLedgerEntry,
  type AgentEconomyPerformance,
  type AgentEconomyReservation,
  type AgentEconomyStatus,
} from "@alexa-control/shared";
import type { Pool, PoolClient } from "pg";

import type { AgentEconomyStore, EconomyMutationResult } from "./store.js";
import { companyScope } from "../companies/scope.js";

type RecordRow = { record: unknown };

export class PostgresAgentEconomyStore implements AgentEconomyStore {
  constructor(readonly pool: Pool) {}

  async saveAccount(account: AgentEconomyAccount) {
    const parsed = AgentEconomyAccountSchema.parse(account);
    await this.pool.query(
      `INSERT INTO agent_economy_accounts(owner_id,agent_id,economy_status,available_credits,reserved_credits,lifetime_earned,lifetime_spent,reputation,created_at,updated_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (owner_id,agent_id) DO NOTHING`,
      [...this.accountValues(parsed), companyScope.companyId(parsed.ownerId) ?? null],
    );
    return (await this.findAccount(parsed.ownerId, parsed.agentId))!;
  }

  async updateAccount(account: AgentEconomyAccount) {
    const parsed = AgentEconomyAccountSchema.parse(account);
    const result = await this.pool.query<RecordRow>(
      `UPDATE agent_economy_accounts SET economy_status=$3,available_credits=$4,reserved_credits=$5,lifetime_earned=$6,lifetime_spent=$7,reputation=$8,updated_at=$9,record=$10
       WHERE owner_id=$1 AND agent_id=$2 AND ($11::uuid IS NULL OR company_id=$11) RETURNING record`,
      [...this.mutableAccountValues(parsed), companyScope.companyId(parsed.ownerId) ?? null],
    );
    if (!result.rows[0]) throw this.error("ECONOMY_ACCOUNT_NOT_FOUND", "Economy account not found.");
    return AgentEconomyAccountSchema.parse(result.rows[0].record);
  }

  async findAccount(ownerId: string, agentId: string) {
    const result = await this.pool.query<RecordRow>("SELECT record FROM agent_economy_accounts WHERE owner_id=$1 AND agent_id=$2 AND ($3::uuid IS NULL OR company_id=$3)", [ownerId, agentId, companyScope.companyId(ownerId) ?? null]);
    return result.rows[0] ? AgentEconomyAccountSchema.parse(result.rows[0].record) : undefined;
  }

  async listAccounts(ownerId: string) {
    const result = await this.pool.query<RecordRow>("SELECT record FROM agent_economy_accounts WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY agent_id", [ownerId, companyScope.companyId(ownerId) ?? null]);
    return result.rows.map((row) => AgentEconomyAccountSchema.parse(row.record));
  }

  async setStatus(ownerId: string, agentId: string, status: AgentEconomyStatus, updatedAt: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const account = await this.lockAccount(client, ownerId, agentId);
      const updated = AgentEconomyAccountSchema.parse({ ...account, economyStatus: status, updatedAt });
      await this.writeAccount(client, updated);
      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  creditAtomic(input: { account: AgentEconomyAccount; entry: AgentEconomyLedgerEntry }): Promise<EconomyMutationResult> {
    return this.creditOrPenalty(input, "credit");
  }

  penalizeAtomic(input: { account: AgentEconomyAccount; entry: AgentEconomyLedgerEntry }): Promise<EconomyMutationResult> {
    return this.creditOrPenalty(input, "penalty");
  }

  async reserveAtomic(input: { account: AgentEconomyAccount; reservation: AgentEconomyReservation; entry: AgentEconomyLedgerEntry }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const account = await this.lockAccount(client, input.account.ownerId, input.account.agentId);
      const companyId = companyScope.companyId(input.reservation.ownerId) ?? null;
      const duplicate = await client.query<RecordRow>("SELECT record FROM agent_economy_reservations WHERE owner_id=$1 AND idempotency_key=$2 AND ($3::uuid IS NULL OR company_id=$3)", [input.reservation.ownerId, input.reservation.idempotencyKey, companyId]);
      if (duplicate.rows[0]) {
        const reservation = AgentEconomyReservationSchema.parse(duplicate.rows[0].record);
        await client.query("COMMIT");
        return { account, reservation, duplicate: true };
      }
      if (account.availableCredits < input.reservation.amountReserved) throw this.error("INSUFFICIENT_ECONOMIC_BUDGET", "Insufficient economic budget.");
      const updated = AgentEconomyAccountSchema.parse({ ...account, availableCredits: account.availableCredits - input.reservation.amountReserved, reservedCredits: account.reservedCredits + input.reservation.amountReserved, updatedAt: input.reservation.createdAt });
      await this.writeAccount(client, updated);
      await this.insertLedger(client, input.entry);
      const reservation = AgentEconomyReservationSchema.parse(input.reservation);
      await client.query(
        `INSERT INTO agent_economy_reservations(id,owner_id,agent_id,status,amount_reserved,amount_settled,idempotency_key,created_at,updated_at,record,company_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [reservation.id,reservation.ownerId,reservation.agentId,reservation.status,reservation.amountReserved,reservation.amountSettled,reservation.idempotencyKey,reservation.createdAt,reservation.updatedAt,reservation,companyId],
      );
      await client.query("COMMIT");
      return { account: updated, reservation, duplicate: false };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async settleAtomic(input: { ownerId: string; agentId: string; reservationId: string; amount: number; entry: AgentEconomyLedgerEntry; updatedAt: string }) {
    return this.finishReservation(input, "SETTLED");
  }

  async releaseAtomic(input: { ownerId: string; agentId: string; reservationId: string; entry: AgentEconomyLedgerEntry; updatedAt: string }) {
    return this.finishReservation({ ...input, amount: 0 }, "RELEASED");
  }

  async listLedger(ownerId: string, limit: number) {
    const result = await this.pool.query<RecordRow>("SELECT record FROM agent_economy_ledger WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY created_at DESC LIMIT $2", [ownerId, limit, companyScope.companyId(ownerId) ?? null]);
    return result.rows.map((row) => AgentEconomyLedgerEntrySchema.parse(row.record));
  }

  async listReservations(ownerId: string, agentId?: string) {
    const result = agentId
      ? await this.pool.query<RecordRow>("SELECT record FROM agent_economy_reservations WHERE owner_id=$1 AND agent_id=$2 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY created_at DESC", [ownerId, agentId, companyScope.companyId(ownerId) ?? null])
      : await this.pool.query<RecordRow>("SELECT record FROM agent_economy_reservations WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY created_at DESC", [ownerId, companyScope.companyId(ownerId) ?? null]);
    return result.rows.map((row) => AgentEconomyReservationSchema.parse(row.record));
  }

  async savePerformance(record: AgentEconomyPerformance) {
    const parsed = AgentEconomyPerformanceSchema.parse(record);
    await this.pool.query(
      `INSERT INTO agent_economy_performance(owner_id,agent_id,updated_at,record,company_id) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (owner_id,agent_id) DO UPDATE SET updated_at=$3,record=$4`,
      [parsed.ownerId, parsed.agentId, parsed.updatedAt, parsed, companyScope.companyId(parsed.ownerId) ?? null],
    );
  }

  async findPerformance(ownerId: string, agentId: string) {
    const result = await this.pool.query<RecordRow>("SELECT record FROM agent_economy_performance WHERE owner_id=$1 AND agent_id=$2 AND ($3::uuid IS NULL OR company_id=$3)", [ownerId, agentId, companyScope.companyId(ownerId) ?? null]);
    return result.rows[0] ? AgentEconomyPerformanceSchema.parse(result.rows[0].record) : undefined;
  }

  async listPerformance(ownerId: string) {
    const result = await this.pool.query<RecordRow>("SELECT record FROM agent_economy_performance WHERE owner_id=$1 AND ($2::uuid IS NULL OR company_id=$2) ORDER BY agent_id", [ownerId, companyScope.companyId(ownerId) ?? null]);
    return result.rows.map((row) => AgentEconomyPerformanceSchema.parse(row.record));
  }

  private async creditOrPenalty(input: { account: AgentEconomyAccount; entry: AgentEconomyLedgerEntry }, mode: "credit" | "penalty") {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const account = await this.lockAccount(client, input.account.ownerId, input.account.agentId);
      const existing = await this.findLedgerByKey(client, input.entry.ownerId, input.entry.idempotencyKey);
      if (existing) {
        await client.query("COMMIT");
        return { account, entry: existing, duplicate: true };
      }
      const amount = mode === "penalty" ? Math.min(account.availableCredits, input.entry.amount) : input.entry.amount;
      if (amount <= 0) throw this.error("INSUFFICIENT_ECONOMIC_BUDGET", "No available credits may be penalized.");
      const entry = AgentEconomyLedgerEntrySchema.parse({ ...input.entry, amount });
      const updated = AgentEconomyAccountSchema.parse({
        ...account,
        availableCredits: mode === "credit" ? account.availableCredits + amount : account.availableCredits - amount,
        lifetimeEarned: mode === "credit" ? account.lifetimeEarned + amount : account.lifetimeEarned,
        lifetimeSpent: mode === "penalty" ? account.lifetimeSpent + amount : account.lifetimeSpent,
        updatedAt: entry.createdAt,
      });
      await this.writeAccount(client, updated);
      await this.insertLedger(client, entry);
      await client.query("COMMIT");
      return { account: updated, entry, duplicate: false };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async finishReservation(input: { ownerId: string; agentId: string; reservationId: string; amount: number; entry: AgentEconomyLedgerEntry; updatedAt: string }, status: "SETTLED" | "RELEASED") {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const account = await this.lockAccount(client, input.ownerId, input.agentId);
      const existing = await this.findLedgerByKey(client, input.ownerId, input.entry.idempotencyKey);
      const companyId = companyScope.companyId(input.ownerId) ?? null;
      const result = await client.query<RecordRow>("SELECT record FROM agent_economy_reservations WHERE owner_id=$1 AND agent_id=$2 AND id=$3 AND ($4::uuid IS NULL OR company_id=$4) FOR UPDATE", [input.ownerId, input.agentId, input.reservationId, companyId]);
      if (!result.rows[0]) throw this.error("ECONOMY_RESERVATION_NOT_FOUND", "Economy reservation not found.");
      const reservation = AgentEconomyReservationSchema.parse(result.rows[0].record);
      if (existing) {
        await client.query("COMMIT");
        return { account, reservation, duplicate: true };
      }
      if (reservation.status !== "ACTIVE") throw this.error("ECONOMY_RESERVATION_NOT_ACTIVE", "Reservation is not active.");
      const actual = status === "SETTLED" ? input.amount : 0;
      const extra = Math.max(0, actual - reservation.amountReserved);
      if (extra > account.availableCredits) throw this.error("INSUFFICIENT_ECONOMIC_BUDGET", "Insufficient economic budget for settlement.");
      const release = Math.max(0, reservation.amountReserved - actual);
      const updated = AgentEconomyAccountSchema.parse({ ...account, availableCredits: account.availableCredits + release - extra, reservedCredits: account.reservedCredits - reservation.amountReserved, lifetimeSpent: account.lifetimeSpent + actual, updatedAt: input.updatedAt });
      const finished = AgentEconomyReservationSchema.parse({ ...reservation, amountSettled: actual, status, updatedAt: input.updatedAt });
      await this.writeAccount(client, updated);
      await this.insertLedger(client, input.entry);
      await client.query("UPDATE agent_economy_reservations SET status=$4,amount_settled=$5,updated_at=$6,record=$7 WHERE owner_id=$1 AND agent_id=$2 AND id=$3 AND ($8::uuid IS NULL OR company_id=$8)", [input.ownerId,input.agentId,input.reservationId,status,actual,input.updatedAt,finished,companyId]);
      await client.query("COMMIT");
      return { account: updated, reservation: finished, duplicate: false };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockAccount(client: PoolClient, ownerId: string, agentId: string) {
    const result = await client.query<RecordRow>("SELECT record FROM agent_economy_accounts WHERE owner_id=$1 AND agent_id=$2 AND ($3::uuid IS NULL OR company_id=$3) FOR UPDATE", [ownerId, agentId, companyScope.companyId(ownerId) ?? null]);
    if (!result.rows[0]) throw this.error("ECONOMY_ACCOUNT_NOT_FOUND", "Economy account not found.");
    return AgentEconomyAccountSchema.parse(result.rows[0].record);
  }

  private async writeAccount(client: PoolClient, account: AgentEconomyAccount) {
    await client.query(
      `UPDATE agent_economy_accounts SET economy_status=$3,available_credits=$4,reserved_credits=$5,lifetime_earned=$6,lifetime_spent=$7,reputation=$8,updated_at=$9,record=$10 WHERE owner_id=$1 AND agent_id=$2 AND ($11::uuid IS NULL OR company_id=$11)`,
      [...this.mutableAccountValues(account), companyScope.companyId(account.ownerId) ?? null],
    );
  }

  private async insertLedger(client: PoolClient, entry: AgentEconomyLedgerEntry) {
    const parsed = AgentEconomyLedgerEntrySchema.parse(entry);
    await client.query("INSERT INTO agent_economy_ledger(id,owner_id,agent_id,entry_type,amount,idempotency_key,created_at,record,company_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [parsed.id,parsed.ownerId,parsed.agentId,parsed.type,parsed.amount,parsed.idempotencyKey,parsed.createdAt,parsed,companyScope.companyId(parsed.ownerId) ?? null]);
  }

  private async findLedgerByKey(client: PoolClient, ownerId: string, idempotencyKey: string) {
    const result = await client.query<RecordRow>("SELECT record FROM agent_economy_ledger WHERE owner_id=$1 AND idempotency_key=$2 AND ($3::uuid IS NULL OR company_id=$3)", [ownerId, idempotencyKey, companyScope.companyId(ownerId) ?? null]);
    return result.rows[0] ? AgentEconomyLedgerEntrySchema.parse(result.rows[0].record) : undefined;
  }

  private accountValues(account: AgentEconomyAccount) {
    return [account.ownerId,account.agentId,account.economyStatus,account.availableCredits,account.reservedCredits,account.lifetimeEarned,account.lifetimeSpent,account.reputation,account.createdAt,account.updatedAt,account];
  }

  private mutableAccountValues(account: AgentEconomyAccount) {
    return [account.ownerId,account.agentId,account.economyStatus,account.availableCredits,account.reservedCredits,account.lifetimeEarned,account.lifetimeSpent,account.reputation,account.updatedAt,account];
  }

  private error(code: string, message: string) {
    return Object.assign(new Error(message), { code });
  }
}
