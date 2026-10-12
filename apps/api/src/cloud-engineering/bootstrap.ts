import { z } from "zod";
import { CloudCompanyConfigurationSchema } from "./provisioning.js";
/** Operator-owned, non-secret configuration. Credentials resolve from company records. */
export const RailwayEngineeringConfigurationSchema =
  CloudCompanyConfigurationSchema.omit({ serverPublicKeyX: true })
    .extend({
      projectId: z.string().uuid(),
      environmentId: z.string().uuid(),
      checkpoint: z.string().regex(/^athena-worker-[a-f0-9]{64}$/),
      credentialReferenceId: z.string().uuid(),
    })
    .strict();
export type RailwayEngineeringConfiguration = z.infer<
  typeof RailwayEngineeringConfigurationSchema
>;
export function parseRailwayEngineeringConfiguration(raw: string | undefined) {
  if (!raw) return [];
  return z
    .array(RailwayEngineeringConfigurationSchema)
    .max(20)
    .parse(JSON.parse(raw) as unknown);
}
