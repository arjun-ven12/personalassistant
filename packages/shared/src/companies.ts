import { z } from "zod";

export const CompanyStatusSchema = z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]);

export const CompanySchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(80),
  name: z.string().trim().min(1).max(160),
  status: CompanyStatusSchema,
  timezone: z.string().trim().min(1).max(80).nullable(),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();

export const CompanyMembershipSchema = z.object({
  companyId: z.string().uuid(),
  principalId: z.string().uuid(),
  principalType: z.literal("OWNER"),
  role: z.literal("OWNER"),
  status: z.enum(["ACTIVE", "REVOKED"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();

export const CompanySummarySchema = CompanySchema.pick({
  id: true,
  slug: true,
  name: true,
  status: true,
});

export const CompanyListResponseSchema = z.object({
  currentCompany: CompanySummarySchema,
  companies: z.array(CompanySummarySchema).max(100),
}).strict();

export const CreateCompanyRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(80),
  timezone: z.string().trim().min(1).max(80).optional(),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
}).strict();

export const SelectCompanyRequestSchema = z.object({
  companyId: z.string().uuid(),
}).strict();

export const CompanyContextSchema = z.object({
  ownerId: z.string().uuid(),
  companyId: z.string().uuid(),
  role: z.literal("OWNER"),
  sourceDeviceId: z.string().uuid().optional(),
  sourceClientInstanceId: z.string().uuid().optional(),
  requestId: z.string().min(1).max(200),
}).strict();

export type Company = z.infer<typeof CompanySchema>;
export type CompanyMembership = z.infer<typeof CompanyMembershipSchema>;
export type CompanyContext = z.infer<typeof CompanyContextSchema>;
export type CreateCompanyRequest = z.infer<typeof CreateCompanyRequestSchema>;
