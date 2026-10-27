import { z } from "zod";
import {
  CreateSoftwareObjectiveRequestSchema,
  EngineeringDeliverySchema,
} from "./engineering-delivery.js";
import { EngineeringObjectiveSchema } from "./engineering-orchestration.js";

export const ENGINEERING_DRAFT_TOOL = "engineering.draft.create" as const;
export const EngineeringDraftCreateOperationSchema = z
  .object({
    operation: z.literal("engineering_draft_create"),
    companyId: z.string().uuid(),
    request: CreateSoftwareObjectiveRequestSchema.safeExtend({
      repositoryId: z.string().uuid(),
      developmentRootWorkspaceId: z.null().default(null),
      visibleMode: z.literal(false).default(false),
    }),
  })
  .strict();
export const EngineeringDraftResponseSchema = z
  .object({
    operationId: z.string().uuid(),
    policyEvaluationId: z.string().uuid(),
    requestDigest: z.string().regex(/^[a-f0-9]{64}$/),
    executionState: z.literal("NOT_STARTED"),
    delivery: EngineeringDeliverySchema,
    objective: EngineeringObjectiveSchema,
  })
  .strict();
export type EngineeringDraftCreateOperation = z.infer<
  typeof EngineeringDraftCreateOperationSchema
>;
