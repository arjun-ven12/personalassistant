import {
  CompanyContextSchema,
  CompanyListResponseSchema,
  CompanyMembershipSchema,
  CompanySchema,
  type CompanyContext,
  type CreateCompanyRequest,
} from "@alexa-control/shared";
import { createHash } from "node:crypto";

import { ApiSecurityError } from "../identity/errors.js";
import type { IdentityStore } from "../identity/store.js";
import type { AuthenticatedIdentity } from "../identity/types.js";
import type { CompanyStore } from "./store.js";

const defaultCompanyId = (ownerId: string) => {
  // This must match the stable IDs seeded by migration 0078 for existing owners.
  const digest = createHash("md5")
    .update(`${ownerId}:alexa-default-company`)
    .digest("hex")
    .slice(0, 32);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
};

export class CompanyService {
  constructor(
    readonly store: CompanyStore,
    readonly identities: IdentityStore,
    readonly now: () => Date = () => new Date(),
  ) {}

  async ensureDefault(ownerId: string) {
    const existing = await this.store.listCompanies(ownerId);
    if (existing.length > 0) return existing[0]!;
    const at = this.now().toISOString();
    const id = defaultCompanyId(ownerId);
    const company = CompanySchema.parse({
      id,
      ownerId,
      slug: "default-company",
      name: "Default Company",
      status: "ACTIVE",
      timezone: null,
      defaultCurrency: null,
      createdAt: at,
      updatedAt: at,
    });
    const membership = CompanyMembershipSchema.parse({
      companyId: id,
      principalId: ownerId,
      principalType: "OWNER",
      role: "OWNER",
      status: "ACTIVE",
      createdAt: at,
      updatedAt: at,
    });
    try {
      await this.store.createCompany(company, membership);
    } catch (error) {
      const concurrent = await this.store.findCompany(ownerId, id);
      if (concurrent) return concurrent;
      throw error;
    }
    return company;
  }

  async list(identity: AuthenticatedIdentity) {
    await this.ensureDefault(identity.user.id);
    const companies = await this.store.listCompanies(identity.user.id);
    const selected = identity.session.activeCompanyId
      ? companies.find((company) => company.id === identity.session.activeCompanyId)
      : undefined;
    const current = selected && selected.status === "ACTIVE" ? selected : companies.find((company) => company.status === "ACTIVE")!;
    const summary = (company: typeof current) => ({ id: company.id, slug: company.slug, name: company.name, status: company.status });
    return CompanyListResponseSchema.parse({ currentCompany: summary(current), companies: companies.map(summary) });
  }

  async resolve(identity: AuthenticatedIdentity, requestedCompanyId: string | undefined, requestId: string): Promise<CompanyContext> {
    const fallback = await this.ensureDefault(identity.user.id);
    const companyId = requestedCompanyId ?? identity.session.activeCompanyId ?? fallback.id;
    const company = await this.store.findCompany(identity.user.id, companyId);
    const membership = await this.store.findMembership(identity.user.id, companyId);
    if (!company || !membership || membership.status !== "ACTIVE") {
      throw new ApiSecurityError(404, "COMPANY_NOT_FOUND", "The company is unavailable.");
    }
    if (company.status !== "ACTIVE") {
      throw new ApiSecurityError(409, "COMPANY_INACTIVE", "The company is not active.");
    }
    return CompanyContextSchema.parse({ ownerId: identity.user.id, companyId, role: "OWNER", requestId });
  }

  async resolveOwner(ownerId: string, requestedCompanyId: string | undefined, requestId: string): Promise<CompanyContext> {
    const fallback = await this.ensureDefault(ownerId);
    const companyId = requestedCompanyId ?? fallback.id;
    const company = await this.store.findCompany(ownerId, companyId);
    const membership = await this.store.findMembership(ownerId, companyId);
    if (!company || !membership || membership.status !== "ACTIVE")
      throw new ApiSecurityError(404, "COMPANY_NOT_FOUND", "The company is unavailable.");
    if (company.status !== "ACTIVE")
      throw new ApiSecurityError(409, "COMPANY_INACTIVE", "The company is not active.");
    return CompanyContextSchema.parse({ ownerId, companyId, role: "OWNER", requestId });
  }

  async select(identity: AuthenticatedIdentity, companyId: string) {
    await this.resolve(identity, companyId, `company-select:${identity.session.id}`);
    const session = { ...identity.session, activeCompanyId: companyId };
    await this.identities.updateSession(session);
    identity.session.activeCompanyId = companyId;
    return this.list(identity);
  }

  async create(identity: AuthenticatedIdentity, input: CreateCompanyRequest) {
    const at = this.now().toISOString();
    const company = CompanySchema.parse({
      id: crypto.randomUUID(), ownerId: identity.user.id, slug: input.slug, name: input.name,
      status: "ACTIVE", timezone: input.timezone ?? null, defaultCurrency: input.defaultCurrency ?? null,
      createdAt: at, updatedAt: at,
    });
    await this.store.createCompany(company, CompanyMembershipSchema.parse({
      companyId: company.id, principalId: identity.user.id, principalType: "OWNER", role: "OWNER",
      status: "ACTIVE", createdAt: at, updatedAt: at,
    }));
    return this.select(identity, company.id);
  }

  async archive(identity: AuthenticatedIdentity, companyId: string) {
    const companies = await this.list(identity);
    if (companies.companies.filter((company) => company.status === "ACTIVE").length <= 1) {
      throw new ApiSecurityError(409, "LAST_ACTIVE_COMPANY", "The last active company cannot be archived.");
    }
    const company = await this.store.findCompany(identity.user.id, companyId);
    if (!company) throw new ApiSecurityError(404, "COMPANY_NOT_FOUND", "The company is unavailable.");
    await this.store.updateCompany({ ...company, status: "ARCHIVED", updatedAt: this.now().toISOString() });
    if (identity.session.activeCompanyId === companyId) {
      const replacement = companies.companies.find((item) => item.id !== companyId && item.status === "ACTIVE")!;
      await this.select(identity, replacement.id);
    }
    return this.list(identity);
  }
}
