import { z } from "zod";

const boundedText = z.string().trim().min(1).max(2_000);
const source = z
  .object({
    taskId: z.string().uuid(),
    agentId: z.string().min(1).max(120),
    modelRequestId: z.string().uuid(),
    providerId: z.string().min(1).max(80),
    evidenceRefs: z.array(z.string().max(500)).max(20),
    costCredits: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
  })
  .strict();

export const LaunchResearchSchema = z
  .object({
    summary: boundedText,
    sources: z
      .array(
        z
          .object({
            url: z.url(),
            retrievedAt: z.iso.datetime(),
            providerId: z.string().min(1).max(80),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    provenance: source,
  })
  .strict();
export const LaunchBrandSchema = z
  .object({
    positioning: boundedText,
    targetAudience: boundedText,
    valueProposition: boundedText,
    brandVoice: boundedText,
    messagingPillars: z.array(boundedText).min(1).max(8),
    visualDirection: boundedText,
    typography: boundedText,
    colors: z
      .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
      .min(1)
      .max(8),
    assetBrief: boundedText,
    creativeProviderStatus: z.literal("BLOCKED_PROVIDER"),
    provenance: source,
  })
  .strict();
export const LaunchMarketingSchema = z
  .object({
    strategy: boundedText,
    channelPlan: z.array(boundedText).min(1).max(12),
    copyVariants: z.array(boundedText).min(1).max(12),
    landingPagePlan: boundedText,
    creativeRequests: z.array(boundedText).max(12),
    analyticsInstrumentation: boundedText,
    provenance: source,
  })
  .strict();
export const LaunchSocialPostSchema = z
  .object({
    id: z.string().uuid(),
    channel: z.enum(["LINKEDIN", "INSTAGRAM", "FACEBOOK", "X", "TIKTOK"]),
    accountId: z.string().uuid().nullable(),
    credentialReferenceId: z.string().uuid().nullable(),
    concept: boundedText,
    caption: boundedText,
    mediaAssetRef: z.string().max(500).nullable(),
    proposedAt: z.iso.datetime().nullable(),
    status: z.enum([
      "DRAFT",
      "READY_FOR_REVIEW",
      "APPROVED",
      "SCHEDULED",
      "PUBLISHING",
      "PUBLISHED",
      "FAILED",
      "REQUIRES_OWNER_ACTION",
    ]),
    idempotencyKey: z.string().min(8).max(200),
    providerReceiptId: z.string().max(255).nullable(),
    publishStatus: z.literal("BLOCKED_PROVIDER"),
  })
  .strict();
export const LaunchSocialSchema = z
  .object({ posts: z.array(LaunchSocialPostSchema).min(1).max(20), provenance: source })
  .strict();

export const LaunchPackageSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    objectiveId: z.string().uuid(),
    product: boundedText,
    channels: z
      .array(z.enum(["LINKEDIN", "INSTAGRAM", "FACEBOOK", "X", "TIKTOK"]))
      .min(1)
      .max(5),
    version: z.number().int().positive(),
    status: z.enum([
      "DRAFT",
      "IN_PROGRESS",
      "READY_FOR_REVIEW",
      "APPROVED",
      "BLOCKED_PROVIDER",
      "REQUIRES_OWNER_ACTION",
    ]),
    taskIds: z
      .object({
        research: z.string().uuid().nullable(),
        branding: z.string().uuid().nullable(),
        marketing: z.string().uuid().nullable(),
        social: z.string().uuid().nullable(),
      })
      .strict(),
    research: LaunchResearchSchema.nullable(),
    branding: LaunchBrandSchema.nullable(),
    marketing: LaunchMarketingSchema.nullable(),
    social: LaunchSocialSchema.nullable(),
    approvalDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    approvedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const CreateLaunchPackageRequestSchema = z
  .object({
    objectiveId: z.string().uuid(),
    product: boundedText,
    channels: z
      .array(z.enum(["LINKEDIN", "INSTAGRAM", "FACEBOOK", "X", "TIKTOK"]))
      .min(1)
      .max(5),
  })
  .strict();
export const ApproveLaunchPackageRequestSchema = z
  .object({ expectedDigest: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const ReviseLaunchPostRequestSchema = z
  .object({
    postId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    concept: boundedText.optional(),
    caption: boundedText.optional(),
    mediaAssetRef: z.string().max(500).nullable().optional(),
    proposedAt: z.iso.datetime().nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.concept !== undefined ||
      value.caption !== undefined ||
      value.mediaAssetRef !== undefined ||
      value.proposedAt !== undefined,
  );
export const CancelLaunchPostRequestSchema = z
  .object({ postId: z.string().uuid(), expectedVersion: z.number().int().positive() })
  .strict();
export const RetryLaunchStageRequestSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
export type LaunchPackage = z.infer<typeof LaunchPackageSchema>;
