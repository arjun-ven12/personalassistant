import {
  EngineeringExecutionTargetSchema,
  EngineeringTaskTypeSchema,
  type EngineeringExecutionTarget,
} from "@alexa-control/shared";
import { z } from "zod";

/** These facts are supplied by registered repository and worker records, not clients. */
export const EngineeringRoutingFactsSchema = z
  .object({
    repositoryPlacement: z.enum(["GITHUB", "MAC_LOCAL"]),
    taskType: EngineeringTaskTypeSchema,
    requiresOwnerLocalFiles: z.boolean(),
    requiresDeviceResources: z.boolean(),
    cloudWorker: z
      .object({
        registered: z.boolean(),
        healthy: z.boolean(),
        capabilities: z.array(z.string()).max(100),
      })
      .strict(),
    macAgent: z.object({ trusted: z.boolean(), online: z.boolean() }).strict(),
    requiredCapabilities: z.array(z.string().min(1).max(100)).max(40),
  })
  .strict();

export const routeEngineeringExecution = (raw: unknown): EngineeringExecutionTarget => {
  const facts = EngineeringRoutingFactsSchema.parse(raw);
  const macReason =
    facts.taskType === "MAC_NATIVE"
      ? "MAC_NATIVE"
      : facts.requiresOwnerLocalFiles || facts.repositoryPlacement === "MAC_LOCAL"
        ? "LOCAL_ONLY"
        : facts.requiresDeviceResources
          ? "DEVICE_RESOURCE"
          : null;
  if (macReason)
    return EngineeringExecutionTargetSchema.parse({
      type: "MAC",
      reason: macReason,
      availability:
        facts.macAgent.trusted && facts.macAgent.online
          ? "READY"
          : "WAITING_FOR_DEVICE",
      requiredCapabilities: facts.requiredCapabilities,
      environmentRequirements: ["TRUSTED_MAC_AGENT"],
    });
  const cloudReady =
    facts.cloudWorker.registered &&
    facts.cloudWorker.healthy &&
    facts.requiredCapabilities.every((capability) =>
      facts.cloudWorker.capabilities.includes(capability),
    );
  return EngineeringExecutionTargetSchema.parse({
    type: "CLOUD",
    reason: cloudReady ? "PORTABLE_REPOSITORY" : "CLOUD_UNAVAILABLE",
    availability: cloudReady ? "READY" : "UNAVAILABLE",
    requiredCapabilities: facts.requiredCapabilities,
    environmentRequirements: ["ISOLATED_CLOUD_WORKER", "REGISTERED_GITHUB_REPOSITORY"],
  });
};
