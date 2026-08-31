import {
  CompanyMembershipSchema,
  CompanySchema,
  type Company,
  type CompanyMembership,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { Awaitable } from "../identity/store.js";

export interface CompanyStore {
  createCompany(company: Company, membership: CompanyMembership): Awaitable<void>;
  findCompany(ownerId: string, companyId: string): Awaitable<Company | undefined>;
  listCompanies(ownerId: string): Awaitable<Company[]>;
  findMembership(principalId: string, companyId: string): Awaitable<CompanyMembership | undefined>;
  updateCompany(company: Company): Awaitable<void>;
}

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryCompanyStore implements CompanyStore {
  readonly #companies = new Map<string, Company>();
  readonly #memberships = new Map<string, CompanyMembership>();

  createCompany(company: Company, membership: CompanyMembership) {
    const parsedCompany = CompanySchema.parse(company);
    const parsedMembership = CompanyMembershipSchema.parse(membership);
    if ([...this.#companies.values()].some((item) => item.ownerId === company.ownerId && item.slug === company.slug)) {
      throw Object.assign(new Error("Company slug already exists."), { code: "COMPANY_SLUG_EXISTS", statusCode: 409 });
    }
    this.#companies.set(parsedCompany.id, clone(parsedCompany));
    this.#memberships.set(`${membership.principalId}:${membership.companyId}`, clone(parsedMembership));
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
}

export class PostgresCompanyStore implements CompanyStore {
  constructor(readonly pool: Pool) {}

  async createCompany(company: Company, membership: CompanyMembership) {
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
    return result.rows[0] ? CompanySchema.parse(result.rows[0].record) : undefined;
  }

  async listCompanies(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT c.record FROM companies c JOIN company_memberships m ON m.company_id=c.id WHERE c.owner_id=$1 AND m.principal_id=$1 AND m.status='ACTIVE' ORDER BY c.created_at,c.id",
      [ownerId],
    );
    return result.rows.map((row) => CompanySchema.parse(row.record));
  }

  async findMembership(principalId: string, companyId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM company_memberships WHERE principal_id=$1 AND company_id=$2 AND status='ACTIVE'",
      [principalId, companyId],
    );
    return result.rows[0] ? CompanyMembershipSchema.parse(result.rows[0].record) : undefined;
  }

  async updateCompany(company: Company) {
    const parsed = CompanySchema.parse(company);
    const result = await this.pool.query(
      "UPDATE companies SET name=$2,status=$3,timezone=$4,default_currency=$5,record=$6,updated_at=$7 WHERE id=$1 AND owner_id=$8",
      [parsed.id, parsed.name, parsed.status, parsed.timezone, parsed.defaultCurrency, parsed, parsed.updatedAt, parsed.ownerId],
    );
    if (result.rowCount !== 1) throw new Error("Company does not exist.");
  }
}
