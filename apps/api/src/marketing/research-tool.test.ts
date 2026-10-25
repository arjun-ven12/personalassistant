import { describe, expect, it, vi } from "vitest";
import { companyScope } from "../companies/scope.js";
import { createMarketingResearchTool, groundMarketingResearch, researchSource } from "./research-tool.js";

const at = "2026-10-19T00:00:00.000Z";
const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000002";
const campaignId = "30000000-0000-4000-8000-000000000003";
const deliverableId = "40000000-0000-4000-8000-000000000004";
const source = "https://example.com/pricing";
const content = { observations: [{ source, observation: "Public price listed.", relevance: "Pricing comparison", confidence: 0.7, observedAt: at }], summary: "One primary source; market size unknown." };
const metadata = { webSearchCallCount: 1, sourceUrls: [source] };

describe("governed business research contract (fixture providers, not live acceptance)", () => {
  it("requires real retrieval metadata and rejects invented citations", () => {
    expect(() => groundMarketingResearch(content, undefined, at)).toThrow("RESEARCH_TOOL_NOT_USED");
    expect(() => groundMarketingResearch(content, { ...metadata, sourceUrls: ["https://other.example/"] }, at)).toThrow("RESEARCH_EVIDENCE_MISSING");
    expect(() => groundMarketingResearch({ ...content, observations: [] }, metadata, at)).toThrow("RESEARCH_EVIDENCE_MISSING");
    expect(() => groundMarketingResearch(content, { ...metadata, webSearchCallCount: 0 }, at)).toThrow();
  });
  it("stores only cited, canonical provider evidence and excludes incidental search URLs", () => {
    const result = groundMarketingResearch(content, { ...metadata, sourceUrls: [source, "https://example.com/risk-assessment-guide"] }, at);
    expect(result.sourceUrls).toEqual([source]);
    expect(groundMarketingResearch({ ...content, observations: [{ ...content.observations[0], source: source + "#section" }] }, metadata, at).content.observations[0]?.source).toBe(source);
  });

  it.each(["token", "access_token", "api_key", "password", "code", "otp", "X-Amz-Signature", "X-Goog-Credential"])("rejects credential-bearing source parameters: %s", parameter => {
    expect(researchSource(`https://example.com/report?${parameter}=not-a-real-credential`)).toBeNull();
  });

  it.each([
    ["public discussion of API keys and risk-assessment methods", false],
    ["sk-" + "x".repeat(48), true],
    ["ghp_" + "x".repeat(36), true],
    ["AKIA" + "X".repeat(16), true],
    ["password=not-a-real-password-value", true],
  ])("keeps actual secret values out of private research drafts: %s", async (text, denied) => {
    const resultContent = { ...content, summary: text };
    const executeStructured = vi.fn(() => Promise.resolve({ outcome: "SUCCESS", structuredOutput: resultContent, requestId: campaignId, providerId: "fixture", modelId: "fixture", providerMetadata: metadata }));
    const findCampaign = vi.fn(() => Promise.resolve({ productOrCompany: "Public product", targetAudience: "Teams", constraints: [], objectiveId: campaignId, status: "ACTIVE", deliverables: [{ id: deliverableId, type: "RESEARCH", status: "RUNNING" }] }));
    const { handler } = createMarketingResearchTool({ findCampaign } as never, { executeStructured } as never, () => new Date(at));
    await companyScope.run({ ownerId, companyId, role: "OWNER", requestId: "research" }, async () => {
      const promise = handler.invoke({ context: { ownerId, companyId, requestId: "research", agentId: null, emergencyStopActive: false }, ownerId, companyId, arguments: { campaignId, deliverableId }, invocationId: deliverableId, idempotencyKey: null });
      if (denied) await expect(promise).rejects.toThrow("RESEARCH_SENSITIVE_OUTPUT_DENIED");
      else await expect(promise).resolves.toMatchObject({ structuredOutput: { content: resultContent } });
    });
  });

  it("deduplicates grounded observations and uses server retrieval time", () => {
    const result = groundMarketingResearch({ ...content, observations: [content.observations[0], content.observations[0]] }, metadata, "2026-10-19T01:00:00.000Z");
    expect(result.content.observations).toHaveLength(1);
    expect(result.content.observations[0]?.observedAt).toBe("2026-10-19T01:00:00.000Z");
  });
  it("rejects private, credentialed and non-HTTPS citation references", () => {
    for (const url of ["http://example.com", "https://127.0.0.1/", "https://[::1]/", "https://personalassistant.railway.internal/", "https://user:password@example.com/", "https://example.com:8443/"]) expect(researchSource(url)).toBeNull();
  });
  it.each(["success", "failed repair", "extra observation", "audit failure", "paused", "emergency stop"])("bounds citation synthesis repair with durable request attribution: %s", async mode => {
    const invented = { ...content.observations[0]!, source: "https://invented.example/", observation: "Unsupported assertion that must not enter the repair prompt." };
    const original = { outcome: "SUCCESS", structuredOutput: { observations: [...content.observations, invented], summary: "Unsupported original synthesis" }, requestId: campaignId, providerId: "fixture", modelId: "fixture", providerMetadata: metadata };
    const repaired = { outcome: mode === "failed repair" ? "ROUTING_FAILED" : "SUCCESS", structuredOutput: mode === "extra observation" ? { summary: "Grounded summary", observations: [invented] } : { summary: "Grounded summary" }, requestId: deliverableId, providerId: "fixture", modelId: "fixture" };
    const executeStructured = vi.fn().mockResolvedValueOnce(original).mockResolvedValueOnce(repaired);
    const campaign = { id: campaignId, productOrCompany: "Public product", targetAudience: "Teams", constraints: [], objectiveId: campaignId, status: "ACTIVE", deliverables: [{ id: deliverableId, type: "RESEARCH", status: "RUNNING", version: 1 }] };
    const findCampaign = vi.fn().mockResolvedValueOnce(campaign).mockResolvedValueOnce({ ...campaign, status: mode === "paused" ? "PAUSED" : "ACTIVE" });
    const audit = vi.fn((entry: unknown) => { void entry; return mode === "audit failure" ? Promise.reject(Error("AUDIT_UNAVAILABLE")) : Promise.resolve(); });
    const { handler } = createMarketingResearchTool({ findCampaign }, { executeStructured } as never, () => new Date(at), audit, () => Promise.resolve(mode === "emergency stop"));
    const input = { context: { ownerId, companyId, requestId: "research", ipAddress: "127.0.0.1", agentId: null, emergencyStopActive: false }, ownerId, companyId, arguments: { campaignId, deliverableId }, invocationId: deliverableId, idempotencyKey: null };
    await companyScope.run({ ownerId, companyId, role: "OWNER", requestId: "research" }, async () => {
      if (mode === "success") {
        await expect(handler.invoke(input)).resolves.toMatchObject({ structuredOutput: { content: { observations: content.observations, summary: "Grounded summary" }, modelRequestId: deliverableId }, retryCount: 1 });
        expect(audit.mock.calls[0]?.[0]).toMatchObject({ companyId, metadata: { sourceModelRequestId: campaignId, repairModelRequestId: deliverableId, retainedObservations: 1 } });
      } else await expect(handler.invoke(input)).rejects.toThrow();
      expect(executeStructured).toHaveBeenCalledTimes(["paused", "emergency stop"].includes(mode) ? 1 : 2);
      if (!["paused", "emergency stop"].includes(mode)) {
        const request = executeStructured.mock.calls[1]![0] as { input: unknown; metadata?: unknown };
        expect(JSON.stringify(request.input)).not.toContain("invented.example");
        expect(JSON.stringify(request.input)).not.toContain("Unsupported original synthesis");
        expect(request.metadata).toBeUndefined();
        expect(executeStructured.mock.calls[1]![0]).toMatchObject({ maxAttempts: 1, maxCloudEscalations: 0, allowFallback: false, economicContext: { ownerId, companyId, taskId: deliverableId } });
      }
    });
  });

  it("registers a finite schema and binds AIRouter search/economics to the company", async () => {
    const executeStructured = vi.fn(() => Promise.resolve({ outcome: "SUCCESS", structuredOutput: content, requestId: campaignId, providerId: "fixture", modelId: "fixture", providerMetadata: metadata }));
    const findCampaign = vi.fn(() => Promise.resolve({ productOrCompany: "Public product", targetAudience: "Teams", constraints: [], objectiveId: campaignId, status: "RUNNING", deliverables: [{ id: deliverableId, type: "RESEARCH", status: "RUNNING" }] }));
    const { handler, manifest } = createMarketingResearchTool({ findCampaign } as never, { executeStructured } as never, () => new Date(at));
    expect(manifest.credentialRequired).toBe(false);
    expect(handler.descriptor.operationClass).toBe("READ");
    const input = { context: { ownerId, companyId, requestId: "research", agentId: null, emergencyStopActive: false }, ownerId, companyId, arguments: { campaignId, deliverableId }, invocationId: deliverableId, idempotencyKey: null };
    await expect(handler.invoke(input)).rejects.toThrow();
    expect(executeStructured).not.toHaveBeenCalled();
    await companyScope.run({ ownerId, companyId, role: "OWNER", requestId: "research" }, async () => {
      await expect(handler.invoke({ ...input, companyId: campaignId })).rejects.toThrow("RESEARCH_SCOPE_DENIED");
      await expect(handler.invoke({ ...input, arguments: { campaignId, deliverableId, url: "https://evil.example/" } })).rejects.toThrow();
      expect(executeStructured).not.toHaveBeenCalled();
      await expect(handler.invoke(input)).resolves.toMatchObject({ structuredOutput: { content, providerId: "fixture" } });
      const request = executeStructured.mock.calls[0] as unknown;
      expect(request).toMatchObject([{ metadata: { externalResearch: true }, economicContext: { ownerId, companyId }, objectiveId: campaignId, taskId: deliverableId, maxAttempts: 2 }]);
    });
  });
});
