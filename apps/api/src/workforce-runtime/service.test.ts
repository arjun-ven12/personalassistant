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
  const agentOs = { startIsolatedDelegation: vi.fn(() => { osCalls++; return Promise.resolve({ session: { id: "50000000-0000-4000-8000-000000000001" } }); }), completeIsolatedDelegation: vi.fn(() => Promise.resolve({})) } as unknown as AgentOsService;
  const aiRouter = { executeStructured: vi.fn(() => { routerCalls++; return Promise.resolve({ outcome: "SUCCESS", structuredOutput: { summary: "Implemented bounded change.", confidence: 0.9, evidence: ["test:passed"] }, requestId: "60000000-0000-4000-8000-000000000001", providerId: "local", modelId: "shared", usage: { totalTokens: 800 } }); }) } as unknown as AIRouterService;
  const capabilityStudio = { createRequest: vi.fn(() => Promise.resolve({})) } as unknown as CapabilityStudioService;
  const externalHarvest = { executeDelegation: vi.fn(() => { sandboxCalls++; return Promise.resolve({ status: "COMPLETE", summary: "Generated and ran one bounded test.", confidence: .92, artifacts: [{ name: "generated.test.cjs", kind: "PROPOSED_TEST", content: "" }], tests: { status: "PASSED" }, ai: { requestId: "61000000-0000-4000-8000-000000000001", providerId: "local", modelId: "shared" } }); }) } as unknown as ExternalHarvestService;
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
  return { service, agents, activations, reservations, counts: () => ({ routerCalls, osCalls, rewardCalls, sandboxCalls }) };
};

const create = (service: WorkforceRuntimeService, body: Record<string,unknown>) => service.createTask({ ownerId, body: { title: "Implement endpoint", objective: "Implement and verify a bounded TypeScript endpoint.", requiredSkills: ["typescript"], requiredCapabilities: ["workspace.read"], economicBudget: 10, ...body }, requestId: "request", ipAddress: "127.0.0.1" });

describe("WorkforceRuntimeService", () => {
  it("selects one funded specialist, activates lazily, routes through shared AI, settles, and returns dormant", async () => {
    const { service, activations, reservations, counts } = setup();
    const { task } = await create(service, { createdByAgentId: "engineering_manager" });
    const result = await service.execute(ownerId,task.id,"request","127.0.0.1");
    expect(result.task).toMatchObject({ assignedAgentId: "backend_agent", status: "COMPLETED", providerId: "local", modelId: "shared" });
    expect(reservations).toEqual(["backend_agent"]); expect(counts()).toEqual({ routerCalls: 1, osCalls: 1, rewardCalls: 0, sandboxCalls: 0 });
    expect(activations).toEqual(["backend_agent:ACTIVE","backend_agent:DORMANT"]);
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

  it("runs the development scenario through the existing bounded sandbox and stops for review", async () => {
    const { service, counts, activations } = setup();
    const task = (await create(service,{ createdByAgentId: "engineering_manager", inputs: { developmentInput: { sourceCode: "module.exports = (value) => value;", testObjective: "Validate string input." } } })).task;
    const result = await service.execute(ownerId,task.id,"request","127.0.0.1");
    expect(result.task).toMatchObject({ status: "REVIEW_REQUIRED", sandboxStatus: "PASSED", artifactCount: 1 });
    expect(counts()).toEqual({ routerCalls: 0, osCalls: 0, rewardCalls: 0, sandboxCalls: 1 });
    expect(activations).toEqual(["backend_agent:ACTIVE","backend_agent:DORMANT"]);
  });
});
