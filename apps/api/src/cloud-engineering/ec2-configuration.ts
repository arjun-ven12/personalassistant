import { z } from "zod";
import { CloudCompanyConfigurationSchema } from "./provisioning.js";
const account = z.string().regex(/^\d{12}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const Ec2InfrastructureConfigurationSchema = z
  .object({
    runtimeEnabled: z.boolean().default(false),
    previewEnabled: z.boolean().default(true),
    accountId: account,
    region: z.literal("ap-southeast-1"),
    companyId: z.string().uuid(),
    imageId: z.string().regex(/^ami-[a-f0-9]{17}$/),
    imageSnapshotId: z.string().regex(/^snap-[a-f0-9]{17}$/),
    runtimeDigest: hash,
    subnetId: z.string().regex(/^subnet-[a-f0-9]{17}$/),
    vpcId: z.string().regex(/^vpc-[a-f0-9]{17}$/),
    previewSecurityGroupId: z.string().regex(/^sg-[a-f0-9]{17}$/),
    previewCertificateArn: z
      .string()
      .regex(/^arn:aws:acm:ap-southeast-1:\d{12}:certificate\/[a-f0-9-]{36}$/)
      .optional(),
    securityGroupId: z.string().regex(/^sg-[a-f0-9]{17}$/),
    instanceProfileArn: z
      .string()
      .regex(
        /^arn:aws:iam::\d{12}:instance-profile\/AthenaEngineeringWorker[A-Za-z0-9_-]*$/,
      ),
    schedulerRoleArn: z
      .string()
      .regex(/^arn:aws:iam::\d{12}:role\/AthenaEngineeringReaper[A-Za-z0-9_-]*$/),
    schedulerGroup: z.string().regex(/^athena-engineering-[a-z0-9-]{1,50}$/),
    previewListenerArn: z
      .string()
      .regex(
        /^arn:aws:elasticloadbalancing:ap-southeast-1:\d{12}:listener\/app\/[A-Za-z0-9/-]+$/,
      )
      .optional(),
    previewDomain: z
      .string()
      .regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/)
      .optional(),
    evidenceDocumentHash: hash,
    previewDocumentHash: hash.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const previewFields = [
      v.previewListenerArn,
      v.previewCertificateArn,
      v.previewDomain,
      v.previewDocumentHash,
    ];
    if (
      v.previewEnabled
        ? previewFields.some((x) => !x)
        : previewFields.some((x) => x !== undefined)
    )
      ctx.addIssue({
        code: "custom",
        message: "Preview configuration must be complete or explicitly disabled.",
      });
    for (const arn of [
      v.instanceProfileArn,
      v.schedulerRoleArn,
      v.previewListenerArn,
      v.previewCertificateArn,
    ])
      if (arn && !arn.includes(`:${v.accountId}:`))
        ctx.addIssue({ code: "custom", message: "AWS account binding denied." });
  });
export type Ec2InfrastructureConfiguration = z.infer<
  typeof Ec2InfrastructureConfigurationSchema
>;
export const Ec2EngineeringConfigurationSchema = CloudCompanyConfigurationSchema.omit({
  serverPublicKeyX: true,
})
  .extend({
    ...Ec2InfrastructureConfigurationSchema.shape,
    credentialReferenceId: z.string().uuid(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      !Ec2InfrastructureConfigurationSchema.safeParse(
        Object.fromEntries(
          Object.keys(Ec2InfrastructureConfigurationSchema.shape).map((k) => [
            k,
            v[k as keyof typeof v],
          ]),
        ),
      ).success
    )
      ctx.addIssue({ code: "custom", message: "AWS infrastructure binding denied." });
  });
export function parseEc2EngineeringConfiguration(raw: string | undefined) {
  if (!raw) return [];
  return z
    .array(Ec2EngineeringConfigurationSchema)
    .max(20)
    .parse(JSON.parse(raw) as unknown);
}
export type Ec2EngineeringConfiguration = z.infer<
  typeof Ec2EngineeringConfigurationSchema
>;
