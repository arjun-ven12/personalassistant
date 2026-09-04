import { z } from "zod";

export const CompanyStatusSchema = z.enum([
  "DRAFT", "PROVISIONING", "ACTIVE", "PAUSED", "SUSPENDED", "ARCHIVED", "FAILED_PROVISIONING",
]);
export const CompanyRiskToleranceSchema = z.enum(["LOW", "BALANCED", "HIGH"]);
export const CompanyAutonomyLevelSchema = z.enum(["SUPERVISED", "GUARDED"]);
export const CompanyApprovalPolicySchema = z.enum(["SUPERVISED", "STANDARD"]);
export const CompanyPortfolioPrioritySchema = z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]);

export const CompanySettingsSchema = z.object({
  description: z.string().trim().max(2_000).nullable().default(null),
  industry: z.string().trim().max(160).nullable().default(null),
  businessModel: z.string().trim().max(160).nullable().default(null),
  jurisdiction: z.string().trim().max(120).nullable().default(null),
  defaultLanguage: z.string().trim().min(2).max(16).default("en"),
  riskTolerance: CompanyRiskToleranceSchema.default("LOW"),
  autonomyLevel: CompanyAutonomyLevelSchema.default("SUPERVISED"),
  defaultApprovalPolicy: CompanyApprovalPolicySchema.default("SUPERVISED"),
  portfolioPriority: CompanyPortfolioPrioritySchema.default("NORMAL"),
  starterCredits: z.literal(0).default(0),
}).strict();

export const CompanySchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(80),
  name: z.string().trim().min(1).max(160),
  status: CompanyStatusSchema,
  timezone: z.string().trim().min(1).max(80).nullable(),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  settings: CompanySettingsSchema.default({
    description: null, industry: null, businessModel: null, jurisdiction: null,
    defaultLanguage: "en", riskTolerance: "LOW", autonomyLevel: "SUPERVISED",
    defaultApprovalPolicy: "SUPERVISED", starterCredits: 0,
    portfolioPriority: "NORMAL",
  }),
  memoryScopeId: z.string().min(1).max(200).nullable().default(null),
  economyAccountId: z.string().min(1).max(200).nullable().default(null),
  governanceProfileId: z.string().min(1).max(200).nullable().default(null),
  capabilityProfileId: z.string().min(1).max(200).nullable().default(null),
  credentialScopeId: z.string().min(1).max(200).nullable().default(null),
  governorAgentId: z.string().min(1).max(200).nullable().default(null),
  activatedAt: z.iso.datetime().nullable().default(null),
  pausedAt: z.iso.datetime().nullable().default(null),
  suspendedAt: z.iso.datetime().nullable().default(null),
  archivedAt: z.iso.datetime().nullable().default(null),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();

export const CompanyMembershipSchema = z.object({
  companyId: z.string().uuid(), principalId: z.string().uuid(), principalType: z.literal("OWNER"),
  role: z.literal("OWNER"), status: z.enum(["ACTIVE", "REVOKED"]), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).strict();

export const CompanyProvisioningStepNameSchema = z.enum([
  "COMPANY_CREATED", "MEMORY_SCOPE_READY", "ECONOMY_ACCOUNT_READY", "GOVERNANCE_PROFILE_READY",
  "CAPABILITY_PROFILE_READY", "CREDENTIAL_SCOPE_READY", "GOVERNOR_PLACEHOLDER_READY", "VALIDATED", "ACTIVATED",
]);
export const CompanyProvisioningStepSchema = z.object({
  name: CompanyProvisioningStepNameSchema,
  status: z.enum(["PENDING", "COMPLETED", "FAILED"]),
  attempts: z.number().int().min(0), errorCode: z.string().max(100).nullable(),
  completedAt: z.iso.datetime().nullable(), updatedAt: z.iso.datetime(),
}).strict();
export const CompanyProvisioningSchema = z.object({
  companyId: z.string().uuid(), ownerId: z.string().uuid(), idempotencyKey: z.string().min(8).max(200),
  status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED"]),
  steps: z.array(CompanyProvisioningStepSchema).max(20), lastErrorCode: z.string().max(100).nullable(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).strict();

export const CompanySummarySchema = CompanySchema.pick({ id: true, slug: true, name: true, status: true, settings: true });
export const CompanyListResponseSchema = z.object({
  currentCompany: CompanySummarySchema, companies: z.array(CompanySummarySchema).max(100),
  companyLimit: z.number().int().positive().max(100).default(100),
}).strict();
export const CompanyDetailResponseSchema = z.object({ company: CompanySchema, provisioning: CompanyProvisioningSchema.nullable() }).strict();

export const CreateCompanyRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(80).optional(),
  description: z.string().trim().max(2_000).optional(), industry: z.string().trim().max(160).optional(),
  businessModel: z.string().trim().max(160).optional(), jurisdiction: z.string().trim().max(120).optional(),
  defaultLanguage: z.string().trim().min(2).max(16).optional(), timezone: z.string().trim().min(1).max(80).optional(),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/).optional(), riskTolerance: CompanyRiskToleranceSchema.optional(),
  autonomyLevel: CompanyAutonomyLevelSchema.optional(), defaultApprovalPolicy: CompanyApprovalPolicySchema.optional(),
  portfolioPriority: CompanyPortfolioPrioritySchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
}).strict();
export const UpdateCompanyRequestSchema = CreateCompanyRequestSchema.omit({ idempotencyKey: true }).partial()
  .refine((value) => Object.keys(value).length > 0, "At least one setting is required.");
export const SelectCompanyRequestSchema = z.object({ companyId: z.string().uuid() }).strict();
export const UpdateCompanyLimitRequestSchema = z.object({ companyLimit: z.number().int().min(1).max(100) }).strict();
export const CompanyLifecycleActionSchema = z.enum(["pause", "resume", "suspend", "archive", "restore", "retry-provisioning"]);

export const CompanyContextSchema = z.object({
  ownerId: z.string().uuid(), companyId: z.string().uuid(), role: z.literal("OWNER"),
  sourceDeviceId: z.string().uuid().optional(), sourceClientInstanceId: z.string().uuid().optional(),
  requestId: z.string().min(1).max(200),
}).strict();

export type Company = z.infer<typeof CompanySchema>;
export type CompanyStatus = z.infer<typeof CompanyStatusSchema>;
export type CompanyMembership = z.infer<typeof CompanyMembershipSchema>;
export type CompanyProvisioning = z.infer<typeof CompanyProvisioningSchema>;
export type CompanyProvisioningStepName = z.infer<typeof CompanyProvisioningStepNameSchema>;
export type CompanyContext = z.infer<typeof CompanyContextSchema>;
export type CreateCompanyRequest = z.infer<typeof CreateCompanyRequestSchema>;
export type UpdateCompanyRequest = z.infer<typeof UpdateCompanyRequestSchema>;
export type CompanyLifecycleAction = z.infer<typeof CompanyLifecycleActionSchema>;
