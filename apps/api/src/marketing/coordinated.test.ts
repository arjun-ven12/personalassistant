import { describe, expect, it, vi } from "vitest";

import type { AgentEconomyService } from "../agent-economy/service.js";
import type { AgentWorkforceService } from "../agent-workforce/service.js";
import type { AgentOsService } from "../agents/os-service.js";
import { InMemoryAgentStore } from "../agents/store.js";
import type { AIRouterService } from "../ai/router/service.js";
import type { CapabilityStudioService } from "../capability-studio/service.js";
import { companyScope } from "../companies/scope.js";
import type { ExternalHarvestService } from "../external-harvest/service.js";
import { ApprovalService, type GovernanceAuditWriter } from "../governance/approval-service.js";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { PolicyEngine } from "../governance/policy-engine.js";
import { RegistryService } from "../governance/registry-service.js";
import { RiskEngine } from "../governance/risk-engine.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { WorkforceRuntimeService } from "../workforce-runtime/service.js";
import { InMemoryWorkforceRuntimeStore } from "../workforce-runtime/store.js";
import { UniversalToolGateway, type ToolAdapter } from "../universal-tools/gateway.js";
import { InMemoryUniversalToolStore } from "../universal-tools/store.js";
import { MarketingCampaignCoordinator } from "./coordinator.js";
import { MarketingArtifactReviewService } from "./review.js";
import { MarketingService } from "./service.js";
import { InMemoryMarketingStore } from "./store.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000002";
const organizationId = "30000000-0000-4000-8000-000000000003";
const departmentId = "40000000-0000-4000-8000-000000000004";
const sessionId = "50000000-0000-4000-8000-000000000005";
const at = "2026-10-03T00:00:00.000Z";
const context = { ownerId, companyId, requestId: "coordinated-marketing", ipAddress: "100.64.0.1",
  sessionId, networkState: "PRIVATE_NETWORK" as const, emergencyStopActive: false };
const reviewContext = { ...context, deviceTrusted: false, signedEnvelopeVerified: false,
  networkVerification: "PRIVATE_NETWORK" as const };
const brand = { positioning: "A governed assistant.", targetAudience: "Teams", brandPromise: "Bounded operation",
  messagingPillars: ["Reviewability"], valuePropositions: ["Clear controls"], toneOfVoice: "Plain",
  visualDirection: "Calm", campaignThemes: [], contentThemes: [], competitorObservations: [], prohibitedClaims: [] };
const copy = { title: "Launch message", variants: [{ channel: "WEB", headline: "Controlled assistance",
  body: "A bounded draft for review.", cta: "Request access" }] };
const concepts = { concepts: [{ angle: "Governance", copy: "Reviewable actions", audienceHypothesis: "Teams seek control",
  offer: "Request access", targetMetric: "active users", stopCondition: "No lift" }] };
const specialists = ["native_market_researcher", "native_brand_strategist", "native_copywriter",
  "native_social_media", "native_advertising", "native_growth_analyst"];
const creativeApprovalId = "60000000-0000-4000-8000-000000000006";
const imageInput = { type: "object", properties: { campaignId: { type: "string", maxLength: 36 }, deliverableId: { type: "string", maxLength: 36 }, version: { type: "integer", minimum: 1 }, mediaType: { type: "string", enum: ["IMAGE"] }, brief: { type: "string", minLength: 1, maxLength: 2000 } }, required: ["campaignId", "deliverableId", "version", "mediaType", "brief"], additionalProperties: false };
const imageOutput = { type: "object", properties: { assetRef: { type: "string", maxLength: 169 }, mediaType: { type: "string", enum: ["IMAGE"] } }, required: ["assetRef", "mediaType"], additionalProperties: false };
const analyticsInput = { type: "object", properties: { metricId: { type: "string", maxLength: 120 }, windowStart: { type: "string", maxLength: 35 }, windowEnd: { type: "string", maxLength: 35 } }, required: ["metricId", "windowStart", "windowEnd"], additionalProperties: false };
const analyticsOutput = { type: "object", properties: { status: { type: "string", enum: ["VERIFIED"] }, metricId: { type: "string", maxLength: 120 }, value: { type: "number" }, unit: { type: "string", maxLength: 60 }, observedAt: { type: "string", maxLength: 35 } }, required: ["status", "metricId", "value", "unit", "observedAt"], additionalProperties: false };

