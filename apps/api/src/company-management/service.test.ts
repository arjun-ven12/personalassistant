import { describe, expect, it, vi } from "vitest";

import { CompanyManagementService } from "./service.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "10000000-0000-4000-8000-000000000002";

const dependencies = () => {
  const savedHistory: unknown[] = [];
  return {
    savedHistory,
    companies: { findCompany: vi.fn(() => Promise.resolve({ id: companyId, name: "Nova" })) },
    companyData: { dashboard: vi.fn(() => Promise.resolve({ sources: [], datasets: [], pipelines: [], recentRuns: [], metadataEntities: [], glossary: [], metrics: [], integrations: [], memory: { byType: {}, total: 0 } })) },
    objectives: { dashboard: vi.fn(() => Promise.resolve({ summary: { total: 0, active: 0, atRisk: 0, blocked: 0, completed: 0 }, objectives: [], goals: [], projects: [], metrics: [], plans: [], events: [], capabilityRequests: [], observations: [], invariants: { objectiveGrantsAuthority: false, creditsGrantAuthority: false, executionUsesWorkforceScheduler: true, planningUsesExecutiveBrain: true } })) },
    executiveStore: {
      listPlans: vi.fn(() => Promise.resolve([])), listKpis: vi.fn(() => Promise.resolve([])), listDecisions: vi.fn(() => Promise.resolve([])), listHistory: vi.fn(() => Promise.resolve(savedHistory.map((item) => item))),
      saveHistory: vi.fn((item) => { savedHistory.push(item); return Promise.resolve(); }),
    },
    workforce: { graph: vi.fn(() => Promise.resolve({ organization: null, departments: [], nodes: [], edges: [], summary: { registered: 0, active: 0, dormant: 0, suspended: 0, departments: 0, memoryScopes: 0, capabilityProfiles: 0, aggregateCredits: 0, averageReputation: 0 }, bootstrapAvailable: true, importPreview: {}, runtime: {} })) },
    economy: { dashboard: vi.fn(() => Promise.resolve({ overview: { reservedCredits: 0, availableCredits: 0 } })) },
    portfolio: { dashboard: vi.fn(() => Promise.resolve({
      companies: [{ companyId, companyName: "Nova", companyStatus: "ACTIVE", health: [
        { dimension: "BUSINESS", state: "UNKNOWN", confidence: 0.1, evidence: ["No metrics."] },
        { dimension: "DATA", state: "WARNING", confidence: 0.9, evidence: ["Pipeline failed."] },
        { dimension: "SYSTEM", state: "HEALTHY", confidence: 0.9, evidence: ["No runtime errors."] },
        { dimension: "AI", state: "HEALTHY", confidence: 0.9, evidence: ["AI stable."] },
      ], metrics: [], dataAlerts: 1, systemIncidents: 0, aiSpendCredits: 0, aiSuccessRate: 1, integrationHealth: "UNAVAILABLE" }],
      portfolioMetrics: [],
    })) },
  };
};

