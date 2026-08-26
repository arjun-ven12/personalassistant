import { describe, expect, it } from "vitest";

import { WorkforceGraphResponseSchema, type WorkforceGraphResponse } from "@alexa-control/shared";
import { layoutWorkforceGraph } from "./agentWorkforceLayout.js";

const buildGraph = (agentCount: number): WorkforceGraphResponse => WorkforceGraphResponseSchema.parse({
  organization: null,
  departments: [],
  nodes: [
    { id: "alexa_governor", kind: "GOVERNOR", label: "Alexa Governor", subtitle: "Owner governed", parentId: null, departmentId: null, status: "ACTIVE", reputation: null, credits: null, source: "ALEXA_NATIVE", childCount: 10 },
    ...Array.from({ length: 10 }, (_, index) => ({ id: `department:${index}`, kind: "DEPARTMENT" as const, label: `Department ${index}`, subtitle: "Bounded department", parentId: "alexa_governor", departmentId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, status: "ACTIVE" as const, reputation: null, credits: null, source: "ALEXA_NATIVE" as const, childCount: Math.ceil(agentCount / 10) })),
    ...Array.from({ length: agentCount }, (_, index) => { const department = index % 10; return { id: `agent_${index}`, kind: "AGENT" as const, label: `Agent ${index}`, subtitle: "Specialist", parentId: `department:${department}`, departmentId: `00000000-0000-4000-8000-${String(department).padStart(12, "0")}`, status: "DORMANT" as const, reputation: 50, credits: 0, source: "ALEXA_NATIVE" as const, childCount: 0 }; }),
  ],
  edges: [],
  summary: { registered: agentCount, active: 0, dormant: agentCount, suspended: 0, departments: 10, memoryScopes: agentCount, capabilityProfiles: 8, aggregateCredits: 0, averageReputation: 50 },
  bootstrapAvailable: false,
  importPreview: { sourceDefinitionsScanned: 68, importedAsAgents: 64, alexaNativeAgentsAdded: 40, finalActualRegisteredAgents: agentCount, convertedToSkills: 0, convertedToWorkflows: 0, convertedToReviewers: 2, duplicatesRejected: 2, activeDuringIdle: 0, dormantDuringIdle: agentCount, sourceCommit: "d8409a4b0813771235555e32e3d8046a73988bfa", sourceLicense: "MIT", externalRuntimeActive: false, providerCallsDuringImport: 0, runtimeActivationsDuringImport: 0 },
  runtime: { modelInstancesFromRegistration: 0, workerProcessesFromRegistration: 0, providerCallsFromRegistration: 0, sharedAIRouter: true },
});

describe("layoutWorkforceGraph", () => {
  it.each([100, 150, 250])("lays out %i dormant agents within a bounded UI budget", (agentCount) => {
    const graph = buildGraph(agentCount);
    const started = performance.now();
    const result = layoutWorkforceGraph(graph);
    const elapsed = performance.now() - started;
    expect(result.nodes).toHaveLength(agentCount + 11);
    expect(new Set(result.nodes.map((node) => `${node.x}:${node.y}`)).size).toBe(result.nodes.length);
    expect(elapsed).toBeLessThan(1_000);
  });
});
