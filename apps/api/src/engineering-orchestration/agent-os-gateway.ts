import { createHash } from "node:crypto";

import type { AgentOsService } from "../agents/os-service.js";
import type { AgentStore } from "../agents/store.js";
import { companyScope } from "../companies/scope.js";
import type { EngineeringAgentOsGateway } from "./service.js";

const boundedSkillRef = (value: string) => {
  if (value.length >= 3 && value.length <= 120) return value;
  if (value.length < 3) return `skill:${value}`;
  const digest = createHash("sha256").update(value).digest("hex");
  return `${value.slice(0, 55)}:${digest}`;
};

export class AgentOsEngineeringGateway implements EngineeringAgentOsGateway {
  constructor(
    readonly agentOs: AgentOsService,
    readonly agentStore: AgentStore,
  ) {}

  async start(input: Parameters<EngineeringAgentOsGateway["start"]>[0]) {
    const assignments = await companyScope.run(
      {
        ownerId: input.objective.ownerId,
        companyId: input.objective.companyId,
        role: "OWNER",
        requestId: input.requestId,
      },
      () =>
        this.agentStore.listAssignments(
          input.objective.ownerId,
          input.objective.companyId,
        ),
    );
    const assignment = assignments.find(
      (item) => item.id === input.task.assignedAgentId,
    );
    if (!assignment || ["PAUSED", "REVOKED"].includes(assignment.status))
      throw Object.assign(
        new Error("The engineering agent assignment is no longer active."),
        { code: "ENGINEERING_AGENT_ASSIGNMENT_UNAVAILABLE" },
      );
    const agent = await companyScope.run(
      {
        ownerId: input.objective.ownerId,
        companyId: input.objective.companyId,
        role: "OWNER",
        requestId: input.requestId,
      },
      () =>
        this.agentStore.findAgent(
          input.objective.ownerId,
          assignment.agentDefinitionId,
        ),
    );
    if (!agent)
      throw Object.assign(new Error("The engineering agent definition is unavailable."), {
        code: "ENGINEERING_AGENT_DEFINITION_UNAVAILABLE",
      });
    const capabilityRefs = input.task.requiredSkills
      .filter((skill) => agent.capabilities.includes(skill))
      .map((skill) =>
        skill
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 120),
      );
    // A replacement lease fences the earlier task attempt, but process death
    // cannot close its Agent OS session. Reconcile only older delegations for
    // this exact scoped task; never touch a session created by the new attempt.
    if (input.task.leaseGeneration > 1) {
      await companyScope.run(
        { ownerId: input.objective.ownerId, companyId: input.objective.companyId,
          role: "OWNER", requestId: input.requestId },
        async () => {
          const sessions = await this.agentOs.listSessions(input.objective.ownerId, 500);
          for (const session of sessions.filter((candidate) =>
            candidate.status === "running" &&
            candidate.delegation?.delegationId === input.task.id &&
            candidate.delegation.memoryScopes.includes(input.objective.companyId) &&
            candidate.delegation.memoryScopes.includes(input.objective.repositoryId) &&
            candidate.startedAt < input.task.updatedAt,
          )) {
            await this.agentOs.completeIsolatedDelegation({
              ownerId: input.objective.ownerId, sessionId: session.id,
              outputSummary: "The prior engineering worker stopped; its task lease was replaced. No completion or file mutation is claimed.",
              confidence: 0, aiRequestId: session.delegation!.aiRequestId,
              providerId: session.delegation!.providerId, modelId: session.delegation!.modelId,
              artifactCount: session.delegation!.artifactCount, sandboxStatus: "UNAVAILABLE",
              errorCode: "WORKER_LEASE_EXPIRED", requestId: input.requestId,
            });
          }
        },
      );
    }
    const runtime = await companyScope.run(
      {
        ownerId: input.objective.ownerId,
        companyId: input.objective.companyId,
        role: "OWNER",
        requestId: input.requestId,
      },
      () =>
        this.agentOs.startIsolatedDelegation({
          ownerId: input.objective.ownerId,
          managerAgentId: input.objective.managerAgentId,
          specialistAgentId: assignment.agentDefinitionId,
          delegationId: input.task.id,
          // Agent OS stores this as a bounded session summary; the full task remains in Engineering.
          task: `${input.task.title}: ${input.task.description}`.slice(0, 1_000),
          contextSummary: [
            `company=${input.objective.companyId}`,
            `repository=${input.objective.repositoryId}`,
            `objective=${input.objective.id}`,
            `task=${input.task.id}`,
            `agentAssignment=${assignment.id}`,
            `capabilityProfile=${assignment.capabilityGrantProfileId}`,
            `modelTier=${input.task.modelPolicy.currentTier}`,
            `executionState=${input.task.status}`,
          ].join("; "),
          memoryRefs: input.memoryRefs,
          memoryScopes: [
            input.objective.companyId,
            ...(assignment.departmentId
              ? [assignment.departmentId]
              : []),
            input.objective.repositoryId,
            input.task.id,
            assignment.id,
          ],
          capabilityRefs,
          skillRefs: [
            ...input.task.requiredSkills,
            `capability-profile:${assignment.capabilityGrantProfileId}`,
          ]
            .slice(0, 50)
            .map(boundedSkillRef),
          knowledgeSourceRefs: ["repository", "architecture", "memory"],
          contextTokenBudget:
            input.task.estimatedDifficulty === "VERY_HIGH" ? 16_000 : 8_000,
          sandboxProfileId: "engineering-runtime-worktree",
          requestId: input.requestId,
        }),
    );
    return { sessionId: runtime.session.id };
  }

  async complete(input: Parameters<EngineeringAgentOsGateway["complete"]>[0]) {
    await this.agentOs.completeIsolatedDelegation(input);
  }
}
