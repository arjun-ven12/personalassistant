import {
  EconomyScopeAccountSchema,
  EconomyScopeTransferSchema,
  OwnerReserveFundingSchema,
  type EconomyScopeAccount,
} from "@alexa-control/shared";
import type { Pool, PoolClient } from "pg";

import {
  ownerReserveAccountId,
  portfolioCompanyEconomyAccountId,
  type PortfolioEconomyStore,
} from "./portfolio-store.js";

type RecordRow = { record: unknown };

export class PostgresPortfolioEconomyStore implements PortfolioEconomyStore {
  constructor(readonly pool: Pool) {}

  async ensureAccounts(ownerId: string, companyIds: string[], at: string) {
    const reserve = EconomyScopeAccountSchema.parse({
      id: ownerReserveAccountId(ownerId), ownerId, accountType: "OWNER_RESERVE", companyId: null,
      availableCredits: 0, reservedCredits: 0, lifetimeAllocated: 0, lifetimeSpent: 0,
      createdAt: at, updatedAt: at,
    });
    await this.insertAccount(reserve);
    for (const companyId of companyIds)
      await this.insertAccount(EconomyScopeAccountSchema.parse({
        id: portfolioCompanyEconomyAccountId(ownerId, companyId), ownerId,
        accountType: "COMPANY", companyId, availableCredits: 0, reservedCredits: 0,
        lifetimeAllocated: 0, lifetimeSpent: 0, createdAt: at, updatedAt: at,
      }));
    return this.listAccounts(ownerId);
  }

  async listAccounts(ownerId: string) {
    const result = await this.pool.query<RecordRow>(
      "SELECT record FROM agent_economy_scope_accounts WHERE owner_id=$1 ORDER BY account_type,company_id NULLS FIRST",
      [ownerId],
    );
    return result.rows.map((row) => EconomyScopeAccountSchema.parse(row.record));
  }

  async findTransfer(ownerId: string, idempotencyKey: string) {
    const result = await this.pool.query<RecordRow>(
      "SELECT record FROM agent_economy_scope_transfers WHERE owner_id=$1 AND idempotency_key=$2",
      [ownerId, idempotencyKey],
    );
    return result.rows[0] ? EconomyScopeTransferSchema.parse(result.rows[0].record) : null;
  }

