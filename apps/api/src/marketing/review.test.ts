import { beforeEach, describe, expect, it, vi } from "vitest";

import { companyScope } from "../companies/scope.js";
import { ApprovalService, type GovernanceAuditWriter } from "../governance/approval-service.js";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { PolicyEngine } from "../governance/policy-engine.js";
import { RegistryService } from "../governance/registry-service.js";
import { RiskEngine } from "../governance/risk-engine.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { MarketingService } from "./service.js";
import { MarketingArtifactReviewService, type MarketingReviewContext } from "./review.js";
import { InMemoryMarketingStore } from "./store.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000002";
beforeEach(() => companyScope.enter({ ownerId, companyId, role: "OWNER", requestId: "review-test" }));
const context: MarketingReviewContext = {
  ownerId, companyId, sessionId: "50000000-0000-4000-8000-000000000005",
  deviceTrusted: false, signedEnvelopeVerified: false, networkVerification: "PRIVATE_NETWORK",
  ipAddress: "100.64.0.1", requestId: "review-test", emergencyStopActive: false,
};
const brand = {
  positioning: "A governed assistant.", targetAudience: "Teams", brandPromise: "Bounded operation",
  messagingPillars: ["Reviewability"], valuePropositions: ["Clear controls"], toneOfVoice: "Plain",
  visualDirection: "Calm", campaignThemes: [], contentThemes: [], competitorObservations: [], prohibitedClaims: [],
};

const setup = async () => {
  const events: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => { events.push(event); };
  const store = new InMemoryMarketingStore();
  const governanceStore = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);
  const approvals = new ApprovalService(governanceStore, audit);
  const review = new MarketingArtifactReviewService(store, new RegistryService(governanceStore),
    new PolicyEngine(governanceStore, new RiskEngine(), approvals, audit), approvals, audit);
  const objectives = { create: vi.fn(() => Promise.resolve({ objective: { id: crypto.randomUUID(), organizationId: companyId } })) };
  const marketing = new MarketingService(store, objectives as never, audit, undefined, () => new Date("2026-10-03T00:00:00.000Z"));
  const campaign = await marketing.create({ ...context }, { idempotencyKey: crypto.randomUUID(), title: "Brand",
    productOrCompany: "Product", objectiveType: "BRAND_PACKAGE" });
  const deliverable = campaign.deliverables.find((item) => item.type === "BRAND_STRATEGY")!;
  const research = campaign.deliverables.find((item) => item.type === "RESEARCH")!;
  await marketing.saveDraft(context, campaign.id, research.id, { observations: [], summary: "No verified market evidence." });
  const artifact = await marketing.saveDraft(context, campaign.id, deliverable.id, brand);
  return { store, events, approvals, review, marketing, campaign, deliverable, artifact };
};

describe("MarketingArtifactReviewService", () => {
  it("binds existing policy approval to the exact current company artifact and makes retries idempotent", async () => {
    const { store, approvals, review, campaign, artifact } = await setup();
    const requested = await review.request(context, campaign.id, artifact.id);
    expect(requested.artifact.status).toBe("IN_REVIEW");
    expect(requested.approvalRequestId).toBe((await review.request(context, campaign.id, artifact.id)).approvalRequestId);
    await expect(review.finalize(context, campaign.id, artifact.id)).rejects.toThrow("no final owner decision");
    await approvals.approve(ownerId, requested.approvalRequestId, context.sessionId,
      { ipAddress: context.ipAddress, requestId: context.requestId });
    const approved = await review.finalize(context, campaign.id, artifact.id);
    expect(approved.status).toBe("APPROVED");
    expect((await store.findCampaign(ownerId, companyId, campaign.id))?.deliverables.find((item) => item.id === artifact.deliverableId)?.approvalState).toBe("APPROVED");
    expect((await review.finalize(context, campaign.id, artifact.id)).status).toBe("APPROVED");
  });

  it("rejects cross-company review and prevents a newer draft from using an older approval", async () => {
    const { review, marketing, campaign, deliverable, artifact, approvals } = await setup();
    await expect(review.request({ ...context, companyId: crypto.randomUUID() }, campaign.id, artifact.id)).rejects.toThrow();
    const pending = await review.request(context, campaign.id, artifact.id);
    await approvals.approve(ownerId, pending.approvalRequestId, context.sessionId,
      { ipAddress: context.ipAddress, requestId: context.requestId });
    const revised = await marketing.saveDraft(context, campaign.id, deliverable.id,
      { ...brand, positioning: "A revised positioning." });
    await expect(review.finalize(context, campaign.id, artifact.id)).rejects.toThrow("Current artifact version");
    await expect(review.finalize(context, campaign.id, revised.id)).rejects.toThrow("no pending exact review");
  });

  it("records an owner rejection without granting approval or memory promotion", async () => {
    const { store, review, approvals, campaign, artifact } = await setup();
    const pending = await review.request(context, campaign.id, artifact.id);
    await approvals.reject(ownerId, pending.approvalRequestId, context.sessionId,
      { ipAddress: context.ipAddress, requestId: context.requestId }, "Reject this draft");
    expect((await review.finalize(context, campaign.id, artifact.id)).status).toBe("REJECTED");
    expect((await store.findCampaign(ownerId, companyId, campaign.id))?.deliverables.find((item) => item.id === artifact.deliverableId)?.approvalState).toBe("REJECTED");
  });

  it("fails closed for sensitive claims until a high-risk review path exists", async () => {
    const { review, marketing, campaign, deliverable } = await setup();
    const sensitive = await marketing.saveDraft(context, campaign.id, deliverable.id,
      { ...brand, brandPromise: "Guaranteed investment returns" });
    await expect(review.request(context, campaign.id, sensitive.id)).rejects.toThrow("high-risk recent-authentication");
  });

  it("keeps the artifact draft when emergency stop or network authority denies policy", async () => {
    const { review, store, campaign, artifact } = await setup();
    await expect(review.request({ ...context, emergencyStopActive: true }, campaign.id, artifact.id))
      .rejects.toThrow("Exact artifact approval was not requested by policy");
    await expect(review.request({ ...context, networkVerification: "UNKNOWN" }, campaign.id, artifact.id))
      .rejects.toThrow("Exact artifact approval was not requested by policy");
    expect((await store.listArtifacts(ownerId, companyId, campaign.id)).find((item) => item.id === artifact.id)?.status).toBe("DRAFT");
  });
});
