import { z } from "zod";
import { SelfImprovementTelemetrySchema } from "./self-improvement-telemetry.js";
import { Ed25519PublicKeySchema } from "./devices.js";
const uuid = z.string().uuid();
export const CloudWorkspaceStateSchema = z.enum([
  "REQUESTED",
  "PROVISIONING",
  "BOOTING",
  "AUTHENTICATING",
  "READY",
  "BUSY",
  "SUSPENDING",
  "SUSPENDED",
  "FAILED",
  "DESTROYED",
]);
export const CloudResourceLimitsSchema = z
  .object({
    cpu: z.literal(2),
    memoryMiB: z.literal(4096),
    diskMiB: z.literal(10240),
    processes: z.literal(512),
    runtimeSeconds: z.literal(3600),
    idleSeconds: z.literal(300),
  })
  .strict();
export const CLOUD_ENGINEERING_LIMITS = CloudResourceLimitsSchema.parse({
  cpu: 2,
  memoryMiB: 4096,
  diskMiB: 10240,
  processes: 512,
  runtimeSeconds: 3600,
  idleSeconds: 300,
});
export const CloudMilestoneSchema = z.enum([
  "REQUEST_ACCEPTED",
  "OBJECTIVE_CREATED",
  "WORKER_REQUESTED",
  "PROVIDER_PROVISIONED",
  "WORKER_AUTHENTICATED",
  "REPO_READY",
  "DEPENDENCIES_READY",
  "TASK_READY",
  "FIRST_MODEL_CALL",
  "FIRST_PATCH",
  "FIRST_VALIDATION",
  "FIRST_PREVIEW",
  "FINAL_VALIDATION",
  "REVIEW_COMPLETE",
  "CANDIDATE_READY",
]);
export const CloudUsageSchema = z
  .object({
    runtimeSeconds: z.number().nonnegative().nullable(),
    cpuSeconds: z.number().nonnegative().nullable(),
    peakMemoryBytes: z.number().nonnegative().nullable(),
    storageBytes: z.number().nonnegative().nullable(),
    networkBytes: z.number().nonnegative().nullable(),
    costUsd: z.number().nonnegative().nullable(),
    costStatus: z.enum(["ACTUAL", "UNKNOWN"]),
    observedAt: z.iso.datetime(),
  })
  .strict()
  .refine((v) =>
    v.costStatus === "UNKNOWN" ? v.costUsd === null : v.costUsd !== null,
  );
export const CloudWorkspaceRecordSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: uuid,
    ownerId: uuid,
    companyId: uuid,
    registrationId: uuid,
    repositoryId: uuid,
    workspaceLocatorId: z.string().regex(/^cloud\.[a-f0-9-]{36}$/),
    workerId: uuid,
    generation: z.number().int().positive(),
    state: CloudWorkspaceStateSchema,
    provider: z.string().min(1).max(50),
    providerResourceId: z.string().max(100).nullable(),
    requestDigest: z.string().regex(/^[a-f0-9]{64}$/),
    version: z.number().int().nonnegative(),
    limits: CloudResourceLimitsSchema,
    credentialExpiresAt: z.iso.datetime(),
    bootstrapHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    authenticatedAt: z.iso.datetime().nullable(),
    lastHeartbeatAt: z.iso.datetime().nullable(),
    expiresAt: z.iso.datetime(),
    failure: z
      .enum([
        "PROVISION_UNCERTAIN",
        "PROVIDER_UNAVAILABLE",
        "AUTHENTICATION_TIMEOUT",
        "WORKER_LOST",
        "REPO_FAILED",
        "DEPENDENCY_FAILED",
        "PREVIEW_FAILED",
        "CLEANUP_FAILED",
      ])
      .nullable(),
    baseCommit: z.string().regex(/^[a-f0-9]{40}$/),
    milestones: z.partialRecord(CloudMilestoneSchema, z.iso.datetime()),
    usage: CloudUsageSchema.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const CloudWorkloadHandshakeSchema = z
  .object({
    workspaceId: uuid,
    companyId: uuid,
    repositoryId: uuid,
    workerId: uuid,
    generation: z.number().int().positive(),
    backendOrigin: z.url(),
    capability: z.literal("engineering.repository_capability"),
    publicKey: Ed25519PublicKeySchema,
    issuedAt: z.iso.datetime(),
    nonce: uuid,
    signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
  })
  .strict();
export const CloudPrepareRequestSchema = z.object({ registrationId: uuid }).strict();
export type CloudWorkspaceRecord = z.infer<typeof CloudWorkspaceRecordSchema>;
export type CloudResourceLimits = z.infer<typeof CloudResourceLimitsSchema>;
export type CloudUsage = z.infer<typeof CloudUsageSchema>;
export type CloudMilestone = z.infer<typeof CloudMilestoneSchema>;
export type CloudWorkloadHandshake = z.infer<typeof CloudWorkloadHandshakeSchema>;
/** Exact byte order is shared by workload proof creation and server verification. */
export const canonicalizeCloudWorkloadProof = (
  raw: Omit<CloudWorkloadHandshake, "signature">,
) =>
  JSON.stringify({
    workspaceId: raw.workspaceId,
    companyId: raw.companyId,
    repositoryId: raw.repositoryId,
    workerId: raw.workerId,
    generation: raw.generation,
    backendOrigin: raw.backendOrigin,
    capability: raw.capability,
    publicKey: raw.publicKey,
    issuedAt: raw.issuedAt,
    nonce: raw.nonce,
  });

export const CloudBackendOriginSchema = z.url().refine((v) => {
  const u = new URL(v);
  return (
    !u.username &&
    !u.password &&
    !u.search &&
    !u.hash &&
    u.pathname === "/" &&
    (u.protocol === "https:" ||
      (u.protocol === "http:" &&
        /^[a-z0-9-]+\.railway\.internal$/.test(u.hostname) &&
        u.port === "3001"))
  );
});

export const CloudEngineeringTelemetrySchema = SelfImprovementTelemetrySchema.extend({
  cloud: z
    .object({
      workspaceId: uuid,
      provider: z.string().max(50),
      state: CloudWorkspaceStateSchema,
      milestones: z.partialRecord(CloudMilestoneSchema, z.iso.datetime().nullable()),
      usage: CloudUsageSchema.nullable(),
      limits: CloudResourceLimitsSchema,
    })
    .strict(),
}).strict();
