import { z } from "zod";
import { EngineeringBenchmarkRunSchema } from "./engineering-benchmark.js";

const Id = z.string().uuid();
const BoundedText = z.string().trim().min(1).max(2_000);

export const MarketingObjectiveTypeSchema = z.enum([
  "BRAND_PACKAGE", "SOCIAL_CAMPAIGN", "AD_PACKAGE", "LANDING_PAGE", "PRODUCT_LAUNCH", "ANALYTICS",
]);
export const MarketingRoleSchema = z.enum([
  "MARKETING_MANAGER", "BRAND_STRATEGIST", "MARKET_RESEARCH", "COPYWRITER",
  "SOCIAL_MEDIA", "ADVERTISING", "CREATIVE_DIRECTOR", "GROWTH_ANALYTICS",
]);
export const MarketingDeliverableTypeSchema = z.enum([
  "RESEARCH", "BRAND_STRATEGY", "POSITIONING", "MESSAGING", "LANDING_PAGE",
  "SOCIAL_POST", "AD_CONCEPT", "AD_COPY", "IMAGE_ASSET", "VIDEO_ASSET",
  "CAMPAIGN_CALENDAR", "ANALYTICS_REPORT", "LAUNCH_PACKAGE",
]);
export const MarketingDeliverableSchema = z.object({
  id: Id,
  type: MarketingDeliverableTypeSchema,
  role: MarketingRoleSchema,
  dependencies: z.array(Id).max(12),
  status: z.enum(["PLANNED", "READY", "RUNNING", "DRAFT_READY", "APPROVAL_READY", "TOOL_UNAVAILABLE", "BLOCKED", "COMPLETED", "CANCELLED"]),
  artifactRef: z.string().max(500).nullable(),
  toolId: z.string().max(120).nullable(),
  workforceTaskId: Id.nullable(),
  toolInvocationIds: z.array(Id).max(20).default([]),
  engineeringObjectiveId: Id.nullable(),
  approvalState: z.enum(["NOT_REQUIRED", "REQUIRED", "APPROVED", "REJECTED"]),
  contentDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  creativeExecution: z.object({
    invocationId: Id,
    toolId: z.string().min(1).max(120),
    brief: z.string().min(1).max(2_000),
    mediaType: z.enum(["IMAGE", "VIDEO"]),
    idempotencyKey: z.string().min(1).max(160),
    approvalId: Id.nullable(),
    state: z.enum(["CLAIMED", "OWNER_REVIEW_REQUIRED", "RECONCILED"]),
    evidenceCode: z.string().max(120).nullable(),
  }).strict().nullable().default(null),
  version: z.number().int().positive(),
  weight: z.number().int().min(1).max(20),
  updatedAt: z.iso.datetime(),
}).strict();

