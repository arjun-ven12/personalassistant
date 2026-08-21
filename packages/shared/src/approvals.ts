import { z } from "zod";

import { RegistryIdSchema } from "./applications.js";
import { ApprovalRequirementSchema, RiskLevelSchema } from "./tools.js";

export const ApprovalStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
  "CONSUMED",
]);

export const ApprovalRequestSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    requestedByDeviceId: z.string().uuid().optional(),
    actionId: z.string().uuid(),
    actionDigest: z.string().regex(/^[a-f0-9]{64}$/),
    toolName: z.string().min(3).max(100),
    applicationId: RegistryIdSchema.optional(),
    workspaceId: RegistryIdSchema.optional(),
    riskLevel: RiskLevelSchema,
    approvalRequirement: ApprovalRequirementSchema,
    status: ApprovalStatusSchema,
    humanSummary: z.string().trim().min(1).max(300),
    requestedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    decidedAt: z.iso.datetime().nullable(),
    decidedBySessionId: z.string().uuid().nullable(),
    rejectionReason: z.string().trim().max(300).nullable(),
  })
  .strict();

export const ApprovalListResponseSchema = z.array(ApprovalRequestSchema);
export const ApprovalResponseSchema = ApprovalRequestSchema;
export const ApprovalDecisionRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(300).optional(),
  })
  .strict();
export const ApprovalIdParametersSchema = z
  .object({ approvalId: z.string().uuid() })
  .strict();

export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
