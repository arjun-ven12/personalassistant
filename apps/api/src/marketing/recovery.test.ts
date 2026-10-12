import { describe, expect, it, vi } from "vitest";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { MarketingService } from "./service.js";
import { InMemoryMarketingStore } from "./store.js";
import { companyScope } from "../companies/scope.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000002";
const providerId = "30000000-0000-4000-8000-000000000003";
const invocationId = "40000000-0000-4000-8000-000000000004";
const now = new Date("2026-10-03T00:00:00.000Z");
const requestContext = { ownerId, companyId, requestId: "marketing-recovery", ipAddress: "100.64.0.1" };
const creativeContext = { ...requestContext, agentId: null, emergencyStopActive: false };

const request = (key: string) => ({
  idempotencyKey: key,
  title: "Recover campaign",
  productOrCompany: "Alexa Control",
  objectiveType: "PRODUCT_LAUNCH" as const,
});

const brand = {
  positioning: "Secure personal assistance.", targetAudience: "Security teams.", brandPromise: "Governed assistance.",
  messagingPillars: ["Explicit authority"], valuePropositions: ["Reviewable actions"], toneOfVoice: "Clear.",
  visualDirection: "High contrast.", campaignThemes: [], contentThemes: [], competitorObservations: [], prohibitedClaims: [],
};

const result = (output: unknown) => ({
  invocationId, toolId: "50000000-0000-4000-8000-000000000005", providerId, status: "SUCCEEDED" as const,
  structuredOutput: output, boundedTextOutput: null, externalOperationId: "provider-operation", failureCode: null,
  retryable: false, latencyMs: 1, startedAt: now.toISOString(), completedAt: now.toISOString(),
});

const createService = (store: InMemoryMarketingStore, tools?: Record<string, unknown>) => {
  const objectives = { create: vi.fn((input: { body: { organizationId: string } }) => Promise.resolve({
    objective: { id: "60000000-0000-4000-8000-000000000006", organizationId: input.body.organizationId }, projects: [], clarificationQuestions: [],
  })) };
  const audit: GovernanceAuditWriter = () => undefined;
  return { service: new MarketingService(store, objectives as never, audit, tools as never, () => now), objectives };
};

const creativeCampaign = async (service: MarketingService, store: InMemoryMarketingStore, key: string) => {
  const created = await service.create(requestContext, request(key));
  const research = created.deliverables.find((item) => item.type === "RESEARCH")!;
  const strategy = created.deliverables.find((item) => item.type === "BRAND_STRATEGY")!;
  await service.saveDraft(requestContext, created.id, research.id, { observations: [], summary: "Evidence unavailable." });
  await service.saveDraft(requestContext, created.id, strategy.id, brand);
  const campaign = await store.findCampaign(ownerId, companyId, created.id);
  const image = campaign!.deliverables.find((item) => item.type === "IMAGE_ASSET")!;
  return { campaign: campaign!, image };
};

const claim = async (store: InMemoryMarketingStore, campaignId: string, deliverableId: string) => {
  const campaign = (await store.findCampaign(ownerId, companyId, campaignId))!;
  const execution = { invocationId, toolId: "50000000-0000-4000-8000-000000000005", brief: "A blue geometric hero.", mediaType: "IMAGE" as const,
    idempotencyKey: "marketing-creative-recovery", approvalId: null, state: "CLAIMED" as const, evidenceCode: null };
  await store.updateCampaign({ ...campaign, version: campaign.version + 1, updatedAt: now.toISOString(),
    deliverables: campaign.deliverables.map((item) => item.id === deliverableId ? { ...item, status: "RUNNING" as const, creativeExecution: execution } : item) }, campaign.version);
  return execution;
};

