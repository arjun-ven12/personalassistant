import { z } from "zod";

import { EngineeringControlCenterSchema } from "./engineering-delivery.js";
import { EngineeringIntegrationViewSchema } from "./engineering-integration.js";
import { EngineeringObjectiveSchema } from "./engineering-orchestration.js";

export const CreateSelfImprovementRequestSchema = z.object({
  request: z.string().trim().min(5).max(8_000),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(1_000)).max(30).default([]),
  idempotencyKey: z.string().trim().min(8).max(200),
}).strict();

export const RejectSelfImprovementCandidateRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500).nullable().default(null),
}).strict();

export const SelfImprovementRiskSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const SelfImprovementModeSchema = z.enum(["FAST", "FULL"]);

export const SelfImprovementViewSchema = z.object({
  objectiveId: z.string().uuid(),
  deliveryId: z.string().uuid(),
  repositoryId: z.string().uuid(),
  riskLevel: SelfImprovementRiskSchema,
  engineeringMode: SelfImprovementModeSchema,
  complexity: z.enum(["TRIVIAL", "SMALL", "MEDIUM", "LARGE", "HIGH_RISK"]),
  status: z.string().min(1).max(60),
  requiresOwnerApproval: z.boolean(),
  trainingEligible: z.boolean(),
  controlCenter: EngineeringControlCenterSchema,
  objective: EngineeringObjectiveSchema,
  integration: EngineeringIntegrationViewSchema.nullable(),
}).strict();

/** Authority-affecting paths always require security review, even if the request appeared routine. */
export const isSelfImprovementAuthorityPath = (value: string) =>
  /(^|\/)(auth|authentication|agent-os|capabilit(?:y|ies)|permissions?|tenant|secrets?|credentials?|crypto|governance|polic(?:y|ies)|approvals?|trusted-device|device-trust|self-update|self-improvement|airouter|ai-router|security|identity|sessions?|execution|native-providers|integrations?)(\/|\.|-)/i.test(value) ||
  /^(apps\/api\/src\/(?:ai\/router|agents|companies|memory|intent|voice|universal-tools|engineering-(?:orchestration|integration|runtime|delivery)|routes\/(?:engineering|self-improvement|universal-tools)|native-providers|app\.ts|index\.ts)|apps\/mac-agent\/|packages\/config\/|packages\/shared\/src\/(?:index\.ts|engineering-|self-improvement|universal-tools|repositories|governance)|apps\/api\/migrations\/)/i.test(value) ||
  /(^|\/)(AGENTS\.md|\.env(?:\.example)?|package\.json|pnpm-lock\.yaml|package-lock\.json)$/i.test(value);

export type SelfImprovementView = z.infer<typeof SelfImprovementViewSchema>;
