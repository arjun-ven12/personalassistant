import { z } from "zod";

export const Ec2WorkloadScopeSchema = z
  .object({
    companyId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    workerId: z.string().uuid(),
    generation: z.number().int().positive(),
  })
  .strict();
export const Ec2LifetimeSchema = z
  .object({
    expiresAt: z.iso.datetime(),
    idleSeconds: z.number().int().min(1).max(300),
    runtimeDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const Ec2RuntimeEvidenceSchema = Ec2WorkloadScopeSchema.extend({
  schemaVersion: z.literal("1"),
  runtimeDigest: z.string().regex(/^[a-f0-9]{64}$/),
  cpuCount: z.number().int().min(1).max(2),
  memoryBytes: z
    .number()
    .positive()
    .max(4096 * 1024 * 1024),
  writableDiskBytes: z
    .number()
    .positive()
    .max(10240 * 1024 * 1024),
  pidLimit: z.number().int().min(1).max(512),
  hardDeadline: z.iso.datetime(),
  idleSeconds: z.number().int().min(1).max(300),
  supervisorUid: z.literal(0),
  executionUid: z.literal(65532),
  offlineValidation: z.literal(true),
  dependencyProxyOnly: z.literal(true),
  previewInternalNetwork: z.literal(true),
  containersReadOnly: z.literal(true),
  noHostSecretsMounted: z.literal(true),
  kernelDeadlineArmed: z.literal(true),
  instanceMetadataBlockedForTasks: z.literal(true),
  controlPlaneBlockedForTasks: z.literal(true),
}).strict();

/** Reviewed image input only; this record grants no SSM execution authority. */
export const Ec2SsmReleaseVersionSchema = z
  .string()
  .regex(/^3\.\d+\.\d+\.\d+$/)
  .refine((version) => {
    const parts = version.split(".").map(Number);
    const minimum = [3, 3, 2746, 0];
    for (let i = 0; i < 4; i++) {
      if (parts[i]! > minimum[i]!) return true;
      if (parts[i]! < minimum[i]!) return false;
    }
    return true;
  }, "SSM Agent must support ENV_VAR interpolation");

export const Ec2SsmInstallationSchema = z.discriminatedUnion("strategy", [
  z
    .object({
      strategy: z.literal("snap"),
      runtimeVersion: Ec2SsmReleaseVersionSchema,
      revision: z.string().regex(/^[1-9][0-9]{0,9}$/),
      artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
      refreshHeld: z.literal(true),
    })
    .strict(),
  z
    .object({
      strategy: z.literal("deb"),
      runtimeVersion: Ec2SsmReleaseVersionSchema,
      packageVersion: z.string().regex(/^3\.\d+\.\d+\.\d+-[1-9][0-9]*$/),
      artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict()
    .refine(
      (value) => value.packageVersion.split("-")[0] === value.runtimeVersion,
      "SSM Debian package must match the exact upstream release",
    ),
]);
export type Ec2SsmInstallation = z.infer<typeof Ec2SsmInstallationSchema>;