describe("MarketingService creative recovery", () => {
  it("deduplicates concurrent campaign creation across service instances", async () => {
    const store = new InMemoryMarketingStore();
    const first = createService(store);
    const second = createService(store);
    const [left, right] = await Promise.all([
      first.service.create(requestContext, request("shared-campaign-key")),
      second.service.create(requestContext, request("shared-campaign-key")),
    ]);
    expect(left.id).toBe(right.id);
    expect(first.objectives.create.mock.calls.length + second.objectives.create.mock.calls.length).toBe(1);
  });

  it("uses a completed receipt to recover the stored artifact without a second provider invocation", async () => {
    const store = new InMemoryMarketingStore();
    const invoke = vi.fn();
    const receipt = vi.fn(() => Promise.resolve({ status: "COMPLETED", toolId: "50000000-0000-4000-8000-000000000005", result: result({ assetRef: "artifact:recovered", mediaType: "IMAGE" }) }));
    const { service } = createService(store, { invoke, receipt, reconcileReceipt: vi.fn(), select: vi.fn() });
    const { campaign, image } = await creativeCampaign(service, store, "completed-receipt-key");
    await claim(store, campaign.id, image.id);

    await expect(service.reconcileCreative(creativeContext, campaign.id, image.id)).resolves.toMatchObject({ status: "SUCCEEDED" });
    expect(invoke).not.toHaveBeenCalled();
    expect((await store.listArtifacts(ownerId, companyId, campaign.id)).find((artifact) => artifact.deliverableId === image.id)?.content).toMatchObject({ externalAssetRef: "artifact:recovered" });
  });

  it("requires owner review for an unknown provider receipt and does not invoke again", async () => {
    const store = new InMemoryMarketingStore();
    const invoke = vi.fn();
    const receipt = vi.fn(() => Promise.resolve(null));
    const { service } = createService(store, { invoke, receipt, reconcileReceipt: vi.fn() });
    const { campaign, image } = await creativeCampaign(service, store, "unknown-receipt-key");
    await claim(store, campaign.id, image.id);

    await expect(service.reconcileCreative(creativeContext, campaign.id, image.id)).resolves.toEqual({ status: "OWNER_REVIEW_REQUIRED" });
    expect(invoke).not.toHaveBeenCalled();
    const latest = await store.findCampaign(ownerId, companyId, campaign.id);
    expect(latest?.deliverables.find((item) => item.id === image.id)?.creativeExecution?.state).toBe("OWNER_REVIEW_REQUIRED");
  });

  it("does not revive a creative deliverable cancelled while its provider call is pending", async () => {
    const store = new InMemoryMarketingStore();
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const invoked = new Promise<void>((resolve) => { started = resolve; });
    const invoke = vi.fn(async () => {
      started();
      await gate;
      return result({ assetRef: "artifact:late", mediaType: "IMAGE" });
    });
    const { service } = createService(store, { invoke, select: () => Promise.resolve([{ id: "50000000-0000-4000-8000-000000000005", operationClass: "WRITE", riskLevel: "low", approvalRequirement: "none", costModel: "FREE" }]) });
    const { campaign, image } = await creativeCampaign(service, store, "cancel-pending-key");
    const pending = service.generateCreative(creativeContext, campaign.id, image.id, "A blue geometric hero.", null);
    await invoked;
    await companyScope.run({ ownerId, companyId, role: "OWNER", requestId: "cancel-recovery" }, () =>
      service.cancel({ ...requestContext, sessionId: "70000000-0000-4000-8000-000000000007", networkState: "PRIVATE_NETWORK" }, campaign.id));
    release();

    await expect(pending).rejects.toThrow();
    expect((await store.findCampaign(ownerId, companyId, campaign.id))?.deliverables.find((item) => item.id === image.id)?.status).toBe("CANCELLED");
  });

  it("reconstructs recovery from the persisted exact tool and invocation identifiers", async () => {
    const store = new InMemoryMarketingStore();
    const receipt = vi.fn(() => Promise.resolve({ status: "COMPLETED", toolId: "50000000-0000-4000-8000-000000000005", result: result({ assetRef: "artifact:restart", mediaType: "IMAGE" }) }));
    const { service } = createService(store, { invoke: vi.fn(), receipt, reconcileReceipt: vi.fn() });
    const { campaign, image } = await creativeCampaign(service, store, "restart-reconcile-key");
    const execution = await claim(store, campaign.id, image.id);

    await service.reconcileCreative(creativeContext, campaign.id, image.id);
    expect(receipt).toHaveBeenCalledWith(creativeContext, execution.invocationId);
  });
});
