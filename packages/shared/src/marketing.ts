import { z } from "zod";
import { EngineeringBenchmarkRunSchema } from "./engineering-benchmark.js";

const Id = z.string().uuid();
const BoundedText = z.string().trim().min(1).max(2_000);

export const MarketingObjectiveTypeSchema = z.enum([
  "BRAND_PACKAGE", "SOCIAL_CAMPAIGN", "AD_PACKAGE", "LANDING_PAGE", "PRODUCT_LAUNCH", "ANALYTICS", "MARKET_RESEARCH", "BUSINESS_IMPROVEMENT", "CAMPAIGN_ITERATION", "LAUNCH_CAMPAIGN",
]);
export const MarketingRoleSchema = z.enum([
  "MARKETING_MANAGER", "BRAND_STRATEGIST", "MARKET_RESEARCH", "COPYWRITER",
  "SOCIAL_MEDIA", "ADVERTISING", "CREATIVE_DIRECTOR", "GROWTH_ANALYTICS", "STRATEGY",
]);
export const MarketingDeliverableTypeSchema = z.enum([
  "RESEARCH", "GROWTH_STRATEGY", "BRAND_STRATEGY", "POSITIONING", "MESSAGING", "LANDING_PAGE",
  "SOCIAL_POST", "AD_CONCEPT", "AD_COPY", "IMAGE_ASSET", "VIDEO_ASSET",
  "CAMPAIGN_CALENDAR", "MEASUREMENT_PLAN", "LANDING_PAGE_BRIEF", "ANALYTICS_REPORT", "LAUNCH_PACKAGE",
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
  blockerCode: z.string().max(120).nullable().optional(),
  modelExecutionId: Id.nullable().optional(),
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
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "BLOCKED", "PACKAGE_READY", "CANCELLED"]),
  complexity: z.enum(["TRIVIAL", "SMALL", "MEDIUM", "LARGE", "HIGH_RISK"]),
  version: z.number().int().positive(),
  deliverables: z.array(MarketingDeliverableSchema).min(1).max(20),
  brandStrategyArtifactRef: z.string().max(500).nullable(),
  automationContext: z.object({ sessionId: Id, startedAt: z.iso.datetime() }).strict().nullable().default(null),
  engineeringBenchmark: EngineeringBenchmarkRunSchema.nullable().default(null),
  sourceCampaignId: Id.nullable().optional(),
  initiativeObjectives: z.array(z.object({ artifactId: Id, index: z.number().int().min(0).max(5), objectiveId: Id }).strict()).max(6).optional(),
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
  sourceCampaignId: Id.nullable().default(null),
  engineeringRepositoryId: Id.nullable().default(null),
  modelBudgetCredits: z.number().int().min(1).max(1_000_000).default(100),
  toolBudgetMinor: z.number().int().nonnegative().max(100_000_000).default(0),
  adBudgetMinor: z.number().int().nonnegative().max(100_000_000).default(0),
}).strict();