export const MarketingCampaignSchema = z.object({
  id: Id,
  ownerId: Id,
  companyId: Id,
  objectiveId: Id,
  idempotencyKey: z.string().min(8).max(160),
  title: z.string().trim().min(1).max(160),
  productOrCompany: z.string().trim().min(1).max(160),
  objectiveType: MarketingObjectiveTypeSchema,
  targetAudience: z.string().max(1_000).nullable(),
  channels: z.array(z.enum(["WEB", "LINKEDIN", "INSTAGRAM", "X", "EMAIL", "PAID_ADS"])).max(6),
  constraints: z.array(z.string().max(500)).max(20),
  status: z.enum(["DRAFT", "ACTIVE", "BLOCKED", "PACKAGE_READY", "CANCELLED"]),
  complexity: z.enum(["TRIVIAL", "SMALL", "MEDIUM", "LARGE", "HIGH_RISK"]),
  version: z.number().int().positive(),
  deliverables: z.array(MarketingDeliverableSchema).min(1).max(20),
  brandStrategyArtifactRef: z.string().max(500).nullable(),
  automationContext: z.object({ sessionId: Id, startedAt: z.iso.datetime() }).strict().nullable().default(null),
  engineeringBenchmark: EngineeringBenchmarkRunSchema.nullable().default(null),
  engineeringRepositoryId: Id.nullable(),
  modelBudgetCredits: z.number().int().nonnegative().max(1_000_000),
  toolBudgetMinor: z.number().int().nonnegative().max(100_000_000),
  adBudgetMinor: z.number().int().nonnegative().max(100_000_000),
  knownToolCostMinor: z.number().int().nonnegative(),
  unknownToolCostCount: z.number().int().nonnegative(),
  firstDraftAt: z.iso.datetime().nullable(),
  firstAssetAt: z.iso.datetime().nullable(),
  firstEngineeringPreviewAt: z.iso.datetime().nullable(),
  packageReadyAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();

export const CreateMarketingCampaignRequestSchema = z.object({
  idempotencyKey: z.string().min(8).max(160),
  title: z.string().trim().min(1).max(160),
  productOrCompany: z.string().trim().min(1).max(160),
  objectiveType: MarketingObjectiveTypeSchema,
  targetAudience: z.string().trim().max(1_000).nullable().default(null),
  channels: z.array(z.enum(["WEB", "LINKEDIN", "INSTAGRAM", "X", "EMAIL", "PAID_ADS"])).max(6).default([]),
  constraints: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  engineeringRepositoryId: Id.nullable().default(null),
  modelBudgetCredits: z.number().int().min(1).max(1_000_000).default(100),
  toolBudgetMinor: z.number().int().nonnegative().max(100_000_000).default(0),
  adBudgetMinor: z.number().int().nonnegative().max(100_000_000).default(0),
}).strict();

export const MarketingBrandStrategySchema = z.object({
  positioning: BoundedText,
  targetAudience: BoundedText,
  brandPromise: BoundedText,
  messagingPillars: z.array(BoundedText).min(1).max(6),
  valuePropositions: z.array(BoundedText).min(1).max(6),
  toneOfVoice: BoundedText,
  visualDirection: BoundedText,
  campaignThemes: z.array(BoundedText).max(6),
  contentThemes: z.array(BoundedText).max(6),
  competitorObservations: z.array(z.object({ source: z.url(), observation: BoundedText, confidence: z.number().min(0).max(1) }).strict()).max(12),
  prohibitedClaims: z.array(BoundedText).max(20),
}).strict();

const Evidence = z.object({ source: z.url(), observation: BoundedText, relevance: z.string().max(500), confidence: z.number().min(0).max(1), observedAt: z.iso.datetime() }).strict();
export const MarketingResearchSchema = z.object({ observations: z.array(Evidence).max(20), summary: BoundedText }).strict();
export const MarketingCopySchema = z.object({ title: z.string().max(160), variants: z.array(z.object({ channel: z.enum(["WEB", "LINKEDIN", "INSTAGRAM", "X", "EMAIL", "PAID_ADS"]), headline: z.string().max(240), body: z.string().max(2_000), cta: z.string().max(160).nullable() }).strict()).min(1).max(12) }).strict();
export const MarketingAdConceptSchema = z.object({ concepts: z.array(z.object({ angle: z.string().max(500), copy: z.string().max(1_000), audienceHypothesis: z.string().max(500), offer: z.string().max(500), targetMetric: z.string().max(160), stopCondition: z.string().max(500) }).strict()).min(1).max(5) }).strict();
export const MarketingAssetBriefSchema = z.object({ brief: BoundedText, toolInvocationId: Id.nullable(), externalAssetRef: z.string().max(500).nullable(), providerId: z.string().max(120).nullable() }).strict();
export const MarketingAnalyticsSchema = z.object({ observations: z.array(Evidence).max(20), metrics: z.array(z.object({ name: z.string().max(120), value: z.number().finite(), unit: z.string().max(60), source: z.url().nullable() }).strict()).max(20), recommendations: z.array(BoundedText).max(10), causalityClaimed: z.literal(false) }).strict();
export const MarketingPackageSchema = z.object({ summary: BoundedText, artifactIds: z.array(Id).min(1).max(20), warnings: z.array(z.string().max(500)).max(20), publicActionsPendingApproval: z.literal(true) }).strict();
export const MarketingAnalyticsMetricRequestSchema = z.object({ metricId: z.string().min(1).max(120), windowStart: z.iso.datetime(), windowEnd: z.iso.datetime() }).strict();

export const MarketingArtifactSchema = z.object({
  id: Id,
  ownerId: Id,
  companyId: Id,
  campaignId: Id,
  deliverableId: Id,
  type: MarketingDeliverableTypeSchema,
  version: z.number().int().positive(),
  status: z.enum(["DRAFT", "IN_REVIEW", "REJECTED", "REVIEWED", "APPROVED", "PUBLISHED", "SUPERSEDED"]),
  approvalRequestId: Id.nullable().default(null),
  contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  content: z.json(),
  externalRef: z.string().max(500).nullable(),
  createdAt: z.iso.datetime(),
}).strict();

export type MarketingArtifact = z.infer<typeof MarketingArtifactSchema>;

export type MarketingCampaign = z.infer<typeof MarketingCampaignSchema>;
export type MarketingDeliverable = z.infer<typeof MarketingDeliverableSchema>;
export type CreateMarketingCampaignRequest = z.input<typeof CreateMarketingCampaignRequestSchema>;
export type MarketingBrandStrategy = z.infer<typeof MarketingBrandStrategySchema>;
