import { z } from "zod";

import { RegistryIdSchema } from "./applications.js";
import { CapabilitySchema } from "./capabilities.js";
import { NetworkVerificationStateSchema } from "./network.js";
import { PolicyEvaluationSchema } from "./policies.js";
import { ToolDefinitionSchema } from "./tools.js";

export const ProposedActionSchema = z
  .object({
    actionId: z.string().uuid(),
    toolName: ToolDefinitionSchema.shape.name,
    applicationId: RegistryIdSchema.optional(),
    workspaceId: RegistryIdSchema.optional(),
    arguments: z.json(),
    requestedCapabilities: z.array(CapabilitySchema).max(50).optional(),
  })
  .strict()
  .superRefine((action, context) => {
    const encoded = JSON.stringify(action.arguments);
    if (encoded.length > 16_384) {
      context.addIssue({
        code: "custom",
        path: ["arguments"],
        message: "Arguments exceed the 16 KiB policy-simulation limit.",
      });
    }
  });

export const PolicyEvaluationRequestSchema = z
  .object({ action: ProposedActionSchema })
  .strict();

export const PolicyEvaluationResponseSchema = z
  .object({
    evaluation: PolicyEvaluationSchema,
    networkVerification: NetworkVerificationStateSchema,
  })
  .strict();

export const PolicyEvaluationListResponseSchema = z.array(PolicyEvaluationSchema);

export type ProposedAction = z.infer<typeof ProposedActionSchema>;
export type PolicyEvaluationRequest = z.infer<typeof PolicyEvaluationRequestSchema>;