export const MarketingBrandDirectionSchema = z.object({
  idealCustomerProfile: z.string().min(1).max(800),
  personality: z.string().min(1).max(500),
  nameOptions: z.array(z.string().min(1).max(100)).min(2).max(5),
  taglineOptions: z.array(z.string().min(1).max(160)).min(2).max(6),
  palette: z.array(z.object({ hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/), role: z.string().min(1).max(120), rationale: z.string().min(1).max(240) }).strict()).min(2).max(5),
  typography: z.object({ headings: z.string().min(1).max(120), body: z.string().min(1).max(120), rationale: z.string().min(1).max(400) }).strict(),
  creativeRationale: z.string().min(1).max(800),
  trademarkAndLicensingReviewRequired: z.literal(true),
}).strict();
export const MarketingBrandStrategySchema = z.object({
  direction: MarketingBrandDirectionSchema.optional(),
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

export const GeneratedMarketingBrandSchema = MarketingBrandStrategySchema.extend({ direction: MarketingBrandDirectionSchema });

const Evidence = z.object({ source: z.url(), observation: BoundedText, relevance: z.string().max(500), confidence: z.number().min(0).max(1), observedAt: z.iso.datetime() }).strict();
export const MarketingResearchSchema = z.object({ observations: z.array(Evidence).max(20), summary: BoundedText }).strict();
export const MarketingResearchToolResultSchema = z.object({
  content: MarketingResearchSchema,
  sourceUrls: z.array(z.string().max(500)).min(1).max(60),
  fetchedAt: z.iso.datetime(),
  modelRequestId: Id,
  providerId: z.string().min(1).max(120),
  modelId: z.string().min(1).max(160),
}).strict();
export const MarketingArtifactProvenanceSchema = z.object({
  kind: z.enum(["OWNER_DRAFT", "AI_ROUTER", "WORKFORCE", "TOOL_GATEWAY"]),
  modelRequestId: Id.nullable(), providerId: z.string().max(120).nullable(), modelId: z.string().max(160).nullable(),
  agentId: z.string().max(160).nullable(), taskId: Id.nullable(), toolInvocationId: Id.nullable(),
  sources: z.array(z.object({ url: z.string().max(500), retrievedAt: z.iso.datetime() }).strict()).max(60),
}).strict();
export const MarketingCopySchema = z.object({ title: z.string().max(160), variants: z.array(z.object({ channel: z.enum(["WEB", "LINKEDIN", "INSTAGRAM", "X", "EMAIL", "PAID_ADS"]), headline: z.string().max(240), body: z.string().max(2_000), cta: z.string().max(160).nullable() }).strict()).min(1).max(12) }).strict();
export const MarketingMeasurementPlanSchema = z.object({
  objective: BoundedText,
  baselineStatus: z.literal("NOT_MEASURED"),
  metrics: z.array(z.object({ name: z.string().min(1).max(120), targetHypothesis: z.string().min(1).max(500),
    sourceSetup: z.string().min(1).max(500), samplingPlan: z.string().min(1).max(500),
    stopCondition: z.string().min(1).max(500), reportingCadenceDays: z.number().int().min(1).max(90),
  }).strict()).min(1).max(8),
  caveats: z.array(z.string().max(500)).max(8),
  ownerReviewRequired: z.literal(true),
}).strict();
export const MarketingGrowthStrategySchema = z.object({
  diagnosis: z.array(BoundedText).min(1).max(8),
  uncertainties: z.array(BoundedText).max(8),
  initiatives: z.array(z.object({
    title: z.string().min(1).max(160), outcome: z.string().min(1).max(1000),
    rationale: BoundedText, priority: z.enum(["HIGH", "NORMAL", "LOW"]),
    expectedImpactHypothesis: z.string().min(1).max(500),
    estimatedCostUsd: z.string().regex(/^\d+(\.\d{1,8})?$/).nullable(),
    confidence: z.number().min(0).max(1),
    evidenceRefs: z.array(z.string().min(1).max(500)).min(1).max(8),
    requiresOwnerApproval: z.literal(true),
  }).strict()).min(1).max(6),
  executionEnabled: z.literal(false),
}).strict();
// Historical/owner drafts remain readable. Newly generated initiatives must meet
// the existing Objective Engine's minimum specificity before owner review.
export const GeneratedMarketingGrowthStrategySchema = MarketingGrowthStrategySchema.extend({
  initiatives: z.array(MarketingGrowthStrategySchema.shape.initiatives.element.extend({
    outcome: z.string().trim().min(20).max(1000),
  })).min(1).max(6),
}).strict();
export const MarketingCalendarSchema = z.object({
  title: z.string().min(1).max(160),
  timezone: z.string().min(1).max(80),
  entries: z.array(z.object({
    dayOffset: z.number().int().min(0).max(90),
    channel: z.enum(["WEB", "LINKEDIN", "INSTAGRAM", "X", "EMAIL", "PAID_ADS"]),
    purpose: z.string().min(1).max(500),
    headline: z.string().min(1).max(240),
    body: z.string().min(1).max(2000),
    cta: z.string().max(160).nullable(),
    requiresApproval: z.literal(true),
  }).strict()).min(1).max(30),
  publishingEnabled: z.literal(false),
}).strict();
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
  provenance: MarketingArtifactProvenanceSchema.nullable().optional(),
  createdAt: z.iso.datetime(),
}).strict();

export type MarketingArtifact = z.infer<typeof MarketingArtifactSchema>;

export type MarketingCampaign = z.infer<typeof MarketingCampaignSchema>;
export type MarketingDeliverable = z.infer<typeof MarketingDeliverableSchema>;
export type CreateMarketingCampaignRequest = z.input<typeof CreateMarketingCampaignRequestSchema>;
export type MarketingBrandStrategy = z.infer<typeof MarketingBrandStrategySchema>;
export type MarketingResearch = z.infer<typeof MarketingResearchSchema>;

/** Read-only projection of canonical model/tool/Engineering accounting. Unknown costs remain explicit. */
export const MarketingTelemetrySchema = z.object({
  campaignId: Id, objectiveId: Id,
  knownUsd: z.string().regex(/^\d+\.\d{8}$/),
  modelKnownUsd: z.string().regex(/^\d+\.\d{8}$/),
  engineeringKnownUsd: z.string().regex(/^\d+\.\d{8}$/),
  toolCostMinorByCurrency: z.record(z.string().regex(/^[A-Z]{3}$/), z.number().int().nonnegative()),
  modelCalls: z.number().int().nonnegative(), inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(),
  linkedCreativeInvocations: z.number().int().nonnegative(), knownToolCalls: z.number().int().nonnegative(),
  unknownToolCostCount: z.number().int().nonnegative(), unknownModelCostCount: z.number().int().nonnegative(), unknownEngineeringCostCount: z.number().int().nonnegative(),
  completeCostAttribution: z.boolean(), analyticsReceiptsAttributable: z.boolean(),
  engineeringChildCreatedAt: z.iso.datetime().nullable(), engineeringBenchmark: EngineeringBenchmarkRunSchema.nullable(),
}).strict();
