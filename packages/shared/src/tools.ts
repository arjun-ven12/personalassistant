import { z } from "zod";

import { CapabilitySchema } from "./capabilities.js";

export const RiskLevelSchema = z.enum([
  "read_only",
  "low",
  "medium",
  "high",
  "prohibited",
]);

export const ApprovalRequirementSchema = z.enum([
  "none",
  "session",
  "explicit",
  "recent_authentication",
  "prohibited",
]);

export const ToolDefinitionSchema = z
  .object({
    name: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/),
    description: z.string().trim().min(1).max(300),
    inputSchemaId: z.string().trim().min(1),
    outputSchemaId: z.string().trim().min(1),
    riskLevel: RiskLevelSchema,
    requiredCapabilities: z.array(CapabilitySchema),
    approvalRequirement: ApprovalRequirementSchema,
    targetType: z.enum(["none", "application", "workspace"]),
    requiresTrustedDevice: z.boolean(),
    timeoutMs: z.number().int().positive(),
    supportsCancellation: z.boolean(),
    supportsDryRun: z.boolean(),
    enabled: z.boolean(),
    version: z.string().trim().min(1),
  })
  .strict();

export const ToolResponseSchema = ToolDefinitionSchema;
export const ToolListResponseSchema = z.array(ToolDefinitionSchema);
export const ToolNameParametersSchema = z
  .object({ toolName: ToolDefinitionSchema.shape.name })
  .strict();

export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type ApprovalRequirement = z.infer<typeof ApprovalRequirementSchema>;
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
