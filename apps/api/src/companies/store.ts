import {
  CompanyMembershipSchema,
  CompanyProvisioningSchema,
  CompanySchema,
  type Company,
  type CompanyMembership,
  type CompanyProvisioning,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { Awaitable } from "../identity/store.js";

export interface CompanyStore {
  createCompany(company: Company, membership: CompanyMembership, provisioning?: CompanyProvisioning): Awaitable<void>;
  findCompany(ownerId: string, companyId: string): Awaitable<Company | undefined>;
  listCompanies(ownerId: string): Awaitable<Company[]>;
  findMembership(principalId: string, companyId: string): Awaitable<CompanyMembership | undefined>;
  updateCompany(company: Company): Awaitable<void>;
  findProvisioning(ownerId: string, companyId: string): Awaitable<CompanyProvisioning | undefined>;
  findProvisioningByIdempotency(ownerId: string, idempotencyKey: string): Awaitable<CompanyProvisioning | undefined>;
  saveProvisioning(provisioning: CompanyProvisioning): Awaitable<void>;
  getCompanyLimit(ownerId: string): Awaitable<number | undefined>;
  setCompanyLimit(ownerId: string, limit: number, updatedAt: string): Awaitable<void>;
}

const clone = <T>(value: T): T => structuredClone(value);

const canonicalTimestamp = (value: unknown) => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string") return value;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toISOString();
};

const canonicalizeTimestamps = (record: unknown) => {
  if (!record || typeof record !== "object" || Array.isArray(record)) return record;
  const parsed = { ...(record as Record<string, unknown>) };
  for (const field of [
    "createdAt",
    "updatedAt",
    "activatedAt",
    "pausedAt",
    "suspendedAt",
    "archivedAt",
    "completedAt",
  ]) {
    if (field in parsed) parsed[field] = canonicalTimestamp(parsed[field]);
  }
  return parsed;
};

export const parseCompanyRecord = (record: unknown) => CompanySchema.parse(canonicalizeTimestamps(record));
export const parseCompanyMembershipRecord = (record: unknown) => CompanyMembershipSchema.parse(canonicalizeTimestamps(record));
export const parseCompanyProvisioningRecord = (record: unknown) => {
  const canonical = canonicalizeTimestamps(record) as Record<string, unknown>;
  if (Array.isArray(canonical?.steps)) {
    canonical.steps = canonical.steps.map((step) => canonicalizeTimestamps(step));
  }
  return CompanyProvisioningSchema.parse(canonical);
};

export class InMemoryCompanyStore implements CompanyStore {
  readonly #companies = new Map<string, Company>();
  readonly #memberships = new Map<string, CompanyMembership>();
  readonly #provisioning = new Map<string, CompanyProvisioning>();
  readonly #limits = new Map<string, number>();

