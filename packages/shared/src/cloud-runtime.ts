import { z } from "zod";

export const RuntimeHealthStateSchema = z.enum(["HEALTHY", "DEGRADED", "UNAVAILABLE"]);

export const RuntimeSubsystemHealthSchema = z
  .object({
    state: RuntimeHealthStateSchema,
    reasonCode: z.string().trim().min(1).max(120),
    latencyMs: z.number().nonnegative().nullable(),
  })
  .strict();

export const CanonicalRuntimeHealthSchema = z
  .object({
    apiVersion: z.literal("v1"),
    status: RuntimeHealthStateSchema,
    deploymentMode: z.enum(["private", "cloud"]),
    timestamp: z.iso.datetime(),
    uptimeSeconds: z.number().nonnegative(),
    components: z
      .object({
        api: RuntimeSubsystemHealthSchema,
        postgres: RuntimeSubsystemHealthSchema,
        redis: RuntimeSubsystemHealthSchema,
        aiRouter: RuntimeSubsystemHealthSchema,
        scheduler: RuntimeSubsystemHealthSchema,
      })
      .strict(),
  })
  .strict();

export const DevicePresenceStateSchema = z.enum([
  "OFFLINE",
  "WAKING",
  "ONLINE",
  "REVOKED",
]);

export const CanonicalDeviceSummarySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    type: z.enum(["WEB_BROWSER", "MAC_AGENT", "ANDROID", "SERVER"]),
    trustState: z.enum(["UNREGISTERED", "PENDING", "TRUSTED", "REVOKED", "EXPIRED"]),
    presence: DevicePresenceStateSchema,
    lastSeenAt: z.iso.datetime().nullable(),
    capabilityCount: z.number().int().nonnegative(),
  })
  .strict();

export const CanonicalAlexaSummarySchema = z
  .object({
    apiVersion: z.literal("v1"),
    generatedAt: z.iso.datetime(),
    deploymentMode: z.enum(["private", "cloud"]),
    devices: z.array(CanonicalDeviceSummarySchema).max(100),
    capabilities: z
      .object({
        cloudExecutable: z
          .array(
            z.enum([
              "conversation",
              "memory",
              "agents",
              "objectives",
              "workflows",
              "tasks",
              "economy",
              "experiments",
              "approvals",
            ]),
          )
          .max(20),
        deviceExecutable: z
          .object({
            targetDeviceRequired: z.literal(true),
            macAgent: z.enum(["AVAILABLE", "UNAVAILABLE"]),
          })
          .strict(),
      })
      .strict(),
    invariants: z
      .object({
        oneBackendManyClients: z.literal(true),
        postgresDurableTruth: z.literal(true),
        redisEphemeralOnly: z.literal(true),
        nativeExecutionRemainsOnDevice: z.literal(true),
        blindReplayProhibited: z.literal(true),
      })
      .strict(),
  })
  .strict();

export type CanonicalRuntimeHealth = z.infer<typeof CanonicalRuntimeHealthSchema>;
export type CanonicalAlexaSummary = z.infer<typeof CanonicalAlexaSummarySchema>;
