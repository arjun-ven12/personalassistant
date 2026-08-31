import {
  CompanyContextSchema,
  CompanyDetailResponseSchema,
  CompanyListResponseSchema,
  CompanyMembershipSchema,
  CompanyProvisioningSchema,
  CompanyProvisioningStepNameSchema,
  CompanySchema,
  type Company,
  type CompanyContext,
  type CompanyLifecycleAction,
  type CompanyProvisioning,
  type CompanyProvisioningStepName,
  type CreateCompanyRequest,
  type UpdateCompanyRequest,
} from "@alexa-control/shared";
import { createHash } from "node:crypto";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { ApiSecurityError } from "../identity/errors.js";
import type { IdentityStore } from "../identity/store.js";
import type { AuthenticatedIdentity } from "../identity/types.js";
import type { CompanyStore } from "./store.js";

const defaultCompanyId = (ownerId: string) => {
  const digest = createHash("md5").update(`${ownerId}:alexa-default-company`).digest("hex").slice(0, 32);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
};

const steps = CompanyProvisioningStepNameSchema.options;
const safeSlug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "company";
const stableKey = (ownerId: string, input: CreateCompanyRequest) =>
  input.idempotencyKey ?? createHash("sha256").update(`${ownerId}:${input.slug ?? safeSlug(input.name)}:${input.name}`).digest("hex");

type OperationContext = { requestId?: string; ipAddress?: string };
type AccessMode = "READ" | "OPERATE";
export type CompanyProvisioningHook = (step: CompanyProvisioningStepName, company: Company) => void | Promise<void>;

export class CompanyService {
  #audit: GovernanceAuditWriter | undefined;
  #provisioningHook: CompanyProvisioningHook | undefined;

  constructor(
    readonly store: CompanyStore,
    readonly identities: IdentityStore,
    readonly now: () => Date = () => new Date(),
    readonly companyLimit = 100,
  ) {}

