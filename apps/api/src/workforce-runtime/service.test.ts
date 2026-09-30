import { describe, expect, it, vi } from "vitest";

import type { AgentEconomyService } from "../agent-economy/service.js";
import type { AgentWorkforceService } from "../agent-workforce/service.js";
import type { AgentOsService } from "../agents/os-service.js";
import { InMemoryAgentStore } from "../agents/store.js";
import type { AIRouterService } from "../ai/router/service.js";
import type { CapabilityStudioService } from "../capability-studio/service.js";
import type { ExternalHarvestService } from "../external-harvest/service.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { WorkforceRuntimeService } from "./service.js";
import { InMemoryWorkforceRuntimeStore } from "./store.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const departmentId = "20000000-0000-4000-8000-000000000001";
const organizationId = "30000000-0000-4000-8000-000000000001";
const at = "2026-08-25T00:00:00.000Z";

const agent = (id: string, role: "engineering_manager"|"coding"|"review" = "coding", department = departmentId, parent: string|null = "engineering_manager") => ({
  schemaVersion: "1" as const, id, ownerId, role, displayName: id, version: "1.0.0", status: "available" as const,
  capabilities: role === "review" ? ["security.review"] : ["workspace.read","patch.proposal"], supportedTasks: ["typescript","review"], configuration: {}, createdAt: at, updatedAt: at, healthSummary: "ready",
  workforce: { organizationId, departmentId: department, parentAgentId: parent, managerAgentId: parent, specialization: "TypeScript", description: "bounded specialist", skills: ["typescript","implementation"], memoryScopeId: `agent:${id}`, departmentMemoryScopeId: `department:${department}`, organizationMemoryScopeId: `organization:${organizationId}`, capabilityProfileId: `profile:${id}`, missingCapabilities: [], modelPolicyId: "BALANCED" as const, activationPolicyId: "lazy", executionPlacement: "REMOTE_ALLOWED" as const, evaluationProfile: ["verified_outcome"], source: "ALEXA_NATIVE" as const, sourcePath: null, sourceVersion: "test", license: null, importedAt: at },
});

const setup = (options: { withObjectiveSpecialistFactory?: boolean } = {}) => {
  const agents = new InMemoryAgentStore();
  agents.upsertAgent(agent("engineering_manager","engineering_manager",departmentId,null));
  agents.upsertAgent(agent("backend_agent"));
  agents.upsertAgent(agent("review_agent","review"));
  const accounts = ["engineering_manager","backend_agent","review_agent"].map((agentId) => ({ ownerId, agentId, availableCredits: 100, reservedCredits: 0, lifetimeEarned: 100, lifetimeSpent: 0, reputation: agentId === "backend_agent" ? 90 : 70, economyStatus: "DORMANT" as const, organizationId, departmentId, parentAgentId: null, memoryScopeId: `agent:${agentId}`, capabilityProfileId: `profile:${agentId}`, modelPolicyId: "BALANCED", activationPolicyId: "lazy", createdAt: at, updatedAt: at }));
  const enrollAccount = (agentId: string) => {
    let account = accounts.find((item) => item.agentId === agentId);
    if (!account) {
      account = { ownerId, agentId, availableCredits: 0, reservedCredits: 0, lifetimeEarned: 0, lifetimeSpent: 0, reputation: 50, economyStatus: "DORMANT" as const, organizationId, departmentId, parentAgentId: null, memoryScopeId: `agent:${agentId}`, capabilityProfileId: `profile:${agentId}`, modelPolicyId: "BALANCED", activationPolicyId: "lazy", createdAt: at, updatedAt: at };
      accounts.push(account);
    }
    return account;
  };
  const activations: string[] = []; const reservations: string[] = []; let routerCalls = 0; let osCalls = 0; let rewardCalls = 0; let sandboxCalls = 0;
  const economy = {
    dashboard: vi.fn(() => Promise.resolve({ overview: { activeAgents: activations.filter((item) => item.endsWith(":ACTIVE")).length, dormantAgents: accounts.length, suspendedAgents: 0 }, accounts, performance: [], ledger: [] })),
    reserve: vi.fn(({ agentId }: {agentId:string}) => { reservations.push(agentId); return Promise.resolve({ reservation: { id: "40000000-0000-4000-8000-000000000001" } }); }),
    settle: vi.fn(() => Promise.resolve({})), release: vi.fn(() => Promise.resolve({})), rewardVerified: vi.fn(() => { rewardCalls++; return Promise.resolve({}); }),
    allocate: vi.fn(({ agentId, amount }: {agentId:string;amount:number}) => { const account=enrollAccount(agentId); account.availableCredits+=amount; return Promise.resolve({account}); }),
  } as unknown as AgentEconomyService;
  const workforce = {
    setActivation: vi.fn((_owner:string,id:string,state:string) => { activations.push(`${id}:${state}`); return Promise.resolve({}); }),
    society: { dashboard: vi.fn(() => Promise.resolve({ organizations: [{ id: organizationId }], departments: [{ id: departmentId, name: "Sales", leadAgentId: "engineering_manager" }] })) },
    enrollGeneratedSpecialist: vi.fn((generated: {id:string}) => { enrollAccount(generated.id); return Promise.resolve(); }),
  } as unknown as AgentWorkforceService;
  const agentOs = {
    store: { listSessions: vi.fn(() => Promise.resolve([])) },
    startIsolatedDelegation: vi.fn(() => { osCalls++; return Promise.resolve({ session: { id: "50000000-0000-4000-8000-000000000001" } }); }),
    completeIsolatedDelegation: vi.fn(() => Promise.resolve({})),
  } as unknown as AgentOsService;
  const aiRouter = { executeStructured: vi.fn(() => { routerCalls++; return Promise.resolve({ outcome: "SUCCESS", structuredOutput: { summary: "Implemented bounded change.", confidence: 0.9, evidence: ["test:passed"] }, requestId: "60000000-0000-4000-8000-000000000001", providerId: "local", modelId: "shared", usage: { totalTokens: 800 } }); }) } as unknown as AIRouterService;
  const capabilityStudio = { createRequest: vi.fn(() => Promise.resolve({})) } as unknown as CapabilityStudioService;
  const externalHarvest = { executeDelegation: vi.fn(() => { sandboxCalls++; return Promise.resolve({ status: "COMPLETE", sessionId: "50000000-0000-4000-8000-000000000002", summary: "Generated and ran one bounded test.", confidence: .92, artifacts: [{ name: "generated.test.cjs", kind: "PROPOSED_TEST", content: "" }], tests: { status: "PASSED" }, ai: { requestId: "61000000-0000-4000-8000-000000000001", providerId: "local", modelId: "shared" } }); }) } as unknown as ExternalHarvestService;
  const agentFactory = options.withObjectiveSpecialistFactory ? {
    capabilities: vi.fn(() => Promise.resolve([])),
    createObjectiveSpecialist: vi.fn(() => {
      const generated = { ...agent("generated_lead"), displayName: "Lead Research Specialist", supportedTasks: ["lead_generation", "research"], workforce: { ...agent("generated_lead").workforce, specialization: "Lead research", skills: ["lead_generation", "fitness", "research"] } };
      agents.upsertAgent(generated);
      return { agent: generated, dynamicAgent: null };
    }),
  } : undefined;
  const audit = vi.fn(() => Promise.resolve()) as GovernanceAuditWriter;
  const service = new WorkforceRuntimeService(new InMemoryWorkforceRuntimeStore(),agents,workforce,economy,agentOs,externalHarvest,aiRouter,capabilityStudio,agentFactory as never,audit,() => new Date(at));
  return { service, agents, accounts, activations, reservations, counts: () => ({ routerCalls, osCalls, rewardCalls, sandboxCalls }) };
};

