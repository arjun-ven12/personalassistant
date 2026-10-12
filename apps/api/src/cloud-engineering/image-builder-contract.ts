import { z } from "zod";
import { Ec2SsmInstallationSchema } from "@alexa-control/shared";

const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const Artifact = z
  .object({
    file: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
    sha256: Sha256,
  })
  .strict();

/** Infrastructure-only reviewed inputs. Never accepted by a workload endpoint. */
export const ImageBuilderToolLockSchema = z
  .object({
    schemaVersion: z.literal("2"),
    baseAmiId: z.string().regex(/^ami-[a-f0-9]{17}$/),
    kernelAbi: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+-[0-9]+-aws$/),
    packageInventorySha256: Sha256,
    baseInventory: z
      .array(
        z
          .object({
            name: z.string().regex(/^[a-z0-9][a-z0-9+.-]{0,79}$/),
            version: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9.+:~_-]{0,127}$/),
            architecture: z.enum(["amd64", "all"]),
            sourceRepository: z.string().regex(/^base-ami:ami-[a-f0-9]{17}$/),
          })
          .strict(),
      )
      .min(1)
      .max(2000),
    nodeVersion: z.string().regex(/^24\.\d+\.\d+$/),
    ssmInstallation: Ec2SsmInstallationSchema,
    dockerBase: z.string().regex(/^node@sha256:[a-f0-9]{64}$/),
    artifacts: z.object({ node: Artifact, ssm: Artifact, pnpm: Artifact }).strict(),
    packages: z
      .array(
        z
          .object({
            name: z
              .string()
              .regex(/^[a-z0-9][a-z0-9+.-]{0,79}$/)
              .refine((name) => !name.startsWith("openssh")),
            version: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9.+:~_-]{0,127}$/),
            architecture: z.enum(["amd64", "all"]),
            sourceRepository: z
              .string()
              .url()
              .refine((value) => {
                const url = new URL(value);
                return (
                  ["http:", "https:"].includes(url.protocol) &&
                  !url.username &&
                  !url.password &&
                  /^(?:[a-z0-9.-]+\.ec2\.archive\.ubuntu\.com|archive\.ubuntu\.com|security\.ubuntu\.com)$/.test(
                    url.hostname,
                  ) &&
                  url.pathname.startsWith("/ubuntu/")
                );
              }),
            file: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._+~-]{0,127}\.deb$/),
            sha256: Sha256,
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict()
  .superRefine((lock, ctx) => {
    if (lock.artifacts.ssm.sha256 !== lock.ssmInstallation.artifactSha256)
      ctx.addIssue({
        code: "custom",
        message: "SSM artifact and installation pins differ",
      });
    const names = lock.packages.map((p) => p.name);
    const inherited = lock.baseInventory.map((p) => p.name);
    if (
      new Set(inherited).size !== inherited.length ||
      lock.baseInventory.some(
        (p) => p.sourceRepository !== `base-ami:${lock.baseAmiId}`,
      )
    )
      ctx.addIssue({ code: "custom", message: "Base inventory identity differs" });
    const finalNames = new Set([...inherited, ...names]);
    if (
      !finalNames.has(`linux-image-${lock.kernelAbi}`) ||
      !finalNames.has(`linux-modules-${lock.kernelAbi}`)
    )
      ctx.addIssue({
        code: "custom",
        message: "Concrete kernel image/modules ABI required",
      });
    const files = [
      "lock.json",
      ...Object.values(lock.artifacts).map((a) => a.file),
      ...lock.packages.map((p) => p.file),
    ];
    if (new Set(names).size !== names.length || new Set(files).size !== files.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate package or artifact identity",
      });
    for (const required of [
      "git",
      "python3",
      "docker.io",
      "containerd",
      "runc",
      "iptables",
      "ca-certificates",
      "xz-utils",
      "linux-aws",
      "systemd",
      "cloud-init",
      "iproute2",
      "util-linux",
      "snapd",
      "python3-minimal",
      "python3.12",
      "python3.12-minimal",
      "libpython3.12-stdlib",
    ])
      if (!finalNames.has(required))
        ctx.addIssue({
          code: "custom",
          message: `Missing required pinned package: ${required}`,
        });
  });

export const ImageBuilderBuildRecordSchema = z
  .object({
    companyId: z.string().uuid(),
    schemaVersion: z.literal("1"),
    baseAmiId: z.string().regex(/^ami-[a-f0-9]{17}$/),
    buildInstanceId: z.string().regex(/^i-[a-f0-9]{17}$/),
    buildRevision: z.string().regex(/^[a-z0-9-]{1,40}$/),
    payloadSha256: Sha256,
    toolingSha256: Sha256,
    lockSha256: Sha256,
    sealedRuntimeSha256: Sha256,
    releaseStatus: z.literal("PENDING_LIVE_RELEASE_GATE"),
    runtimePermissionsActivated: z.literal(false),
    previewEnabled: z.literal(false),
  })
  .strict();
