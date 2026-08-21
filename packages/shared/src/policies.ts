import { z } from "zod";

import { CapabilitySchema } from "./capabilities.js";
import { DeviceTrustStatusSchema } from "./devices.js";
import { NetworkVerificationStateSchema } from "./network.js";
import { ApprovalRequirementSchema, RiskLevelSchema } from "./tools.js";

export const PolicyDecisionSchema = z.enum([
  "allow",
  "deny",
  "require_approval",
  "prohibited",
]);

export const PolicyEvaluationSchema = z
  .object({
    decision: PolicyDecisionSchema,
    id: z.string().uuid(),
    actionId: z.string().uuid(),
    ownerId: z.string().uuid(),
    deviceId: z.string().uuid().optional(),
    reasonCode: z.string().trim().min(1),
    humanReadableReason: z.string().trim().min(1),
    matchedRules: z.array(z.string().trim().min(1)),
    riskLevel: RiskLevelSchema,
    approvalRequirement: ApprovalRequirementSchema,
    approvalRequestId: z.string().uuid().optional(),
    executionAllowed: z.literal(false),
    evaluatedAt: z.iso.datetime(),
  })
  .strict();

export const SecurityContextSchema = z
  .object({
    ownerId: z.string().uuid(),
    deviceId: z.string().trim().min(1).optional(),
    deviceTrustStatus: DeviceTrustStatusSchema,
    networkVerification: NetworkVerificationStateSchema,
    recentAuthentication: z.boolean(),
    privilegedExecutionAvailable: z.literal(false),
    emergencyStopActive: z.boolean(),
    requestedTool: z.string().trim().min(1),
    requestedCapabilities: z.array(CapabilitySchema),
    targetApplicationId: z.string().trim().min(1).optional(),
    targetWorkspaceId: z.string().trim().min(1).optional(),
  })
  .strict();

export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;
export type PolicyEvaluation = z.infer<typeof PolicyEvaluationSchema>;
export type SecurityContext = z.infer<typeof SecurityContextSchema>;