const create = (service: WorkforceRuntimeService, body: Record<string,unknown>) => service.createTask({ ownerId, body: { title: "Implement endpoint", objective: "Implement and verify a bounded TypeScript endpoint.", requiredSkills: ["typescript"], requiredCapabilities: ["workspace.read"], economicBudget: 10, ...body }, requestId: "request", ipAddress: "127.0.0.1" });

describe("WorkforceRuntimeService", () => {
  it("rejects duplicate dispatch and late model output after persisted cancellation", async () => {
    const { service } = setup();
    const { task } = await create(service, {});
    let finish!: () => void;
    let started!: () => void;
    const running = new Promise<void>((resolve) => { started = resolve; });
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const route = service.aiRouter.executeStructured.bind(service.aiRouter);
    vi.spyOn(service.aiRouter, "executeStructured").mockImplementationOnce(async (...args) => {
      started();
      await gate;
      return route(...args);
    });
    const result = service.execute(ownerId, task.id, "first", "internal");
    await running;
    await expect(service.execute(ownerId, task.id, "duplicate", "internal")).rejects.toMatchObject({ code: "TASK_EXECUTION_LEASE_HELD" });
    await service.store.cancelExecution(ownerId, task.id);
    finish();
    await expect(result).rejects.toMatchObject({ code: "WORKFORCE_LEASE_LOST" });
    expect((await service.store.findTask(ownerId, task.id))?.status).toBe("CANCELLED");
    const settle = vi.spyOn(service.economy, "settle");
    expect(settle).not.toHaveBeenCalled();
  });

  it("omits unsupported provider URI formats while retaining local URL validation", async () => {
    const { service } = setup();
    const route = vi.spyOn(service.aiRouter, "executeStructured");
    const { task } = await create(service, {});
    await service.execute(ownerId, task.id, "schema", "internal");
    const request = route.mock.calls[0]![0];
    expect(JSON.stringify(request.jsonSchema)).not.toContain('"format":"uri"');
    expect(request.schema.safeParse({
      summary: "Research", confidence: .9, evidence: [], verification: null,
      leads: [{ companyName: "Example", website: "not-a-url", description: "Example", outreachReason: "Example", sourceUrls: ["https://example.com"] }],
    }).success).toBe(false);
  });

  it.each([null, { status: "FAIL", reason: "Requested comparison is missing." }, { status: "PASS", reason: "Required comparison and recommendation are present." }])("requires an explicit passing objective review: %j", async (verification) => {
    const { service, agents } = setup();
    const reviewer = agent("review_agent", "review");
    agents.upsertAgent({ ...reviewer, workforce: { ...reviewer.workforce, skills: ["review"] } });
    vi.spyOn(service.aiRouter, "executeStructured").mockResolvedValueOnce({
      outcome: "SUCCESS", structuredOutput: { summary: "Review result", confidence: .9, evidence: [], leads: [], verification },
      requestId: crypto.randomUUID(), providerId: "local", modelId: "shared", usage: { totalTokens: 100 },
    } as never);
    const { task } = await create(service, { inputs: { objectiveExecutionId: crypto.randomUUID() }, requiredSkills: ["review"], requiredCapabilities: ["security.review"] });
    const result = await service.execute(ownerId, task.id, "review", "internal");
    expect(result.task.status).toBe(verification?.status === "PASS" ? "COMPLETED" : "FAILED");
    if (verification?.status !== "PASS") expect(result.task.failureCode).toBe("OBJECTIVE_VERIFICATION_FAILED");
    expect(result.task.aiRequestId).not.toBeNull();
    expect(result.task.actualCost).toBeGreaterThan(0);
  });

  it("preserves completed execution when downstream lifecycle propagation fails", async () => {
    const { service, counts } = setup();
    const { task } = await create(service, {});
    service.setLifecycleSink({ handleWorkforceTaskChanged: (changed) => {
      if (changed.status === "COMPLETED") return Promise.reject(new Error("downstream unavailable"));
      return Promise.resolve();
    } });
    await expect(service.execute(ownerId, task.id, "request", "127.0.0.1")).rejects.toThrow("downstream unavailable");
    const resumed = await service.execute(ownerId, task.id, "retry", "127.0.0.1");
    expect(resumed.task.status).toBe("COMPLETED");
    expect(resumed.task.completionProvenance?.completionType).toBe("EXECUTED");
    expect(counts().routerCalls).toBe(1);
  });

  it("reloads dependency evidence and attaches executed results idempotently", async () => {
    const { service } = setup();
    const inputs = { objectiveExecutionId: crypto.randomUUID() };
    const { task: source } = await create(service, { inputs });
    const { task: target } = await create(service, { inputs });
    const completed = (await service.execute(ownerId, source.id, "request", "127.0.0.1")).task;
    const receipt = { sourceUrl: "https://example.test/source", retrievedAt: "2026-08-26T10:00:00.000Z", providerId: "openai", modelRequestId: "60000000-0000-4000-8000-000000000001", tool: "web.research" as const };
    await service.store.saveTask({ ...completed, webSearchCallCount: 1, retrievedSourceEvidence: [receipt], verifiedLeads: [{ companyName: "Example", website: "https://example.test", description: "Source-backed subject", outreachReason: "Relevant", sourceUrls: [receipt.sourceUrl] }] });
    await service.attachDependencyEvidence(ownerId, target.id, { ...completed, resultSummary: "forged summary" });
    const updated = await service.attachDependencyEvidence(ownerId, target.id, completed);
    expect(updated.inputs.previousTaskResults).toHaveLength(1);
    expect(updated.inputs.previousTaskResults).toEqual([expect.objectContaining({ summary: completed.resultSummary })]);
    expect(updated.inputs.previousTaskResults).toEqual([expect.objectContaining({ retrievalProvenance: { sourceCount: 1, webSearchCallCount: 1, sources: [receipt] } })]);
    const { task: other } = await create(service, { inputs: { objectiveExecutionId: crypto.randomUUID() } });
    await expect(service.attachDependencyEvidence(ownerId, other.id, completed)).rejects.toMatchObject({ code: "DEPENDENCY_EVIDENCE_INVALID" });
    await expect(service.attachDependencyEvidence(ownerId, target.id, { ...target, status: "COMPLETED", completionProvenance: completed.completionProvenance })).rejects.toMatchObject({ code: "DEPENDENCY_EVIDENCE_INVALID" });
  });

  it("reuses workforce skill, capability, reputation, calibration, availability, workload and cost scoring for engineering candidates", async () => {
    const { service } = setup();
    const scores = await service.rankEngineeringCandidates({
      ownerId,
      companyId: organizationId,
      objectiveId: crypto.randomUUID(),
      taskType: "BACKEND",
      role: "BACKEND_ENGINEER",
      skills: ["typescript", "implementation"],
      capabilities: ["workspace.read"],
      riskLevel: "MEDIUM",
      eligibleAgentDefinitionIds: ["backend_agent", "review_agent"],
    });
    expect(scores.map((score) => score.agentId)).toEqual([
      "backend_agent",
      "review_agent",
    ]);
    expect(scores[0]).toMatchObject({
      capabilityFit: 1,
      availability: 1,
      costEfficiency: 0.5,
    });
    expect(scores[0]!.reputation).toBeGreaterThan(scores[1]!.reputation);
  });

  it("selects one funded specialist, activates lazily, routes through shared AI, settles, and returns dormant", async () => {
    const { service, activations, reservations, counts } = setup();
    const { task } = await create(service, { createdByAgentId: "engineering_manager" });
    const result = await service.execute(ownerId,task.id,"request","127.0.0.1");
    expect(result.task).toMatchObject({ assignedAgentId: "backend_agent", status: "COMPLETED", providerId: "local", modelId: "shared" });
    expect(reservations).toEqual(["backend_agent"]); expect(counts()).toEqual({ routerCalls: 1, osCalls: 1, rewardCalls: 0, sandboxCalls: 0 });
    expect(activations).toEqual(["backend_agent:ACTIVE","backend_agent:DORMANT"]);
    expect(result.task.completionProvenance).toMatchObject({ completionType: "EXECUTED", agentSessionId: "50000000-0000-4000-8000-000000000001", modelRequestId: "60000000-0000-4000-8000-000000000001" });
  });

  it("does not accept an owner attestation as autonomous objective execution", async () => {
    const { service } = setup();
    const task = (await create(service, { inputs: { objectiveExecutionId: crypto.randomUUID() } })).task;
    await expect(service.complete(ownerId, task.id, { resultSummary: "Done", resultConfidence: 1, actualCost: 0 }, "request", "127.0.0.1"))
      .rejects.toMatchObject({ code: "AUTONOMOUS_OBJECTIVE_MANUAL_COMPLETION_DENIED" });
    expect((await service.store.findTask(ownerId, task.id))?.status).toBe("QUEUED");
  });

  it("dispatches reserved objective work into a real Agent OS and AIRouter execution", async () => {
    const { service, counts } = setup();
    const { task } = await create(service, { createdByAgentId: "engineering_manager" });
    const started = await service.dispatch(ownerId, task.id, "objective-dispatch", "internal");
    expect(started.task).toMatchObject({ status: "RUNNING", startedAt: at });
    await vi.waitFor(async () => {
      expect((await service.store.findTask(ownerId, task.id))?.status).toBe("COMPLETED");
    });
    expect(counts()).toMatchObject({ routerCalls: 1, osCalls: 1 });
  });

  it("uses a fresh economic reservation after a failed task is retried", async () => {
    const { service } = setup();
    const { task } = await create(service, { createdByAgentId: "engineering_manager", maxRetries: 0 });
    const reserve = vi.spyOn(service.economy, "reserve");
    vi.spyOn(service.aiRouter, "executeStructured").mockRejectedValueOnce(new Error("Temporary provider failure"));
    await expect(service.execute(ownerId, task.id, "first-attempt", "internal")).rejects.toThrow("Temporary provider failure");
    expect((await service.store.findTask(ownerId, task.id))?.status).toBe("FAILED");

    await service.retryFailedUnstarted(ownerId, task.id, "owner-retry", "internal");
    await vi.waitFor(async () => expect((await service.store.findTask(ownerId, task.id))?.status).toBe("COMPLETED"));
    expect(reserve.mock.calls.map(([request]) => request.idempotencyKey)).toEqual([
      `workforce-task:${task.id}:1`,
      `workforce-task:${task.id}:2`,
    ]);
  });

  it("funds an existing research-capable specialist from a bounded objective task before proposing a new agent", async () => {
    const { service, agents, accounts } = setup();
    const researcher = agent("backend_agent");
    agents.upsertAgent({
      ...researcher,
      capabilities: ["web.research"],
      supportedTasks: ["research"],
      workforce: { ...researcher.workforce, skills: ["research", "evidence_synthesis"], specialization: "Research" },
    });
    accounts.find((account) => account.agentId === "backend_agent")!.availableCredits = 0;
    const objectiveId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const { task } = await create(service, {
      createdByAgentId: null,
      title: "Deliver sourced AI company list",
      objective: "Produce sourced research on five AI companies and their outreach relevance.",
      inputs: { objectiveExecutionId: objectiveId, projectId, executionKind: "EXTERNAL_RESEARCH" },
      requiredSkills: ["research", "evidence_synthesis"],
      requiredCapabilities: ["web.research"],
    });
    await service.store.saveTask({ ...task, idempotencyKey: `objective:${objectiveId}:project:${projectId}`, status: "WAITING" });

    const allocate = vi.spyOn(service.economy, "allocate");
    const scheduled = await service.schedule(ownerId, task.id, "objective-dispatch", "internal");
    expect(scheduled.task).toMatchObject({ status: "RESERVED", assignedAgentId: "backend_agent" });
    expect(allocate.mock.calls[0]?.[0]).toMatchObject({
      ownerId,
      agentId: "backend_agent",
      amount: 10,
      reasonCode: "OWNER_OBJECTIVE_EXISTING_SPECIALIST_TASK_RESERVE",
    });
  });

  it.each([true,false])("retains long retrieved HTTPS sources including lead citations (top-level evidence: %s)", async (topLevelEvidence) => {
    const { service, agents } = setup();
    const researcher = agent("backend_agent");
    agents.upsertAgent({
      ...researcher,
      capabilities: ["web.research"],
      supportedTasks: ["research"],
      workforce: { ...researcher.workforce, skills: ["research", "evidence_synthesis"], specialization: "Research" },
    });
    const sourceUrl = `https://example.com/research/${"source-".repeat(25)}`;
    const route = vi.spyOn(service.aiRouter, "executeStructured").mockResolvedValueOnce({
      outcome: "SUCCESS",
      structuredOutput: {
        summary: "One company verified.", confidence: 0.9, evidence: topLevelEvidence ? [sourceUrl] : [],
        leads: [
          { companyName: "Example AI", website: "https://example.com", description: "AI tools", outreachReason: "Relevant AI work", sourceUrls: [sourceUrl] },
          { companyName: "Unretrieved", website: "https://unretrieved.test", description: "Unverified", outreachReason: "Unverified", sourceUrls: ["http://unretrieved.test"] },
        ],
      },
      providerMetadata: { webSearchCallCount: 1, sourceUrls: [sourceUrl, "http://different.test"] },
      requestId: crypto.randomUUID(), providerId: "openai", modelId: "gpt-5.6-luna", usage: { totalTokens: 800 },
    } as never);
    const { task } = await create(service, {
      title: "Research AI companies", objective: "Research one current AI company with a source.",
      inputs: { executionKind: "EXTERNAL_RESEARCH" },
      requiredSkills: ["research", "evidence_synthesis"],
      requiredCapabilities: ["web.research"],
    });
    const result = await service.execute(ownerId, task.id, "research", "internal");
    expect(result.task.status).toBe("COMPLETED");
    expect(route.mock.calls[0]?.[0]).toMatchObject({ timeoutMs: 120_000 });
    expect(result.task.retrievedSourceUrls).toEqual([sourceUrl]);
    expect(result.task.retrievedSourceEvidence).toEqual([expect.objectContaining({sourceUrl,providerId:"openai",tool:"web.research",modelRequestId:result.task.aiRequestId})]);
    expect(result.task.verifiedLeads).toHaveLength(1);
    expect(result.task.evidenceRefs).toContainEqual(expect.stringMatching(/^source-sha256:[a-f0-9]{64}$/));
  });

  it("bounds the Agent OS summary without discarding a valid longer workforce result", async () => {
    const { service } = setup();
    const summary = "Detailed verified analysis. ".repeat(110);
    vi.spyOn(service.aiRouter, "executeStructured").mockResolvedValueOnce({
      outcome: "SUCCESS",
      structuredOutput: { summary, confidence: 0.9, evidence: [], leads: [] },
      requestId: crypto.randomUUID(), providerId: "openai", modelId: "gpt-5.6-luna", usage: { totalTokens: 800 },
    } as never);
    const complete = vi.spyOn(service.agentOs, "completeIsolatedDelegation");
    const { task } = await create(service, { createdByAgentId: "engineering_manager" });
    const result = await service.execute(ownerId, task.id, "long-result", "internal");
    expect(result.task.status).toBe("COMPLETED");
    expect(result.task.resultSummary).toBe(summary);
    expect(complete.mock.calls[0]?.[0].outputSummary).toHaveLength(2_000);
  });

  it("bounds delegation context when a verifier inherits many research references", async () => {
    const { service } = setup();
    vi.spyOn(service.aiRouter, "executeStructured").mockResolvedValueOnce({
      outcome: "SUCCESS",
      structuredOutput: { summary: "Evidence reviewed.", confidence: 0.9, evidence: [], leads: [] },
      requestId: crypto.randomUUID(), providerId: "openai", modelId: "gpt-5.6-luna", usage: { totalTokens: 800 },
    } as never);
    const start = vi.spyOn(service.agentOs, "startIsolatedDelegation");
    const { task } = await create(service, {
      createdByAgentId: "engineering_manager",
      evidenceRefs: Array.from({ length: 34 }, (_, index) => `https://example.com/research/${index}/${"source".repeat(19)}`),
    });
    const result = await service.execute(ownerId, task.id, "many-references", "internal");
    expect(result.task.status).toBe("COMPLETED");
    expect(start.mock.calls[0]?.[0].contextSummary.length).toBeLessThan(2_000);
    expect(start.mock.calls[0]?.[0].contextSummary).toContain("34 evidence references");
  });

  it("does not report RUNNING before Agent OS creates an execution session", async () => {
    const { service } = setup();
    const { task } = await create(service, { createdByAgentId: "engineering_manager" });
    await service.schedule(ownerId, task.id, "request", "127.0.0.1");
    let releaseSession: ((value: unknown) => void) | undefined;
    vi.spyOn(service.agentOs, "startIsolatedDelegation").mockImplementation(() => new Promise((resolve) => { releaseSession = resolve as (value: unknown) => void; }));
    const dispatched = service.dispatch(ownerId, task.id, "request", "127.0.0.1");
    await vi.waitFor(() => expect(releaseSession).toBeDefined());
    expect((await service.store.findTask(ownerId, task.id))?.status).toBe("RESERVED");
    expect((await service.dashboard(ownerId)).summary.running).toBe(0);
    expect((await service.dashboard(ownerId)).activeExecutionTaskIds).toContain(task.id);
    releaseSession?.({ session: { id: "50000000-0000-4000-8000-000000000001" } });
    expect((await dispatched).task.status).toBe("RUNNING");
  });

  it("prevents child budget laundering and bounds hierarchy depth", async () => {
    const { service } = setup();
    const root = (await create(service,{ assignedAgentId: "backend_agent", createdByAgentId: "engineering_manager", economicBudget: 10 })).task;
    await service.store.saveTask({ ...root, status: "RUNNING" });
    await create(service,{ parentTaskId: root.id, createdByAgentId: "backend_agent", economicBudget: 7 });
    await expect(create(service,{ parentTaskId: root.id, createdByAgentId: "backend_agent", economicBudget: 4 })).rejects.toMatchObject({ code: "CHILD_BUDGET_EXCEEDS_PARENT" });
    await expect(create(service,{ parentTaskId: root.id, createdByAgentId: "backend_agent", economicBudget: 1, memoryScopeRefs: ["owner:private"] })).rejects.toMatchObject({ code: "CHILD_MEMORY_SCOPE_EXPANSION" });
  });

  it("denies arbitrary cross-department command authority", async () => {
    const { service, agents } = setup();
    agents.upsertAgent(agent("sales_agent","coding","70000000-0000-4000-8000-000000000001",null));
    await expect(create(service,{ assignedAgentId: "sales_agent", createdByAgentId: "backend_agent" })).rejects.toMatchObject({ code: "DELEGATION_AUTHORITY_DENIED" });
  });

  it("propagates cancellation across a bounded root task tree", async () => {
    const { service } = setup(); const root = (await create(service,{ createdByAgentId: "engineering_manager" })).task;
    await service.store.saveTask({ ...root, status: "RUNNING" });
    const child = (await create(service,{ parentTaskId: root.id, createdByAgentId: "engineering_manager", economicBudget: 2 })).task;
    const dashboard = await service.cancel(ownerId,root.id,"request","127.0.0.1");
    expect(dashboard.tasks.find((item) => item.id === root.id)?.status).toBe("CANCELLED");
    expect(dashboard.tasks.find((item) => item.id === child.id)?.status).toBe("CANCELLED");
  });

  it("keeps 112 registered dormant identities metadata-only", async () => {
    const { service, agents, counts } = setup();
    for (let index=0; index<109; index++) agents.upsertAgent(agent(`dormant_${index}`));
    const dashboard = await service.dashboard(ownerId);
    expect(dashboard.summary.registered).toBe(112); expect(counts()).toEqual({ routerCalls: 0, osCalls: 0, rewardCalls: 0, sandboxCalls: 0 });
  });

  it("deduplicates child creation and result/review callbacks", async () => {
    const { service, counts } = setup();
    const root = (await create(service,{ createdByAgentId: "engineering_manager", economicBudget: 10 })).task;
    await service.store.saveTask({ ...root, status: "RUNNING" });
    const childInput = { parentTaskId: root.id, createdByAgentId: "engineering_manager", idempotencyKey: "child-request-001", economicBudget: 2 };
    const first = await create(service,childInput); const duplicate = await create(service,childInput);
    expect(duplicate.task.id).toBe(first.task.id);
    await service.store.saveTask({ ...first.task, status: "REVIEW_REQUIRED", assignedAgentId: "backend_agent", resultSummary: "done", resultConfidence: .9 });
    const reviewed = await service.review(ownerId,first.task.id,{ reviewerAgentId: "review_agent", verdict: "PASS", findings: [], evidenceRefs: ["test:pass"] },"request","127.0.0.1");
    const repeated = await service.review(ownerId,first.task.id,{ reviewerAgentId: "review_agent", verdict: "PASS", findings: [], evidenceRefs: ["test:pass"] },"request","127.0.0.1");
    expect(repeated.review.id).toBe(reviewed.review.id); expect(counts().rewardCalls).toBe(1);
  });

  it("creates a structured capability request and waits instead of inventing authority", async () => {
    const { service } = setup();
    const task = (await create(service,{ createdByAgentId: "engineering_manager", requiredCapabilities: ["hubspot.assign_lead"] })).task;
    await expect(service.schedule(ownerId,task.id,"request","127.0.0.1")).rejects.toMatchObject({ code: "CAPABILITY_MISSING" });
    const dashboard = await service.dashboard(ownerId);
    expect(dashboard.tasks.find((item) => item.id === task.id)?.status).toBe("WAITING");
    expect(dashboard.messages.some((item) => item.taskId === task.id && item.type === "CAPABILITY_REQUEST")).toBe(true);
  });

  it("proposes a bounded specialist instead of blocking when capabilities exist but no worker is a strong match", async () => {
    const { service } = setup();
    const task = (await create(service,{ createdByAgentId: "engineering_manager", title: "Build fitness lead list", objective: "Find 100 Singapore fitness companies for outreach.", requiredSkills: ["lead_generation","fitness"], requiredCapabilities: ["workspace.read"] })).task;
    await expect(service.schedule(ownerId,task.id,"request","127.0.0.1")).rejects.toMatchObject({ code: "SPECIALIST_APPROVAL_PENDING" });
    const dashboard = await service.dashboard(ownerId);
    const waiting = dashboard.tasks.find((item) => item.id === task.id);
    expect(waiting?.status).toBe("WAITING");
    expect(waiting?.workforceGap?.decision).toBe("SPECIALIST_APPROVAL_PENDING");
    expect(waiting?.workforceGap?.proposal?.recommendation).toBe("REUSABLE");
    expect(dashboard.messages.some((item) => item.taskId === task.id && item.type === "PROPOSAL")).toBe(true);
  });

  it("funds and reserves the first bounded task for an owner-approved specialist", async () => {
    const { service } = setup({ withObjectiveSpecialistFactory: true });
    const task = (await create(service,{ createdByAgentId: "engineering_manager", title: "Build fitness lead list", objective: "Find 100 Singapore fitness companies for outreach.", requiredSkills: ["lead_generation","fitness"], requiredCapabilities: ["workspace.read"] })).task;
    await expect(service.schedule(ownerId,task.id,"request","127.0.0.1")).rejects.toMatchObject({ code: "SPECIALIST_APPROVAL_PENDING" });
    const proposal = (await service.dashboard(ownerId)).tasks.find((item) => item.id === task.id)?.workforceGap?.proposal;
    if (!proposal) throw new Error("Expected specialist proposal");
    const approved = await service.approveSpecialistCreation(ownerId,task.id,{ approved: true, proposalId: proposal.proposalId },"request","127.0.0.1");
    expect(approved.task).toMatchObject({ status: "RESERVED", assignedAgentId: "generated_lead" });
  });

  it("dispatches an objective specialist after approval instead of stopping at reservation", async () => {
    const { service, counts } = setup({ withObjectiveSpecialistFactory: true });
    const task = (await create(service,{ title: "Research AI companies", objective: "Research five AI companies with sources.", requiredSkills: ["lead_generation","fitness"], requiredCapabilities: ["workspace.read"], inputs: { objectiveExecutionId: crypto.randomUUID() } })).task;
    await expect(service.schedule(ownerId,task.id,"request","127.0.0.1")).rejects.toMatchObject({ code: "SPECIALIST_APPROVAL_PENDING" });
    const proposal = (await service.dashboard(ownerId)).tasks.find((item) => item.id === task.id)?.workforceGap?.proposal;
    if (!proposal) throw new Error("Expected specialist proposal");
    const started = await service.approveSpecialistCreation(ownerId,task.id,{ approved: true, proposalId: proposal.proposalId },"request","127.0.0.1");
    expect(started.task.status).toBe("RUNNING");
    await vi.waitFor(async () => expect((await service.store.findTask(ownerId,task.id))?.status).toBe("COMPLETED"));
    expect(counts()).toMatchObject({ routerCalls: 1, osCalls: 1 });
  });

  it("releases stale reservations that never started before matching new work", async () => {
    const { service } = setup();
    const old = (await create(service,{ idempotencyKey: "stale-task-001" })).task;
    await service.store.saveTask({ ...old, status: "RESERVED", assignedAgentId: "backend_agent", reservationId: crypto.randomUUID(), reservedCredits: 10, updatedAt: "2026-08-24T00:00:00.000Z" });
    const next = (await create(service,{ idempotencyKey: "next-task-001" })).task;
    await service.schedule(ownerId,next.id,"request","127.0.0.1");
    expect((await service.store.findTask(ownerId,old.id))?.status).toBe("RECOVERY_REVIEW_REQUIRED");
    expect((await service.store.findTask(ownerId,old.id))?.reservationId).toBeNull();
  });

  it("terminates message loops and enforces global active-task capacity", async () => {
    const { service } = setup(); const task = (await create(service,{ createdByAgentId: "engineering_manager" })).task;
    for (let index=0; index<39; index++) await service.sendMessage(ownerId,{ fromAgentId: "engineering_manager", toAgentId: "backend_agent", taskId: task.id, type: "STATUS_UPDATE", payload: { index } });
    await expect(service.sendMessage(ownerId,{ fromAgentId: "engineering_manager", toAgentId: "backend_agent", taskId: task.id, type: "STATUS_UPDATE", payload: {} })).rejects.toMatchObject({ code: "TASK_MESSAGE_LIMIT" });
    for (let index=0; index<6; index++) { const active = (await create(service,{ idempotencyKey: `active-task-${index}`, createdByAgentId: "engineering_manager" })).task; await service.store.saveTask({ ...active, status: "RUNNING", assignedAgentId: "backend_agent" }); }
    const queued = (await create(service,{ createdByAgentId: "engineering_manager" })).task;
    await expect(service.schedule(ownerId,queued.id,"request","127.0.0.1")).rejects.toMatchObject({ code: "WORKFORCE_CONCURRENCY_LIMIT" });
  });

  it("gives the next available scheduler slot to higher-priority queued work", async () => {
    const { service } = setup();
    const low = (await create(service,{ createdByAgentId: "engineering_manager", priority: "low" })).task;
    const high = (await create(service,{ createdByAgentId: "engineering_manager", priority: "high" })).task;
    await expect(service.schedule(ownerId,low.id,"request","127.0.0.1")).rejects.toMatchObject({ code: "HIGHER_PRIORITY_WORK_PENDING" });
    const scheduled = await service.schedule(ownerId,high.id,"request","127.0.0.1");
    expect(scheduled.task.id).toBe(high.id);
    expect(scheduled.task.status).toBe("RESERVED");
  });

  it("holds uncertain restart state for review without replaying model work", async () => {
    const { service, counts } = setup(); const task = (await create(service,{ createdByAgentId: "engineering_manager" })).task;
    await service.store.saveTask({ ...task, status: "RUNNING", assignedAgentId: "backend_agent" });
    const dashboard = await service.recover(ownerId,"request","127.0.0.1");
    expect(dashboard.tasks.find((item) => item.id === task.id)?.status).toBe("RECOVERY_REVIEW_REQUIRED");
    expect(counts()).toEqual({ routerCalls: 0, osCalls: 0, rewardCalls: 0, sandboxCalls: 0 });
  });

  it("blocks a stale started task after restart without replaying its model request", async () => {
    const { service, counts } = setup();
    const release = vi.spyOn(service.economy, "release");
    const task = (await create(service,{ createdByAgentId: "engineering_manager" })).task;
    await service.store.saveTask({
      ...task,
      status: "RUNNING",
      assignedAgentId: "backend_agent",
      reservationId: "40000000-0000-4000-8000-000000000001",
      reservedCredits: 5,
      startedAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
    });
    const dashboard = await service.dashboard(ownerId);
    expect(dashboard.tasks.find((item) => item.id === task.id)).toMatchObject({
      status: "FAILED",
      failureCode: "WORKER_CRASHED",
      reservationId: null,
    });
    expect(counts().routerCalls).toBe(0);
    expect(release).toHaveBeenCalledTimes(1);
    await service.dashboard(ownerId);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("recovers an expired preparation lease without treating ordinary queued work as crashed", async () => {
    const { service, counts } = setup();
    const queued = (await create(service, { createdByAgentId: "engineering_manager" })).task;
    const preparing = (await create(service, { createdByAgentId: "engineering_manager" })).task;
    const lease = await service.store.claimExecution(ownerId, preparing.id, "stopped-worker");
    expect(lease).toBeDefined();
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 61_000);
    try {
      const dashboard = await service.dashboard(ownerId);
      expect(dashboard.tasks.find((task) => task.id === preparing.id)).toMatchObject({ status: "FAILED", failureCode: "WORKER_CRASHED" });
      expect(dashboard.tasks.find((task) => task.id === queued.id)?.status).toBe("QUEUED");
      expect(dashboard.activeExecutionTaskIds).toEqual([]);
      expect(counts().routerCalls).toBe(0);
    } finally {
      clock.mockRestore();
    }
  });

  it("closes an orphaned Agent OS session without fabricating model evidence", async () => {
    const { service } = setup();
    const task = (await create(service,{ createdByAgentId: "engineering_manager" })).task;
    await service.store.saveTask({ ...task, status: "FAILED" });
    vi.spyOn(service.agentOs.store, "listSessions").mockResolvedValue([{
      id: "50000000-0000-4000-8000-000000000001",
      status: "running",
      startedAt: "2026-08-24T00:00:00.000Z",
      delegation: { delegationId: task.id, aiRequestId: null, providerId: null, modelId: null },
    } as never]);
    const complete = vi.spyOn(service.agentOs, "completeIsolatedDelegation");
    await service.dashboard(ownerId);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "50000000-0000-4000-8000-000000000001",
      errorCode: "WORKER_CRASHED",
      aiRequestId: null,
      providerId: null,
      modelId: null,
    }));
  });

  it("runs the development scenario through the existing bounded sandbox and stops for review", async () => {
    const { service, counts, activations } = setup();
    const task = (await create(service,{ createdByAgentId: "engineering_manager", inputs: { developmentInput: { sourceCode: "module.exports = (value) => value;", testObjective: "Validate string input." } } })).task;
    const result = await service.execute(ownerId,task.id,"request","127.0.0.1");
    expect(result.task).toMatchObject({ status: "REVIEW_REQUIRED", sandboxStatus: "PASSED", artifactCount: 1 });
    expect(result.task.completionProvenance).toMatchObject({ completionType: "EXECUTED", agentSessionId: "50000000-0000-4000-8000-000000000002", modelRequestId: "61000000-0000-4000-8000-000000000001" });
    expect(counts()).toEqual({ routerCalls: 0, osCalls: 0, rewardCalls: 0, sandboxCalls: 1 });
    expect(activations).toEqual(["backend_agent:ACTIVE","backend_agent:DORMANT"]);
  });
});