  async transfer(input: { ownerId: string; companyId: string; amount: number; reason: string; idempotencyKey: string; approvalId: string | null; at: string }) {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 1_000_000_000)
      throw this.error("INVALID_PORTFOLIO_TRANSFER_AMOUNT", "Transfer amount must be a positive bounded integer.");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const duplicate = await client.query<RecordRow>(
        "SELECT record FROM agent_economy_scope_transfers WHERE owner_id=$1 AND idempotency_key=$2",
        [input.ownerId, input.idempotencyKey],
      );
      if (duplicate.rows[0]) {
        await client.query("COMMIT");
        return EconomyScopeTransferSchema.parse(duplicate.rows[0].record);
      }
      const accountIds = [ownerReserveAccountId(input.ownerId), portfolioCompanyEconomyAccountId(input.ownerId, input.companyId)].sort();
      const locked = await client.query<RecordRow>(
        "SELECT record FROM agent_economy_scope_accounts WHERE owner_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE",
        [input.ownerId, accountIds],
      );
      const accounts = locked.rows.map((row) => EconomyScopeAccountSchema.parse(row.record));
      const source = accounts.find((item) => item.accountType === "OWNER_RESERVE");
      const destination = accounts.find((item) => item.accountType === "COMPANY" && item.companyId === input.companyId);
      if (!source || !destination) throw this.error("PORTFOLIO_ECONOMY_ACCOUNT_MISSING", "Portfolio economy accounts are missing.");
      if (source.availableCredits < input.amount) throw this.error("INSUFFICIENT_OWNER_RESERVE", "Owner reserve is insufficient.");
      const updatedSource = EconomyScopeAccountSchema.parse({ ...source, availableCredits: source.availableCredits - input.amount, lifetimeAllocated: source.lifetimeAllocated + input.amount, updatedAt: input.at });
      const updatedDestination = EconomyScopeAccountSchema.parse({ ...destination, availableCredits: destination.availableCredits + input.amount, lifetimeAllocated: destination.lifetimeAllocated + input.amount, updatedAt: input.at });
      await this.updateAccount(client, updatedSource);
      await this.updateAccount(client, updatedDestination);
      const transfer = EconomyScopeTransferSchema.parse({
        id: crypto.randomUUID(), ownerId: input.ownerId, sourceAccountId: source.id,
        destinationAccountId: destination.id, companyId: input.companyId, amount: input.amount,
        reason: input.reason, idempotencyKey: input.idempotencyKey, approvalId: input.approvalId,
        status: "SETTLED", createdAt: input.at, settledAt: input.at,
      });
      await client.query(
        `INSERT INTO agent_economy_scope_transfers(id,owner_id,source_account_id,destination_account_id,company_id,amount,idempotency_key,status,created_at,settled_at,record)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [transfer.id, transfer.ownerId, transfer.sourceAccountId, transfer.destinationAccountId, transfer.companyId, transfer.amount, transfer.idempotencyKey, transfer.status, transfer.createdAt, transfer.settledAt, transfer],
      );
      await client.query("COMMIT");
      return transfer;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findFunding(ownerId: string, idempotencyKey: string) {
    const result = await this.pool.query<RecordRow>(
      "SELECT record FROM agent_economy_scope_funding WHERE owner_id=$1 AND idempotency_key=$2",
      [ownerId, idempotencyKey],
    );
    return result.rows[0] ? OwnerReserveFundingSchema.parse(result.rows[0].record) : null;
  }

  async fundOwnerReserve(input: { ownerId: string; amount: number; reason: string; authorityRef: string; idempotencyKey: string; approvalId: string; at: string }) {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 1_000_000_000)
      throw this.error("INVALID_OWNER_RESERVE_FUNDING_AMOUNT", "Funding amount must be a positive bounded integer.");
    if (!input.authorityRef.trim()) throw this.error("OWNER_RESERVE_AUTHORITY_REQUIRED", "Funding authority is required.");
    await this.ensureAccounts(input.ownerId, [], input.at);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<RecordRow>("SELECT record FROM agent_economy_scope_funding WHERE owner_id=$1 AND idempotency_key=$2", [input.ownerId, input.idempotencyKey]);
      const accountResult = await client.query<RecordRow>("SELECT record FROM agent_economy_scope_accounts WHERE owner_id=$1 AND id=$2 FOR UPDATE", [input.ownerId, ownerReserveAccountId(input.ownerId)]);
      const account = EconomyScopeAccountSchema.parse(accountResult.rows[0]!.record);
      if (existing.rows[0]) { await client.query("COMMIT"); return OwnerReserveFundingSchema.parse(existing.rows[0].record); }
      const updated = EconomyScopeAccountSchema.parse({ ...account, availableCredits: account.availableCredits + input.amount, updatedAt: input.at });
      const funding = OwnerReserveFundingSchema.parse({
        fundingId: crypto.randomUUID(), ownerId: input.ownerId, amount: input.amount,
        reason: input.reason, authority: "OWNER_RESERVE_FUND", authorityRef: input.authorityRef,
        idempotencyKey: input.idempotencyKey, approvalId: input.approvalId,
        status: "SETTLED", createdAt: input.at, settledAt: input.at,
      });
      await this.updateAccount(client, updated);
      await client.query("INSERT INTO agent_economy_scope_funding(id,owner_id,idempotency_key,amount,authority_ref,approval_id,created_at,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [funding.fundingId, input.ownerId, input.idempotencyKey, input.amount, input.authorityRef, input.approvalId, input.at, funding]);
      await client.query("COMMIT");
      return funding;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  private async insertAccount(account: EconomyScopeAccount) {
    await this.pool.query(
      `INSERT INTO agent_economy_scope_accounts(id,owner_id,account_type,company_id,available_credits,reserved_credits,lifetime_allocated,lifetime_spent,created_at,updated_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO NOTHING`,
      [account.id, account.ownerId, account.accountType, account.companyId, account.availableCredits, account.reservedCredits, account.lifetimeAllocated, account.lifetimeSpent, account.createdAt, account.updatedAt, account],
    );
  }
  private updateAccount(client: PoolClient, account: EconomyScopeAccount) {
    return client.query("UPDATE agent_economy_scope_accounts SET available_credits=$3,reserved_credits=$4,lifetime_allocated=$5,lifetime_spent=$6,updated_at=$7,record=$8 WHERE id=$1 AND owner_id=$2", [account.id, account.ownerId, account.availableCredits, account.reservedCredits, account.lifetimeAllocated, account.lifetimeSpent, account.updatedAt, account]);
  }
  private error(code: string, message: string) { return Object.assign(new Error(message), { code }); }
}
