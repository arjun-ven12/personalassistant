import { describe, expect, it, vi } from "vitest";
import { MarketingCampaignSchema, type WorkforceRuntimeTask } from "@alexa-control/shared";

import { MarketingCampaignCoordinator, type MarketingAdvanceContext } from "./coordinator.js";
import { InMemoryMarketingStore } from "./store.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000002";
const campaignId = "30000000-0000-4000-8000-000000000003";
const deliverableId = "40000000-0000-4000-8000-000000000004";
const now = "2026-10-03T00:00:00.000Z";

const campaign = () => MarketingCampaignSchema.parse({
  id: campaignId, ownerId, companyId, objectiveId: "50000000-0000-4000-8000-000000000005",
  idempotencyKey: "coordinator-test", title: "Campaign", productOrCompany: "Company",
  objectiveType: "SOCIAL_CAMPAIGN", targetAudience: null, channels: [], constraints: [], status: "DRAFT",
  complexity: "SMALL", version: 1, automationContext: { sessionId: "60000000-0000-4000-8000-000000000006", startedAt: now },
  deliverables: [{ id: deliverableId, type: "MESSAGING", role: "COPYWRITER", dependencies: [], status: "READY", artifactRef: null, toolId: null, workforceTaskId: null, engineeringObjectiveId: null, approvalState: "NOT_REQUIRED", contentDigest: null, version: 1, weight: 1, updatedAt: now }],
  brandStrategyArtifactRef: null, engineeringRepositoryId: null, modelBudgetCredits: 10, toolBudgetMinor: 0, adBudgetMinor: 0,
  knownToolCostMinor: 0, unknownToolCostCount: 0, firstDraftAt: null, firstAssetAt: null, firstEngineeringPreviewAt: null, packageReadyAt: null, createdAt: now, updatedAt: now,
});

const context: MarketingAdvanceContext = { ownerId, companyId, requestId: "coordinator", ipAddress: "100.64.0.1", sessionId: "60000000-0000-4000-8000-000000000006", networkState: "PRIVATE_NETWORK", emergencyStopActive: false };

describe("MarketingCampaignCoordinator", () => {
  it("rechecks owner authority and emergency stop between model/tool stages", async () => {
    const store = new InMemoryMarketingStore();
    await store.createCampaign(campaign());
    let reads = 0;
    const advance = vi.fn(() => Promise.resolve({ status: "DRAFT_READY" as const, campaignId, deliverableId, artifactId: deliverableId }));
    const coordinator = new MarketingCampaignCoordinator({ service: { advance, refreshSpecialist: vi.fn(), refreshLandingPage: vi.fn() }, store,
      trustedContext: () => Promise.resolve({ ...context, emergencyStopActive: ++reads >= 3 }) });
    await expect(coordinator.run({ ownerId, companyId, campaignId })).resolves.toMatchObject({ status: "CONTEXT_UNAVAILABLE", steps: 1 });
    expect(advance).toHaveBeenCalledOnce();
  });

  it("fails closed without a server-created trusted context", async () => {
    const store = new InMemoryMarketingStore();
    await store.createCampaign(campaign());
    const advance = vi.fn();
    const coordinator = new MarketingCampaignCoordinator({ service: { advance, refreshSpecialist: vi.fn(), refreshLandingPage: vi.fn() }, store, trustedContext: () => Promise.resolve(null) });
    await expect(coordinator.run({ ownerId, companyId, campaignId })).resolves.toMatchObject({ status: "CONTEXT_UNAVAILABLE" });
    expect(advance).not.toHaveBeenCalled();
  });

  it("activates through CAS and stops once an approval is required", async () => {
    const store = new InMemoryMarketingStore();
    await store.createCampaign(campaign());
    const advance = vi.fn(async () => {
      const current = await store.findCampaign(ownerId, companyId, campaignId);
      await store.updateCampaign({ ...current!, version: current!.version + 1, updatedAt: now, deliverables: current!.deliverables.map((item) => ({ ...item, status: "DRAFT_READY" as const, approvalState: "REQUIRED" as const })) }, current!.version);
      return { status: "DRAFT_READY" as const, campaignId, deliverableId, artifactId: "70000000-0000-4000-8000-000000000007" };
    });
    const onApprovalRequired = vi.fn(() => Promise.resolve());
    const coordinator = new MarketingCampaignCoordinator({ service: { advance, refreshSpecialist: vi.fn(), refreshLandingPage: vi.fn() }, store, trustedContext: () => Promise.resolve(context), onApprovalRequired });
    await expect(coordinator.run({ ownerId, companyId, campaignId })).resolves.toMatchObject({ status: "APPROVAL_REQUIRED", steps: 1 });
    expect(advance).toHaveBeenCalledTimes(1);
    expect(onApprovalRequired).toHaveBeenCalledTimes(1);
    expect((await store.findCampaign(ownerId, companyId, campaignId))?.status).toBe("ACTIVE");
  });

  it("queues a workforce signal after the in-flight pass instead of awaiting itself", async () => {
    const store = new InMemoryMarketingStore();
    await store.createCampaign(campaign());
    let signalled = false;
    const task = { ownerId, organizationId: companyId, inputs: { marketingCampaignId: campaignId, marketingCompanyId: companyId } } as unknown as WorkforceRuntimeTask;
    const advance = vi.fn(async () => {
      if (!signalled) {
        signalled = true;
        await coordinator.handleWorkforceTaskChanged(task);
      }
      return { status: "IN_PROGRESS" as const, campaignId, deliverableId };
    });
    const coordinator = new MarketingCampaignCoordinator({ service: { advance, refreshSpecialist: vi.fn(), refreshLandingPage: vi.fn() }, store, trustedContext: () => Promise.resolve(context) });
    await expect(coordinator.run({ ownerId, companyId, campaignId })).resolves.toMatchObject({ status: "IN_PROGRESS" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(advance).toHaveBeenCalledTimes(2);
  });
});