const agent = (id: string) => ({ schemaVersion: "1" as const, id, ownerId, role: "coding" as const,
  displayName: id, version: "1.0.0", status: "available" as const, capabilities: ["marketing.draft"], supportedTasks: ["marketing"],
  configuration: {}, createdAt: at, updatedAt: at, healthSummary: "ready",
  workforce: { organizationId, departmentId, parentAgentId: null, managerAgentId: null, specialization: "Marketing",
    description: "bounded specialist", skills: ["marketing"], memoryScopeId: `agent:${id}`, departmentMemoryScopeId: `department:${departmentId}`,
    organizationMemoryScopeId: `organization:${organizationId}`, capabilityProfileId: `profile:${id}`, missingCapabilities: [],
    modelPolicyId: "BALANCED" as const, activationPolicyId: "lazy", executionPlacement: "REMOTE_ALLOWED" as const,
    evaluationProfile: ["verified_outcome"], source: "ALEXA_NATIVE" as const, sourcePath: null, sourceVersion: "test",
    license: null, importedAt: at } });

describe("coordinated marketing sandbox", () => {
  it("progresses real company Workforce tasks through reviewed brand, creative, Engineering, analytics and a review-only package", async () => {
    await companyScope.run({ ownerId, companyId, role: "OWNER", requestId: context.requestId }, async () => {
      const store = new InMemoryMarketingStore();
      const agents = new InMemoryAgentStore();
      const accounts = specialists.map((agentId) => ({ ownerId, agentId, availableCredits: 100, reservedCredits: 0,
        lifetimeEarned: 100, lifetimeSpent: 0, reputation: 90, economyStatus: "DORMANT" as const,
        organizationId, departmentId, parentAgentId: null, memoryScopeId: `agent:${agentId}`,
        capabilityProfileId: `profile:${agentId}`, modelPolicyId: "BALANCED", activationPolicyId: "lazy",
        createdAt: at, updatedAt: at }));
      for (const id of specialists) {
        agents.upsertAgent(agent(id));
        const assignment = agents.findAssignment(ownerId, id, companyId);
        agents.saveAssignment({ ...assignment!, status: "ACTIVE" });
      }
      const economy = { dashboard: vi.fn(() => Promise.resolve({ overview: {}, accounts, performance: [], ledger: [] })),
        reserve: vi.fn(() => Promise.resolve({ reservation: { id: crypto.randomUUID() } })),
        settle: vi.fn(() => Promise.resolve({})), release: vi.fn(() => Promise.resolve({})) } as unknown as AgentEconomyService;
      const workforce = { setActivation: vi.fn(() => Promise.resolve()), society: { dashboard: vi.fn(() => Promise.resolve({
        organizations: [{ id: organizationId }], departments: [{ id: departmentId, name: "Marketing", leadAgentId: null }],
      })) } } as unknown as AgentWorkforceService;
      const agentOs = { store: { listSessions: vi.fn(() => Promise.resolve([])) },
        startIsolatedDelegation: vi.fn(() => Promise.resolve({ session: { id: crypto.randomUUID() } })),
        completeIsolatedDelegation: vi.fn(() => Promise.resolve({})) } as unknown as AgentOsService;
      const model = vi.fn((request: { context: Array<{ content: { marketingBinding?: { marketingDeliverableType: string } } }> }) => {
        const type = request.context[0]?.content.marketingBinding?.marketingDeliverableType;
        const marketingContent = type === "RESEARCH" ? { observations: [], summary: "No verified external sources." }
          : type === "BRAND_STRATEGY" ? brand : type === "AD_CONCEPT" ? concepts : copy;
        return Promise.resolve({ outcome: "SUCCESS", structuredOutput: { summary: `Bounded ${type} result`, confidence: 0.9,
          evidence: [], leads: [], verification: null, marketingContent }, requestId: crypto.randomUUID(),
          providerId: "sandbox-model", modelId: "bounded", usage: { totalTokens: 400 } });
      });
      const aiRouter = { executeStructured: model } as unknown as AIRouterService;
      const audit: GovernanceAuditWriter = () => undefined;
      const runtimeStore = new InMemoryWorkforceRuntimeStore();
      const runtime = new WorkforceRuntimeService(runtimeStore, agents, workforce, economy, agentOs,
        { executeDelegation: vi.fn() } as unknown as ExternalHarvestService, aiRouter,
        { createRequest: vi.fn() } as unknown as CapabilityStudioService, undefined, audit, () => new Date(at));
      const delivery = { id: crypto.randomUUID(), objectiveId: crypto.randomUUID(), firstPreviewAt: at,
        preview: { state: "RUNNING", healthStatus: "PASS", url: "https://preview.example.test", previewId: "preview-1" } };
      const engineering = { create: vi.fn(() => Promise.resolve({ delivery })) };
      const engineeringStore = { findByIdempotencyKey: vi.fn(() => Promise.resolve(delivery)) };
      const categories: string[] = [];
      const providerInvoke = vi.fn((input: { tool: { name: string } }) => Promise.resolve(input.tool.name === "generate_image"
        ? { structuredOutput: { assetRef: "artifact:sandbox-launch-image", mediaType: "IMAGE" }, externalOperationId: "sandbox-image" }
        : { structuredOutput: { status: "VERIFIED", metricId: "active_users", value: 42, unit: "users", observedAt: at }, externalOperationId: "sandbox-analytics" }));
      const adapter: ToolAdapter = {
        sourceType: "API", writeRecovery: "PROVIDER_IDEMPOTENT_RECONCILABLE",
        discover: () => Promise.resolve([
          { name: "generate_image", description: "Finite sandbox image generation", inputSchema: imageInput, outputSchema: imageOutput, capabilityCategory: "image.generate", department: "marketing", operationClass: "WRITE", riskLevel: "medium", approvalRequirement: "explicit", costModel: "FREE" },
          { name: "read_analytics", description: "Finite sandbox analytics read", inputSchema: analyticsInput, outputSchema: analyticsOutput, capabilityCategory: "analytics.query_metric", department: "marketing", operationClass: "READ", riskLevel: "read_only", approvalRequirement: "none", costModel: "FREE" },
        ]),
        invoke: providerInvoke,
        reconcile: () => Promise.resolve({ status: "UNKNOWN", externalOperationId: null }),
      };
      const toolStore = new InMemoryUniversalToolStore();
      const gateway = new UniversalToolGateway(toolStore, (input) => Promise.resolve(
        input.tool.operationClass === "WRITE" && input.approvalId !== creativeApprovalId ? "APPROVAL_REQUIRED" : {
          kind: "REVIEWED_EXECUTION_GRANT", ownerId, companyId, requestId: input.context.requestId,
          invocationId: input.invocationId, toolId: input.tool.id, providerId: input.provider.id,
          schemaDigest: input.tool.schemaDigest, providerVersion: input.provider.version,
          credentialReferenceId: null, requestDigest: input.requestDigest, approvalId: input.approvalId,
          expiresAt: new Date(new Date(at).getTime() + 5_000).toISOString() }), () => Promise.resolve(), [adapter], () => new Date(at));
      const provider = { id: "sandbox.marketing", ownerId, companyId, sourceType: "API" as const, displayName: "Sandbox marketing", endpoint: null, credentialReferenceId: null, status: "REVIEW_REQUIRED" as const, health: "HEALTHY" as const, version: "1", updatedAt: at };
      await gateway.registerReviewedProvider({ ...context, agentId: null }, provider);
      const discovered = await gateway.discover({ ...context, agentId: null }, provider.id);
      await toolStore.saveProvider({ ...provider, status: "ENABLED" });
      await toolStore.saveTools(ownerId, provider.id, discovered.map((tool) => ({ ...tool, enabled: true })));
      for (const tool of discovered) await toolStore.saveReview({ ownerId, companyId, providerId: provider.id, toolId: tool.id,
        schemaDigest: tool.schemaDigest, providerVersion: provider.version, riskLevel: tool.riskLevel,
        approvalRequirement: tool.approvalRequirement, credentialReferenceId: null, governanceToolName: "universal.external_write",
        status: "ENABLED", reviewedAt: at, updatedAt: at });
      const tools = {
        select: async (trusted: typeof context, category: string, limit: number) => {
          categories.push(category);
          return gateway.select({ ...trusted, agentId: null }, category, limit);
        },
        invoke: (trusted: typeof context, raw: unknown) => gateway.invoke({ ...trusted, agentId: null }, raw),
        receipt: (trusted: typeof context, id: string) => gateway.receipt({ ...trusted, agentId: null }, id),
        reconcileReceipt: (trusted: typeof context, id: string) => gateway.reconcileReceipt({ ...trusted, agentId: null }, id),
      };
      const objectives = { create: vi.fn(() => Promise.resolve({ objective: { id: crypto.randomUUID(), organizationId: companyId } })) };
      const marketing = new MarketingService(store, objectives as never, audit, tools as never, () => new Date(at),
        engineering as never, engineeringStore as never, undefined, undefined, undefined,
        runtime, agents, runtimeStore);
      const governanceStore = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);
      const approvals = new ApprovalService(governanceStore, audit);
      const review = new MarketingArtifactReviewService(store, new RegistryService(governanceStore),
        new PolicyEngine(governanceStore, new RiskEngine(), approvals, audit), approvals, audit);
      const coordinator = new MarketingCampaignCoordinator({ service: marketing, store,
        trustedContext: () => Promise.resolve(context) });
      runtime.setLifecycleSink({ handleWorkforceTaskChanged: (task) => coordinator.handleWorkforceTaskChanged(task) });

      const campaign = await marketing.create(context, { idempotencyKey: "coordinated-launch-sandbox", title: "Launch",
        productOrCompany: "Assistant", objectiveType: "PRODUCT_LAUNCH", engineeringRepositoryId: crypto.randomUUID() });
      const scope = { ownerId, companyId, campaignId: campaign.id };
      await coordinator.run(scope);
      const current = () => store.findCampaign(ownerId, companyId, campaign.id);
      await vi.waitFor(async () => expect((await current())?.deliverables.find((item) => item.type === "BRAND_STRATEGY")?.status)
        .toBe("DRAFT_READY"), { timeout: 5_000 });
      const brandArtifact = (await store.listArtifacts(ownerId, companyId, campaign.id)).find((item) => item.type === "BRAND_STRATEGY")!;
      const requested = await review.request(reviewContext, campaign.id, brandArtifact.id);
      await approvals.approve(ownerId, requested.approvalRequestId, sessionId,
        { ipAddress: context.ipAddress, requestId: context.requestId });
      await review.finalize(reviewContext, campaign.id, brandArtifact.id);
      await coordinator.run(scope);
      await vi.waitFor(async () => expect((await current())?.deliverables.find((item) => item.type === "IMAGE_ASSET")?.status)
        .toBe("READY"), { timeout: 5_000 });
      let generated = false;
      for (let attempt = 0; attempt < 5 && !generated; attempt += 1) {
        const image = (await current())!.deliverables.find((item) => item.type === "IMAGE_ASSET")!;
        try {
          await marketing.generateCreative({ ...context, agentId: null, networkVerification: context.networkState }, campaign.id, image.id,
            "A bounded blue geometric launch image.", creativeApprovalId);
          generated = true;
        } catch (error) {
          if (!(error instanceof Error) || error.message !== "Creative work was claimed concurrently.") throw error;
          await new Promise<void>((resolve) => setTimeout(resolve, 5));
        }
      }
      expect(generated).toBe(true);
      // The preview is a bounded Engineering mock in this sandbox; delivery
      // lifecycle notification drives its persisted preview reconciliation.
      coordinator.handleEngineeringDeliveryChanged(scope);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await marketing.refreshLandingPage(ownerId, companyId, campaign.id);
        if ((await current())?.deliverables.find((item) => item.type === "LANDING_PAGE")?.status === "DRAFT_READY") break;
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
      }
      await vi.waitFor(async () => expect((await current())?.deliverables.find((item) => item.type === "LANDING_PAGE")?.status)
        .toBe("DRAFT_READY"), { timeout: 5_000 });
      await coordinator.run(scope);
      await vi.waitFor(async () => expect((await current())?.deliverables.find((item) => item.type === "SOCIAL_POST")?.status)
        .toBe("DRAFT_READY"), { timeout: 5_000 });
      for (const type of ["SOCIAL_POST", "AD_CONCEPT"] as const) {
        const artifact = (await store.listArtifacts(ownerId, companyId, campaign.id)).find((item) => item.type === type);
        if (!artifact) continue;
        const pending = await review.request(reviewContext, campaign.id, artifact.id);
        await approvals.approve(ownerId, pending.approvalRequestId, sessionId,
          { ipAddress: context.ipAddress, requestId: context.requestId });
        await review.finalize(reviewContext, campaign.id, artifact.id);
        await coordinator.run(scope);
      }
      await vi.waitFor(async () => expect((await current())?.deliverables.find((item) => item.type === "ANALYTICS_REPORT")?.status)
        .toBe("READY"), { timeout: 5_000 });
      await coordinator.run(scope);
      await marketing.readAnalyticsMetric({ ...context, agentId: null, networkVerification: context.networkState },
        campaign.id, { metricId: "active_users", windowStart: "2026-09-01T00:00:00.000Z", windowEnd: at });
      for (let attempt = 0; attempt < 8 && (await current())?.status !== "PACKAGE_READY"; attempt += 1) {
        const latest = (await current())!;
        const pending = latest.deliverables.find((item) => item.approvalState === "REQUIRED" && item.artifactRef?.startsWith("marketing-artifact:"));
        if (pending) {
          const artifact = (await store.listArtifacts(ownerId, companyId, campaign.id))
            .find((item) => item.id === pending.artifactRef?.slice("marketing-artifact:".length));
          if (artifact) {
            const approval = await review.request(reviewContext, campaign.id, artifact.id);
            await approvals.approve(ownerId, approval.approvalRequestId, sessionId,
              { ipAddress: context.ipAddress, requestId: context.requestId });
            await review.finalize(reviewContext, campaign.id, artifact.id);
          }
        }
        await coordinator.run(scope);
      }
      await vi.waitFor(async () => expect((await current())?.status).toBe("PACKAGE_READY"), { timeout: 5_000 });
      expect(new Set(categories)).toEqual(new Set(["image.generate", "analytics.query_metric"]));
      expect(providerInvoke).toHaveBeenCalledTimes(2);
      expect(engineering.create).toHaveBeenCalledOnce();
      expect(model.mock.calls.length).toBeGreaterThanOrEqual(4);
      expect(new Set(runtimeStore.listTasks(ownerId, 100).map((task) => task.assignedAgentId)).size).toBeGreaterThanOrEqual(4);
      expect((await store.listArtifacts(ownerId, companyId, campaign.id)).find((item) => item.type === "LAUNCH_PACKAGE")?.content)
        .toMatchObject({ publicActionsPendingApproval: true });
    });
  });
});
