import { describe, expect, it, vi } from "vitest";

import { companyScope } from "../companies/scope.js";
import { ApprovalService, type GovernanceAuditWriter } from "../governance/approval-service.js";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { PolicyEngine } from "../governance/policy-engine.js";
import { RegistryService } from "../governance/registry-service.js";
import { RiskEngine } from "../governance/risk-engine.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { MarketingArtifactReviewService, type MarketingReviewContext } from "./review.js";
import { MarketingService } from "./service.js";
import { InMemoryMarketingStore } from "./store.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000002";
const context: MarketingReviewContext = {
  ownerId, companyId, sessionId: "50000000-0000-4000-8000-000000000005", requestId: "brand-lifecycle",
  ipAddress: "100.64.0.1", deviceTrusted: false, signedEnvelopeVerified: false,
  networkVerification: "PRIVATE_NETWORK", emergencyStopActive: false,
};
const brand = {
  positioning: "A reviewable assistant", targetAudience: "Teams", brandPromise: "Controlled work",
  messagingPillars: ["Clear authority"], valuePropositions: ["Auditable changes"],
  toneOfVoice: "Measured", visualDirection: "Calm controls", campaignThemes: [], contentThemes: [],
  competitorObservations: [], prohibitedClaims: ["Unverified promises"],
};

describe("governed marketing brand lifecycle", () => {
  it("requires exact owner approval before memory promotion and future-campaign use", async () =>
    companyScope.run({ ownerId, companyId, role: "OWNER", requestId: context.requestId }, async () => {
      const audit: GovernanceAuditWriter = () => undefined;
      const marketingStore = new InMemoryMarketingStore();
      const governanceStore = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);
      const approvals = new ApprovalService(governanceStore, audit);
      const review = new MarketingArtifactReviewService(marketingStore, new RegistryService(governanceStore),
        new PolicyEngine(governanceStore, new RiskEngine(), approvals, audit), approvals, audit);
      const records: Array<{ id: string; tags: string[]; content: string; evidence: Array<{ reference: string }> }> = [];
      const memoryStore = { listMemories: vi.fn(() => Promise.resolve(records as never)) };
      const memory = { recordMemory: vi.fn((input: { body: { tags: string[]; content: string; evidence: Array<{ reference: string }> } }) => {
        const entry = { id: crypto.randomUUID(), ...input.body };
        records.push(entry);
        return Promise.resolve({ memory: entry });
      }) };
      const objectiveCreate = vi.fn(() => Promise.resolve({ objective: { id: crypto.randomUUID(), organizationId: companyId } }));
      const executeStructured = vi.fn((..._args: [unknown]) => { void _args; return Promise.resolve({ outcome: "SUCCESS", structuredOutput: {
        title: "Social draft", variants: [{ channel: "LINKEDIN", headline: "Reviewable work", body: "Measured copy", cta: null }],
      } }); });
      const service = new MarketingService(marketingStore, { create: objectiveCreate } as never, audit,
        undefined, () => new Date("2026-10-03T00:00:00.000Z"), undefined, undefined,
        { executeStructured } as never, memory as never, memoryStore);
      const first = await service.create(context, { idempotencyKey: crypto.randomUUID(), title: "Brand",
        productOrCompany: "Product", objectiveType: "BRAND_PACKAGE" });
      const research = first.deliverables.find((item) => item.type === "RESEARCH")!;
      const brandNode = first.deliverables.find((item) => item.type === "BRAND_STRATEGY")!;
      await service.saveDraft(context, first.id, research.id, { observations: [], summary: "No verified market evidence." });
      const initial = await service.saveDraft(context, first.id, brandNode.id, brand);
      await expect(service.promoteBrand(context, first.id, initial.contentDigest)).rejects.toThrow("Existing governance has not approved");
      await expect(review.request({ ...context, companyId: crypto.randomUUID() }, first.id, initial.id)).rejects.toThrow();
      const pending = await review.request(context, first.id, initial.id);
      await approvals.approve(ownerId, pending.approvalRequestId, context.sessionId,
        { ipAddress: context.ipAddress, requestId: context.requestId });
      expect((await review.finalize(context, first.id, initial.id)).status).toBe("APPROVED");
      const memoryId = await service.promoteBrand(context, first.id, initial.contentDigest);
      expect(records).toHaveLength(1);
      expect(await service.promoteBrand(context, first.id, initial.contentDigest)).toBe(memoryId);
      expect(memory.recordMemory).toHaveBeenCalledTimes(1);

      const future = await service.create(context, { idempotencyKey: crypto.randomUUID(), title: "Future posts",
        productOrCompany: "Product", objectiveType: "SOCIAL_CAMPAIGN" });
      const messaging = future.deliverables.find((item) => item.type === "MESSAGING")!;
      await service.generateDraft(context, future.id, messaging.id);
      const modelInput = JSON.stringify(executeStructured.mock.calls[0]?.[0]);
      expect(modelInput).toContain("A reviewable assistant");
      expect(modelInput).toContain("Clear authority");
      expect(modelInput).toContain("approvedBrand");

      const changed = await service.saveDraft(context, first.id, brandNode.id,
        { ...brand, positioning: "A changed draft" });
      expect(changed.version).toBe(initial.version + 1);
      expect((await marketingStore.listArtifacts(ownerId, companyId, first.id)).find((item) => item.id === initial.id)?.status).toBe("SUPERSEDED");
      await expect(service.promoteBrand(context, first.id, changed.contentDigest)).rejects.toThrow("Existing governance has not approved");
      const rejected = await review.request(context, first.id, changed.id);
      await approvals.reject(ownerId, rejected.approvalRequestId, context.sessionId,
        { ipAddress: context.ipAddress, requestId: context.requestId }, "Reject changed positioning");
      expect((await review.finalize(context, first.id, changed.id)).status).toBe("REJECTED");
      await expect(service.promoteBrand(context, first.id, changed.contentDigest)).rejects.toThrow("Existing governance has not approved");
      await expect(service.promoteBrand({ ...context, companyId: crypto.randomUUID() }, first.id, initial.contentDigest)).rejects.toThrow();
    }));
});