  createCompany(company: Company, membership: CompanyMembership, provisioning?: CompanyProvisioning) {
    const parsedCompany = CompanySchema.parse(company);
    const parsedMembership = CompanyMembershipSchema.parse(membership);
    if ([...this.#companies.values()].some((item) => item.ownerId === company.ownerId && item.slug === company.slug)) {
      throw Object.assign(new Error("Company slug already exists."), { code: "COMPANY_SLUG_EXISTS", statusCode: 409 });
    }
    this.#companies.set(parsedCompany.id, clone(parsedCompany));
    this.#memberships.set(`${membership.principalId}:${membership.companyId}`, clone(parsedMembership));
    if (provisioning) this.#provisioning.set(company.id, clone(CompanyProvisioningSchema.parse(provisioning)));
  }

  findCompany(ownerId: string, companyId: string) {
    const company = this.#companies.get(companyId);
    return company?.ownerId === ownerId ? clone(company) : undefined;
  }

  listCompanies(ownerId: string) {
    return [...this.#companies.values()].filter((company) => company.ownerId === ownerId).map(clone);
  }

  findMembership(principalId: string, companyId: string) {
    const membership = this.#memberships.get(`${principalId}:${companyId}`);
    return membership ? clone(membership) : undefined;
  }

  updateCompany(company: Company) {
    if (!this.#companies.has(company.id)) throw new Error("Company does not exist.");
    this.#companies.set(company.id, clone(CompanySchema.parse(company)));
  }

  findProvisioning(ownerId: string, companyId: string) {
    const item = this.#provisioning.get(companyId);
    return item?.ownerId === ownerId ? clone(item) : undefined;
  }

  findProvisioningByIdempotency(ownerId: string, idempotencyKey: string) {
    const item = [...this.#provisioning.values()].find((entry) => entry.ownerId === ownerId && entry.idempotencyKey === idempotencyKey);
    return item ? clone(item) : undefined;
  }

  saveProvisioning(provisioning: CompanyProvisioning) {
    const parsed = CompanyProvisioningSchema.parse(provisioning);
    if (!this.#companies.has(parsed.companyId)) throw new Error("Company does not exist.");
    this.#provisioning.set(parsed.companyId, clone(parsed));
  }

  getCompanyLimit(ownerId: string) { return this.#limits.get(ownerId); }
  setCompanyLimit(ownerId: string, limit: number) { this.#limits.set(ownerId, limit); }
}

export class PostgresCompanyStore implements CompanyStore {
  constructor(readonly pool: Pool) {}

  async createCompany(company: Company, membership: CompanyMembership, provisioning?: CompanyProvisioning) {
    const parsedCompany = CompanySchema.parse(company);
    const parsedMembership = CompanyMembershipSchema.parse(membership);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO companies(id,owner_id,slug,name,status,timezone,default_currency,record,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [parsedCompany.id, parsedCompany.ownerId, parsedCompany.slug, parsedCompany.name, parsedCompany.status, parsedCompany.timezone, parsedCompany.defaultCurrency, parsedCompany, parsedCompany.createdAt, parsedCompany.updatedAt],
      );
      if (provisioning) {
        const parsedProvisioning = CompanyProvisioningSchema.parse(provisioning);
        await client.query(
          `INSERT INTO company_provisioning(company_id,owner_id,idempotency_key,status,record,created_at,updated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [parsedProvisioning.companyId, parsedProvisioning.ownerId, parsedProvisioning.idempotencyKey, parsedProvisioning.status, parsedProvisioning, parsedProvisioning.createdAt, parsedProvisioning.updatedAt],
        );
      }
      await client.query(
        `INSERT INTO company_memberships(company_id,principal_id,principal_type,role,status,record,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [parsedMembership.companyId, parsedMembership.principalId, parsedMembership.principalType, parsedMembership.role, parsedMembership.status, parsedMembership, parsedMembership.createdAt, parsedMembership.updatedAt],
      );
      await client.query(
        "UPDATE owners SET default_company_id=COALESCE(default_company_id,$2) WHERE id=$1",
        [parsedCompany.ownerId, parsedCompany.id],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findCompany(ownerId: string, companyId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT c.record FROM companies c JOIN company_memberships m ON m.company_id=c.id WHERE c.id=$1 AND c.owner_id=$2 AND m.principal_id=$2 AND m.status='ACTIVE'",
      [companyId, ownerId],
    );
    return result.rows[0] ? parseCompanyRecord(result.rows[0].record) : undefined;
  }

  async listCompanies(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT c.record FROM companies c JOIN company_memberships m ON m.company_id=c.id WHERE c.owner_id=$1 AND m.principal_id=$1 AND m.status='ACTIVE' ORDER BY c.created_at,c.id",
      [ownerId],
    );
    return result.rows.map((row) => parseCompanyRecord(row.record));
  }

  async findMembership(principalId: string, companyId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM company_memberships WHERE principal_id=$1 AND company_id=$2 AND status='ACTIVE'",
      [principalId, companyId],
    );
    return result.rows[0] ? parseCompanyMembershipRecord(result.rows[0].record) : undefined;
  }

  async updateCompany(company: Company) {
    const parsed = CompanySchema.parse(company);
    const result = await this.pool.query(
      "UPDATE companies SET name=$2,status=$3,timezone=$4,default_currency=$5,record=$6,updated_at=$7 WHERE id=$1 AND owner_id=$8",
      [parsed.id, parsed.name, parsed.status, parsed.timezone, parsed.defaultCurrency, parsed, parsed.updatedAt, parsed.ownerId],
    );
    if (result.rowCount !== 1) throw new Error("Company does not exist.");
  }

  async findProvisioning(ownerId: string, companyId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM company_provisioning WHERE owner_id=$1 AND company_id=$2",
      [ownerId, companyId],
    );
    return result.rows[0] ? parseCompanyProvisioningRecord(result.rows[0].record) : undefined;
  }

  async findProvisioningByIdempotency(ownerId: string, idempotencyKey: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM company_provisioning WHERE owner_id=$1 AND idempotency_key=$2",
      [ownerId, idempotencyKey],
    );
    return result.rows[0] ? parseCompanyProvisioningRecord(result.rows[0].record) : undefined;
  }

  async saveProvisioning(provisioning: CompanyProvisioning) {
    const parsed = CompanyProvisioningSchema.parse(provisioning);
    const result = await this.pool.query(
      `UPDATE company_provisioning SET status=$3,record=$4,updated_at=$5
       WHERE company_id=$1 AND owner_id=$2`,
      [parsed.companyId, parsed.ownerId, parsed.status, parsed, parsed.updatedAt],
    );
    if (result.rowCount !== 1) throw new Error("Company provisioning record does not exist.");
  }

  async getCompanyLimit(ownerId: string) {
    const result = await this.pool.query<{ company_limit: number }>("SELECT company_limit FROM owner_company_limits WHERE owner_id=$1", [ownerId]);
    return result.rows[0]?.company_limit;
  }

  async setCompanyLimit(ownerId: string, limit: number, updatedAt: string) {
    await this.pool.query(
      `INSERT INTO owner_company_limits(owner_id,company_limit,updated_at) VALUES($1,$2,$3)
       ON CONFLICT(owner_id) DO UPDATE SET company_limit=EXCLUDED.company_limit,updated_at=EXCLUDED.updated_at`,
      [ownerId, limit, updatedAt],
    );
  }
}