describe("CompanyManagementService", () => {
  it("classifies stale/pipeline evidence as a data problem without fabricating forecasts", async () => {
    const deps = dependencies();
    const service = new CompanyManagementService(deps.companies as never, deps.companyData as never, deps.objectives as never, deps.executiveStore as never, deps.workforce as never, deps.economy as never, deps.portfolio as never, undefined, () => new Date("2026-09-02T00:00:00.000Z"));
    const dashboard = await service.dashboard(ownerId, companyId);
    expect(dashboard.health).toBe("WATCH");
    expect(dashboard.diagnoses.map((item) => item.category)).toContain("DATA_QUALITY");
    expect(dashboard.diagnoses.map((item) => item.category)).not.toContain("BUSINESS_PERFORMANCE");
    expect(dashboard.forecasts).toEqual([]);
  });

  it("persists a bounded advisory review in the existing Executive history", async () => {
    const deps = dependencies();
    const audit = vi.fn(() => Promise.resolve());
    const service = new CompanyManagementService(deps.companies as never, deps.companyData as never, deps.objectives as never, deps.executiveStore as never, deps.workforce as never, deps.economy as never, deps.portfolio as never, audit, () => new Date("2026-09-02T00:00:00.000Z"));
    const review = await service.generateReview(ownerId, companyId, { cadence: "WEEKLY", period: "2026-W36" }, { requestId: "test", ipAddress: "127.0.0.1" });
    expect(review.executed).toBe(false);
    expect(review.risks[0]?.category).toBe("DATA_QUALITY");
    expect(deps.executiveStore.saveHistory).toHaveBeenCalledOnce();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "MANAGEMENT_REVIEW_GENERATED", companyId }));
  });

  it("binds an approved target to the canonical metric and produces a bounded likely-miss forecast", async () => {
    const deps = dependencies();
    const metricId = "10000000-0000-4000-8000-000000000003";
    const sourceEntityId = "10000000-0000-4000-8000-000000000004";
    const metric = {
      definition: { id: metricId, ownerId, companyId, canonicalKey: "QUALIFIED_LEADS", name: "Qualified Leads", description: "Canonical qualified leads.", formula: "count(qualified leads)", sourceEntityIds: [sourceEntityId], dimensions: ["date"], timeField: "created_at", unit: "leads", ownerDepartmentId: null, definitionSource: "OWNER", version: 1, status: "ACTIVE", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
      observation: { id: "10000000-0000-4000-8000-000000000005", ownerId, companyId, metricId, metricVersion: 1, value: "100", dimensions: { period: "CURRENT" }, observedAt: "2026-09-01T00:00:00.000Z", sourceUpdatedAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-09-03T00:00:00.000Z", provenanceEntityIds: [sourceEntityId], qualityState: "VERIFIED" },
      freshness: "CURRENT",
      lineage: [],
    };
    deps.companyData.dashboard.mockResolvedValue({ sources: [], datasets: [], pipelines: [], recentRuns: [], metadataEntities: [], glossary: [], metrics: [metric], integrations: [{ status: "READY" }], memory: { byType: {}, total: 0 } } as never);
    deps.executiveStore.listKpis.mockResolvedValue([{ id: "10000000-0000-4000-8000-000000000006", ownerId, goalId: null, name: "Qualified Leads", unit: "leads", target: 125, currentValue: 100, direction: "HIGHER_IS_BETTER", period: "CURRENT", source: "MANUAL", confidence: 1, updatedAt: "2026-09-01T00:00:00.000Z" }] as never);
    deps.portfolio.dashboard.mockResolvedValue({ companies: [{ companyId, companyName: "Nova", companyStatus: "ACTIVE", health: [{ dimension: "BUSINESS", state: "WARNING", confidence: 0.9, evidence: ["Metric down."] }, { dimension: "DATA", state: "HEALTHY", confidence: 0.9, evidence: ["Fresh."] }, { dimension: "SYSTEM", state: "HEALTHY", confidence: 0.9, evidence: ["Healthy."] }, { dimension: "AI", state: "HEALTHY", confidence: 0.9, evidence: ["Stable."] }], metrics: [], dataAlerts: 0, systemIncidents: 0, aiSpendCredits: 0, aiSuccessRate: 1, integrationHealth: "HEALTHY" }], portfolioMetrics: [{ ownerId, companyId, companyName: "Nova", canonicalMetricKey: "QUALIFIED_LEADS", metricId, metricVersion: 1, definitionFingerprint: "a".repeat(64), value: "100", previousValue: "90", delta: 10, deltaPercent: 0.111, trend: "UP", unit: "leads", period: "CURRENT", dimensions: ["date"], freshness: "FRESH", quality: "VERIFIED", observedAt: "2026-09-01T00:00:00.000Z", lineageRefs: [sourceEntityId] }] } as never);
    const service = new CompanyManagementService(deps.companies as never, deps.companyData as never, deps.objectives as never, deps.executiveStore as never, deps.workforce as never, deps.economy as never, deps.portfolio as never, undefined, () => new Date("2026-09-02T00:00:00.000Z"));
    const dashboard = await service.dashboard(ownerId, companyId);
    expect(dashboard.kpis[0]).toMatchObject({ canonicalKey: "QUALIFIED_LEADS", target: 125, status: "AT_RISK", freshness: "CURRENT" });
    expect(dashboard.forecasts[0]).toMatchObject({ method: "LINEAR_TREND", outcome: "LIKELY_MISS", confidence: "MEDIUM" });
    expect(dashboard.diagnoses.map((item) => item.category)).toContain("BUSINESS_PERFORMANCE");
  });
});