  setAudit(audit: GovernanceAuditWriter) { this.#audit = audit; }
  setProvisioningHook(hook: CompanyProvisioningHook | undefined) { this.#provisioningHook = hook; }

  private resources(companyId: string) {
    return {
      memoryScopeId: `company:${companyId}:memory`,
      economyAccountId: `company:${companyId}:economy`,
      governanceProfileId: `company:${companyId}:governance`,
      capabilityProfileId: `company:${companyId}:capabilities`,
      credentialScopeId: `company:${companyId}:credentials`,
      governorAgentId: `company:${companyId}:governor:dormant`,
    };
  }

  private completeProvisioning(company: Company, idempotencyKey: string, at: string): CompanyProvisioning {
    return CompanyProvisioningSchema.parse({
      companyId: company.id, ownerId: company.ownerId, idempotencyKey, status: "COMPLETED", lastErrorCode: null,
      steps: steps.map((name) => ({ name, status: "COMPLETED", attempts: 1, errorCode: null, completedAt: at, updatedAt: at })),
      createdAt: at, updatedAt: at,
    });
  }

  async ensureDefault(ownerId: string) {
    const existing = await this.store.listCompanies(ownerId);
    if (existing.length > 0) return existing[0]!;
    const at = this.now().toISOString();
    const id = defaultCompanyId(ownerId);
    const company = CompanySchema.parse({
      id, ownerId, slug: "default-company", name: "Default Company", status: "ACTIVE",
      timezone: null, defaultCurrency: null, settings: {}, ...this.resources(id), activatedAt: at,
      createdAt: at, updatedAt: at,
    });
    const membership = CompanyMembershipSchema.parse({
      companyId: id, principalId: ownerId, principalType: "OWNER", role: "OWNER", status: "ACTIVE", createdAt: at, updatedAt: at,
    });
    try {
      await this.store.createCompany(company, membership, this.completeProvisioning(company, `default:${ownerId}`, at));
    } catch (error) {
      const concurrent = await this.store.findCompany(ownerId, id);
      if (concurrent) return concurrent;
      throw error;
    }
    return company;
  }

  private summary(company: Company) {
    return { id: company.id, slug: company.slug, name: company.name, status: company.status, settings: company.settings };
  }

  private async limitFor(ownerId: string) { return await this.store.getCompanyLimit(ownerId) ?? this.companyLimit; }

  async list(identity: AuthenticatedIdentity) {
    await this.ensureDefault(identity.user.id);
    const companies = await this.store.listCompanies(identity.user.id);
    const selected = identity.session.activeCompanyId ? companies.find((company) => company.id === identity.session.activeCompanyId) : undefined;
    const current = selected ?? companies.find((company) => company.status === "ACTIVE") ?? companies[0]!;
    return CompanyListResponseSchema.parse({ currentCompany: this.summary(current), companies: companies.map((company) => this.summary(company)), companyLimit: await this.limitFor(identity.user.id) });
  }

  async detail(identity: AuthenticatedIdentity, companyId: string) {
    const company = await this.owned(identity.user.id, companyId);
    return CompanyDetailResponseSchema.parse({ company, provisioning: await this.store.findProvisioning(identity.user.id, companyId) ?? null });
  }

  private async owned(ownerId: string, companyId: string) {
    const company = await this.store.findCompany(ownerId, companyId);
    const membership = await this.store.findMembership(ownerId, companyId);
    if (!company || !membership || membership.status !== "ACTIVE") throw new ApiSecurityError(404, "COMPANY_NOT_FOUND", "The company is unavailable.");
    return company;
  }

  private assertAccess(company: Company, access: AccessMode) {
    if (access === "OPERATE" && company.status !== "ACTIVE") {
      throw new ApiSecurityError(409, "COMPANY_MUTATIONS_BLOCKED", `New work is blocked while the company is ${company.status.toLowerCase()}.`);
    }
    if (access === "READ" && ["DRAFT", "PROVISIONING", "FAILED_PROVISIONING"].includes(company.status)) {
      throw new ApiSecurityError(409, "COMPANY_NOT_READY", "The company has not completed provisioning.");
    }
  }

  async resolve(identity: AuthenticatedIdentity, requestedCompanyId: string | undefined, requestId: string, access: AccessMode = "READ"): Promise<CompanyContext> {
    const fallback = await this.ensureDefault(identity.user.id);
    const companyId = requestedCompanyId ?? identity.session.activeCompanyId ?? fallback.id;
    const company = await this.owned(identity.user.id, companyId);
    this.assertAccess(company, access);
    return CompanyContextSchema.parse({ ownerId: identity.user.id, companyId, role: "OWNER", requestId });
  }

  async resolveOwner(ownerId: string, requestedCompanyId: string | undefined, requestId: string, access: AccessMode = "READ"): Promise<CompanyContext> {
    const fallback = await this.ensureDefault(ownerId);
    const companyId = requestedCompanyId ?? fallback.id;
    const company = await this.owned(ownerId, companyId);
    this.assertAccess(company, access);
    return CompanyContextSchema.parse({ ownerId, companyId, role: "OWNER", requestId });
  }

  async select(identity: AuthenticatedIdentity, companyId: string, context: OperationContext = {}) {
    const company = await this.owned(identity.user.id, companyId);
    if (["DRAFT", "PROVISIONING", "FAILED_PROVISIONING"].includes(company.status)) throw new ApiSecurityError(409, "COMPANY_NOT_READY", "Finish company provisioning before opening it.");
    const session = { ...identity.session, activeCompanyId: companyId };
    await this.identities.updateSession(session);
    identity.session.activeCompanyId = companyId;
    await this.audit("COMPANY_SWITCHED", company, context, "Company context selected.");
    return this.list(identity);
  }

  async create(identity: AuthenticatedIdentity, input: CreateCompanyRequest, context: OperationContext = {}) {
    await this.ensureDefault(identity.user.id);
    const key = stableKey(identity.user.id, input);
    const previous = await this.store.findProvisioningByIdempotency(identity.user.id, key);
    if (previous) {
      const company = await this.owned(identity.user.id, previous.companyId);
      if (previous.status !== "COMPLETED") await this.provision(company, previous, context);
      return this.select(identity, company.id, context);
    }
    const existing = await this.store.listCompanies(identity.user.id);
    const limit = await this.limitFor(identity.user.id);
    if (existing.length >= limit) throw new ApiSecurityError(409, "COMPANY_LIMIT_REACHED", `The owner company limit of ${limit} has been reached.`);
    const at = this.now().toISOString();
    const id = crypto.randomUUID();
    const company = CompanySchema.parse({
      id, ownerId: identity.user.id, slug: input.slug ?? safeSlug(input.name), name: input.name, status: "DRAFT",
      timezone: input.timezone ?? null, defaultCurrency: input.defaultCurrency ?? null,
      settings: {
        description: input.description ?? null, industry: input.industry ?? null, businessModel: input.businessModel ?? null,
        jurisdiction: input.jurisdiction ?? null, defaultLanguage: input.defaultLanguage ?? "en",
        riskTolerance: input.riskTolerance ?? "LOW", autonomyLevel: input.autonomyLevel ?? "SUPERVISED",
        defaultApprovalPolicy: input.defaultApprovalPolicy ?? "SUPERVISED", starterCredits: 0,
      }, createdAt: at, updatedAt: at,
    });
    const provisioning = CompanyProvisioningSchema.parse({
      companyId: id, ownerId: identity.user.id, idempotencyKey: key, status: "PENDING", lastErrorCode: null,
      steps: steps.map((name) => ({ name, status: name === "COMPANY_CREATED" ? "COMPLETED" : "PENDING", attempts: name === "COMPANY_CREATED" ? 1 : 0, errorCode: null, completedAt: name === "COMPANY_CREATED" ? at : null, updatedAt: at })),
      createdAt: at, updatedAt: at,
    });
    await this.store.createCompany(company, CompanyMembershipSchema.parse({
      companyId: id, principalId: identity.user.id, principalType: "OWNER", role: "OWNER", status: "ACTIVE", createdAt: at, updatedAt: at,
    }), provisioning);
    await this.audit("COMPANY_CREATED", company, context, "Company draft and owner membership created.");
    await this.provision(company, provisioning, context);
    return this.select(identity, id, context);
  }

  private async provision(initial: Company, initialRecord: CompanyProvisioning, context: OperationContext) {
    let company = CompanySchema.parse({ ...initial, status: "PROVISIONING", updatedAt: this.now().toISOString() });
    let record = CompanyProvisioningSchema.parse({ ...initialRecord, status: "RUNNING", lastErrorCode: null, updatedAt: company.updatedAt });
    await this.store.updateCompany(company);
    await this.store.saveProvisioning(record);
    await this.audit("COMPANY_PROVISIONING_STARTED", company, context, "Bounded company bootstrap started.");
    const resourceSteps: Array<[CompanyProvisioningStepName, keyof ReturnType<CompanyService["resources"]>]> = [
      ["MEMORY_SCOPE_READY", "memoryScopeId"], ["ECONOMY_ACCOUNT_READY", "economyAccountId"],
      ["GOVERNANCE_PROFILE_READY", "governanceProfileId"], ["CAPABILITY_PROFILE_READY", "capabilityProfileId"],
      ["CREDENTIAL_SCOPE_READY", "credentialScopeId"], ["GOVERNOR_PLACEHOLDER_READY", "governorAgentId"],
    ];
    try {
      for (const [step, field] of resourceSteps) {
        if (record.steps.find((item) => item.name === step)?.status === "COMPLETED") continue;
        await this.#provisioningHook?.(step, company);
        company = CompanySchema.parse({ ...company, [field]: this.resources(company.id)[field], updatedAt: this.now().toISOString() });
        await this.store.updateCompany(company);
        record = await this.completeStep(record, step);
      }
      await this.#provisioningHook?.("VALIDATED", company);
      this.validateBootstrap(company);
      record = await this.completeStep(record, "VALIDATED");
      const at = this.now().toISOString();
      company = CompanySchema.parse({ ...company, status: "ACTIVE", activatedAt: at, pausedAt: null, suspendedAt: null, archivedAt: null, updatedAt: at });
      await this.store.updateCompany(company);
      record = await this.completeStep(record, "ACTIVATED", "COMPLETED");
      await this.audit("COMPANY_ACTIVATED", company, context, "Company bootstrap validated and activated.");
      return company;
    } catch (error) {
      const code = error instanceof ApiSecurityError ? error.code : "COMPANY_PROVISIONING_FAILED";
      const at = this.now().toISOString();
      company = CompanySchema.parse({ ...company, status: "FAILED_PROVISIONING", updatedAt: at });
      record = CompanyProvisioningSchema.parse({ ...record, status: "FAILED", lastErrorCode: code, updatedAt: at });
      await this.store.updateCompany(company);
      await this.store.saveProvisioning(record);
      await this.audit("COMPANY_PROVISIONING_FAILED", company, context, "Company bootstrap failed closed.", "FAILURE", { errorCode: code });
      throw new ApiSecurityError(409, code, "Company provisioning did not complete. Retry provisioning from company management.");
    }
  }

  private async completeStep(record: CompanyProvisioning, name: CompanyProvisioningStepName, finalStatus: CompanyProvisioning["status"] = "RUNNING") {
    const at = this.now().toISOString();
    const next = CompanyProvisioningSchema.parse({
      ...record, status: finalStatus, lastErrorCode: null, updatedAt: at,
      steps: record.steps.map((step) => step.name === name ? { ...step, status: "COMPLETED", attempts: step.attempts + 1, errorCode: null, completedAt: at, updatedAt: at } : step),
    });
    await this.store.saveProvisioning(next);
    return next;
  }

  private validateBootstrap(company: Company) {
    const required = [company.memoryScopeId, company.economyAccountId, company.governanceProfileId, company.capabilityProfileId, company.credentialScopeId, company.governorAgentId];
    if (required.some((value) => !value) || company.settings.starterCredits !== 0) throw new ApiSecurityError(409, "COMPANY_BOOTSTRAP_INVALID", "Company bootstrap state is incomplete.");
  }

  async update(identity: AuthenticatedIdentity, companyId: string, input: UpdateCompanyRequest, context: OperationContext = {}) {
    const company = await this.owned(identity.user.id, companyId);
    const at = this.now().toISOString();
    const updated = CompanySchema.parse({
      ...company, name: input.name ?? company.name, slug: input.slug ?? company.slug,
      timezone: input.timezone ?? company.timezone, defaultCurrency: input.defaultCurrency ?? company.defaultCurrency,
      settings: { ...company.settings,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.industry !== undefined ? { industry: input.industry } : {}),
        ...(input.businessModel !== undefined ? { businessModel: input.businessModel } : {}),
        ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction } : {}),
        ...(input.defaultLanguage !== undefined ? { defaultLanguage: input.defaultLanguage } : {}),
        ...(input.riskTolerance !== undefined ? { riskTolerance: input.riskTolerance } : {}),
        ...(input.autonomyLevel !== undefined ? { autonomyLevel: input.autonomyLevel } : {}),
        ...(input.defaultApprovalPolicy !== undefined ? { defaultApprovalPolicy: input.defaultApprovalPolicy } : {}),
      }, updatedAt: at,
    });
    await this.store.updateCompany(updated);
    await this.audit("COMPANY_SETTINGS_UPDATED", updated, context, "Company settings updated.");
    return this.detail(identity, companyId);
  }

  async updateLimit(identity: AuthenticatedIdentity, limit: number, context: OperationContext = {}) {
    const existing = await this.store.listCompanies(identity.user.id);
    if (limit < existing.length) throw new ApiSecurityError(409, "COMPANY_LIMIT_BELOW_USAGE", `The limit cannot be lower than the current ${existing.length} companies.`);
    await this.store.setCompanyLimit(identity.user.id, limit, this.now().toISOString());
    const current = await this.owned(identity.user.id, identity.session.activeCompanyId ?? existing[0]!.id);
    await this.audit("COMPANY_SETTINGS_UPDATED", current, context, "Owner company limit updated.", "SUCCESS", { companyLimit: limit });
    return this.list(identity);
  }

  async transition(identity: AuthenticatedIdentity, companyId: string, action: CompanyLifecycleAction, context: OperationContext = {}) {
    let company = await this.owned(identity.user.id, companyId);
    if (action === "retry-provisioning") {
      const provisioning = await this.store.findProvisioning(identity.user.id, companyId);
      if (!provisioning || !["FAILED_PROVISIONING", "PROVISIONING"].includes(company.status)) throw new ApiSecurityError(409, "INVALID_COMPANY_TRANSITION", "Provisioning is not awaiting retry.");
      await this.provision(company, provisioning, context);
      return this.detail(identity, companyId);
    }
    const at = this.now().toISOString();
    let event: Parameters<GovernanceAuditWriter>[0]["eventType"];
    if (action === "pause" && company.status === "ACTIVE") { company = CompanySchema.parse({ ...company, status: "PAUSED", pausedAt: at, updatedAt: at }); event = "COMPANY_PAUSED"; }
    else if (action === "resume" && company.status === "PAUSED") { this.validateBootstrap(company); company = CompanySchema.parse({ ...company, status: "ACTIVE", pausedAt: null, updatedAt: at }); event = "COMPANY_RESUMED"; }
    else if (action === "suspend" && ["ACTIVE", "PAUSED"].includes(company.status)) { company = CompanySchema.parse({ ...company, status: "SUSPENDED", suspendedAt: at, updatedAt: at }); event = "COMPANY_SUSPENDED"; }
    else if (action === "archive" && ["ACTIVE", "PAUSED", "SUSPENDED"].includes(company.status)) {
      const active = (await this.store.listCompanies(identity.user.id)).filter((item) => item.status === "ACTIVE" && item.id !== company.id);
      if (company.status === "ACTIVE" && active.length === 0) throw new ApiSecurityError(409, "LAST_ACTIVE_COMPANY", "The last active company cannot be archived.");
      company = CompanySchema.parse({ ...company, status: "ARCHIVED", archivedAt: at, updatedAt: at }); event = "COMPANY_ARCHIVED";
    } else if (action === "restore" && ["ARCHIVED", "SUSPENDED"].includes(company.status)) {
      this.validateBootstrap(company); company = CompanySchema.parse({ ...company, status: "ACTIVE", archivedAt: null, suspendedAt: null, pausedAt: null, updatedAt: at }); event = "COMPANY_RESTORED";
    } else throw new ApiSecurityError(409, "INVALID_COMPANY_TRANSITION", `Cannot ${action} a company in ${company.status} state.`);
    await this.store.updateCompany(company);
    await this.audit(event, company, context, `Company lifecycle action ${action} completed.`);
    return this.detail(identity, companyId);
  }

  async archive(identity: AuthenticatedIdentity, companyId: string, context: OperationContext = {}) {
    await this.transition(identity, companyId, "archive", context);
    if (identity.session.activeCompanyId === companyId) {
      const replacement = (await this.store.listCompanies(identity.user.id)).find((item) => item.status === "ACTIVE");
      if (replacement) await this.select(identity, replacement.id, context);
    }
    return this.list(identity);
  }

  async handleConversation(identity: AuthenticatedIdentity, utterance: string, context: OperationContext = {}): Promise<string | null> {
    const text = utterance.trim();
    if (!/\bcompan(?:y|ies)\b/i.test(text)) return null;
    if (/\b(?:list|show|what are)\b.*\bcompanies\b/i.test(text)) {
      const response = await this.list(identity);
      return `You have ${response.companies.length} companies: ${response.companies.map((company) => `${company.name} (${company.status.toLowerCase().replaceAll("_", " ")})`).join(", ")}.`;
    }
    if (/\b(?:which|what) company\b|\bcurrent company\b/i.test(text)) {
      const response = await this.list(identity);
      return `You are currently in ${response.currentCompany.name}.`;
    }
    const createMatch = text.match(/\bcreate (?:a )?(?:new )?company(?: (?:called|named))?\s+(.+?)(?:\s+(?:in|for) the [a-z-]+ industry)?[.!?]*$/i);
    if (/\bcreate\b.*\bcompany\b/i.test(text)) {
      const name = createMatch?.[1]?.trim().replace(/[.!?]+$/g, "");
      if (!name) return "What should the new company be called?";
      const created = await this.create(identity, { name, idempotencyKey: `conversation:${createHash("sha256").update(`${identity.user.id}:${name.toLowerCase()}`).digest("hex")}` }, context);
      return `${created.currentCompany.name} is provisioned and active with zero starter credits and a dormant Governor.`;
    }
    const switchMatch = text.match(/\b(?:switch|change|move)\s+(?:me\s+)?(?:to|into)\s+(.+?)[.!?]*$/i);
    if (switchMatch) {
      const target = switchMatch[1]!.trim().replace(/[.!?]+$/g, "");
      const response = await this.list(identity);
      const targets = [target, target.replace(/\s+company$/i, "")];
      const matches = response.companies.filter((company) => targets.some((candidate) => company.name.toLowerCase() === candidate.toLowerCase() || company.slug === safeSlug(candidate)));
      if (matches.length !== 1) return matches.length === 0 ? `I could not find a company named ${target}.` : `More than one company matches ${target}. Please use the company switcher.`;
      if (matches[0]!.status !== "ACTIVE") return `${matches[0]!.name} is ${matches[0]!.status.toLowerCase().replaceAll("_", " ")}. Restore or resume it before switching.`;
      await this.select(identity, matches[0]!.id, context);
      return `Switched to ${matches[0]!.name}.`;
    }
    const lifecycleMatch = text.match(/\b(pause|resume|suspend|archive|restore)\b(?:\s+(?:the\s+)?)?(.*?)(?:\s+company)?[.!?]*$/i);
    if (lifecycleMatch) {
      const action = lifecycleMatch[1]!.toLowerCase() as CompanyLifecycleAction;
      const targetText = lifecycleMatch[2]!.trim();
      const response = await this.list(identity);
      const target = !targetText || /^(?:this|current)$/i.test(targetText)
        ? response.companies.find((company) => company.id === response.currentCompany.id)
        : response.companies.find((company) => company.name.toLowerCase() === targetText.toLowerCase() || company.slug === safeSlug(targetText));
      if (!target) return "Which company should I update?";
      await this.transition(identity, target.id, action, context);
      const resultingState = action === "resume" || action === "restore" ? "active" : action === "pause" ? "paused" : action === "suspend" ? "suspended" : "archived";
      return `${target.name} is now ${resultingState}.`;
    }
    return null;
  }

  private async audit(eventType: Parameters<GovernanceAuditWriter>[0]["eventType"], company: Company, context: OperationContext, reason: string, outcome: "SUCCESS" | "FAILURE" = "SUCCESS", metadata?: Record<string, string | number | boolean | null>) {
    await this.#audit?.({ eventType, ownerId: company.ownerId, companyId: company.id, outcome, reason,
      ...(metadata ? { metadata } : {}), ipAddress: context.ipAddress ?? "internal", requestId: context.requestId ?? `company:${company.id}` });
  }
}
