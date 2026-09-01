import {
  AgentEconomyAccountSchema,
  AgentMessageRecordSchema,
  AgentRecordSchema,
  AIBudgetPolicySchema,
  ConversationHistoryRecordSchema,
  KnowledgeNodeSchema,
  OrganizationRecordSchema,
  TaskRecordSchema,
} from "@alexa-control/shared";
import { describe, expect, it } from "vitest";

import { InMemoryAgentEconomyStore } from "../agent-economy/store.js";
import { InMemoryAgentStore } from "../agents/store.js";
import { InMemoryAgentSocietyStore } from "../agent-society/store.js";
import { InMemoryAIEconomicsStore } from "../ai/economics/store.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import type { StoredApprovalRequest } from "../governance/types.js";
import { InMemoryVoiceStore } from "../voice/store.js";
import { InMemoryMemoryStore } from "../memory/store.js";
import { InMemoryTaskStore } from "../tasks/store.js";
import { companyScope } from "./scope.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyA = "20000000-0000-4000-8000-000000000001";
const companyB = "20000000-0000-4000-8000-000000000002";
const at = "2026-08-31T00:00:00.000Z";
const context = (companyId: string) => ({ ownerId, companyId, role: "OWNER" as const, requestId: companyId });

describe("company-scoped repositories", () => {
  it("isolates Agent Economy balances for the same agent identifier", () => {
    const store = new InMemoryAgentEconomyStore();
    const account = (credits: number) => AgentEconomyAccountSchema.parse({
      ownerId, agentId: "planning-agent", availableCredits: credits, reservedCredits: 0,
      lifetimeEarned: credits, lifetimeSpent: 0, reputation: 50, economyStatus: "ACTIVE",
      organizationId: null, departmentId: null, parentAgentId: null, memoryScopeId: null,
      capabilityProfileId: null, modelPolicyId: null, activationPolicyId: null,
      createdAt: at, updatedAt: at,
    });
    companyScope.run(context(companyA), () => store.saveAccount(account(10)));
    companyScope.run(context(companyB), () => store.saveAccount(account(90)));
    expect(companyScope.run(context(companyA), () => store.findAccount(ownerId, "planning-agent"))?.availableCredits).toBe(10);
    expect(companyScope.run(context(companyB), () => store.findAccount(ownerId, "planning-agent"))?.availableCredits).toBe(90);
  });

  it("reuses one definition without enumerating another company's assignment", () => {
    const store = new InMemoryAgentStore();
    const agent = AgentRecordSchema.parse({
      schemaVersion: "1", id: "planning-agent", ownerId, role: "planning", displayName: "Planner",
      version: "1", status: "available", capabilities: ["plan.work"], supportedTasks: ["plan.work"],
      configuration: {}, createdAt: at, updatedAt: at, healthSummary: "Ready",
      workforce: {
        organizationId: crypto.randomUUID(), departmentId: crypto.randomUUID(), parentAgentId: null,
        managerAgentId: null, specialization: "Planning", description: "Plans bounded work.",
        skills: ["planning"], memoryScopeId: "agent-memory", departmentMemoryScopeId: "department-memory",
        organizationMemoryScopeId: "organization-memory", capabilityProfileId: "planning-profile",
        missingCapabilities: [], modelPolicyId: "BALANCED", activationPolicyId: "on-demand",
        executionPlacement: "REMOTE_ALLOWED", evaluationProfile: ["quality"], source: "ALEXA_NATIVE",
        sourcePath: null, sourceVersion: null, license: null, importedAt: at,
      },
    });
    companyScope.run(context(companyB), () => store.upsertAgent(agent));
    expect(companyScope.run(context(companyA), () => store.findAgent(ownerId, agent.id))).toBeUndefined();
    expect(companyScope.run(context(companyA), () => store.listAgents(ownerId))).toEqual([]);
    companyScope.run(context(companyA), () => store.upsertAgent(agent));
    const companyAAgent = companyScope.run(context(companyA), () => store.findAgent(ownerId, agent.id));
    const companyBAgent = companyScope.run(context(companyB), () => store.findAgent(ownerId, agent.id));
    expect(store.listDefinitions(ownerId)).toHaveLength(1);
    expect(store.countDefinitionAssignments(ownerId, agent.id)).toBe(2);
    expect(companyAAgent?.workforce?.memoryScopeId).not.toBe(companyBAgent?.workforce?.memoryScopeId);
  });

  it("does not expose background tasks from another company", () => {
    const store = new InMemoryTaskStore();
    const task = (id: string, name: string) => TaskRecordSchema.parse({
      id, ownerId, name, description: name, goal: name, priority: "normal", category: "planning",
      type: "goal_task", status: "ready", schedule: { kind: "none", timezone: "UTC", startAt: null,
        endAt: null, cronExpression: null, intervalSeconds: null, quietHours: [], blackoutPeriods: [], preview: [] },
      triggerSummary: "manual", conditionSummary: "ready", dependencyIds: [], executionPolicy: {
        safetyLevel: "informational", requiresApproval: false, requiresRecentAuthentication: false,
        requiresPrivateNetwork: false, requiresTrustedDevice: false, allowedProviders: ["manual_owner"],
        autonomousExecutionAllowed: false }, approvalPolicy: "none", assignedAgentIds: [],
      retryPolicy: { maxRetries: 0, strategy: "none" }, timeoutSeconds: 60, deadlineAt: null,
      successCriteria: ["done"], failureCriteria: [], rollbackStrategy: "none", metadata: {},
      version: "1", createdAt: at, updatedAt: at,
    });
    companyScope.run(context(companyA), () => store.saveTask(task(crypto.randomUUID(), "Company A task")));
    companyScope.run(context(companyB), () => store.saveTask(task(crypto.randomUUID(), "Company B task")));
    expect(companyScope.run(context(companyA), () => store.listTasks(ownerId, 10)).map((item) => item.name))
      .toEqual(["Company A task"]);
  });

  it("keeps pending approvals with the same digest independent", () => {
    const store = new InMemoryGovernanceStore();
    const approval = (companyId: string): StoredApprovalRequest => ({
      companyId, id: crypto.randomUUID(), ownerId, actionId: crypto.randomUUID(), actionDigest: "a".repeat(64),
      toolName: "workflow.execute", riskLevel: "medium", approvalRequirement: "explicit",
      status: "PENDING", humanSummary: "Approve bounded workflow.", requestedAt: at,
      expiresAt: "2026-08-31T00:15:00.000Z", decidedAt: null, decidedBySessionId: null,
      rejectionReason: null, action: { actionId: crypto.randomUUID(), toolName: "workflow.execute", arguments: {} },
    });
    companyScope.run(context(companyA), () => store.createApproval(approval(companyA)));
    companyScope.run(context(companyB), () => store.createApproval(approval(companyB)));
    expect(companyScope.run(context(companyA), () => store.listApprovals(ownerId))).toHaveLength(1);
    expect(companyScope.run(context(companyB), () => store.listApprovals(ownerId))).toHaveLength(1);
  });

  it("filters conversation history before it reaches continuity or model context", () => {
    const store = new InMemoryVoiceStore();
    const record = (id: string, transcript: string) => ConversationHistoryRecordSchema.parse({
      id, ownerId, sessionId: null, role: "user", transcript, normalizedTranscript: transcript.toLowerCase(),
      confidence: 1, isFinal: true, language: "en", wakeWordDetected: false, interruption: false,
      commandId: null, intentCreated: false, responseText: null, createdAt: at,
    });
    companyScope.run(context(companyA), () => store.saveConversation(record(crypto.randomUUID(), "Company A plan")));
    companyScope.run(context(companyB), () => store.saveConversation(record(crypto.randomUUID(), "Company B secret")));
    const visible = companyScope.run(context(companyA), () => store.listConversation(ownerId, 10));
    expect(visible.map((item) => item.transcript)).toEqual(["Company A plan"]);
  });

  it("isolates secondary agent communication records", () => {
    const store = new InMemoryAgentStore();
    const id = crypto.randomUUID();
    const message = (label: string) => AgentMessageRecordSchema.parse({
      id, ownerId, senderAgentId: "planning-agent", recipientAgentId: "review-agent",
      conversationId: crypto.randomUUID(), workflowId: null, taskId: null,
      messageType: "status", payload: { label }, evidence: [], priority: "normal", createdAt: at,
    });
    companyScope.run(context(companyA), () => store.saveMessage(message("Company A")));
    companyScope.run(context(companyB), () => store.saveMessage(message("Company B")));
    expect(companyScope.run(context(companyA), () => store.listMessages(ownerId, 10))[0]?.payload).toEqual({ label: "Company A" });
  });

  it("isolates knowledge graph and organization records", () => {
    const memory = new InMemoryMemoryStore();
    const society = new InMemoryAgentSocietyStore();
    const nodeId = crypto.randomUUID();
    const organizationId = crypto.randomUUID();
    const node = (label: string) => KnowledgeNodeSchema.parse({
      id: nodeId, ownerId, kind: "memory", label, refId: null, summary: label,
      confidence: 1, evidence: [], createdAt: at, updatedAt: at,
    });
    const organization = (name: string) => OrganizationRecordSchema.parse({
      id: organizationId, ownerId, name, mission: `${name} mission`, status: "active",
      createdAt: at, updatedAt: at,
    });
    companyScope.run(context(companyA), () => { memory.saveKnowledgeNode(node("A knowledge")); society.saveOrganization(organization("Company A")); });
    companyScope.run(context(companyB), () => { memory.saveKnowledgeNode(node("B knowledge")); society.saveOrganization(organization("Company B")); });
    expect(companyScope.run(context(companyA), () => memory.listKnowledgeNodes(ownerId, 10))[0]?.label).toBe("A knowledge");
    expect(companyScope.run(context(companyA), () => society.listOrganizations(ownerId))[0]?.name).toBe("Company A");
  });

  it("keeps AI budget authority independent per company", () => {
    const store = new InMemoryAIEconomicsStore();
    const id = crypto.randomUUID();
    const policy = (limitUsd: string) => AIBudgetPolicySchema.parse({
      id, ownerId, scope: "GLOBAL", period: "MONTHLY", currency: "USD", limitUsd,
      warningThresholdPct: 70, hardStopThresholdPct: 100, overflowBehavior: "DENY",
      enabled: true, effectiveFrom: at,
    });
    companyScope.run(context(companyA), () => store.upsertPolicy(policy("10")));
    companyScope.run(context(companyB), () => store.upsertPolicy(policy("90")));
    expect(companyScope.run(context(companyA), () => store.listPolicies(ownerId))[0]?.limitUsd).toBe("10");
    expect(companyScope.run(context(companyB), () => store.listPolicies(ownerId))[0]?.limitUsd).toBe("90");
  });
});
