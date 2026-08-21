import {
  AgentSocietyDashboardResponseSchema,
  CommunicationRecordSchema,
  DebateArgumentRecordSchema,
  DebateRecordSchema,
  DepartmentRecordSchema,
  FormSocietyTeamRequestSchema,
  MeetingRecordSchema,
  OrganizationRecordSchema,
  OrganizationalMemoryRecordSchema,
  OrganizationalMetricRecordSchema,
  OrganizationalRoleRecordSchema,
  RecordMeetingRequestSchema,
  ReputationScoreRecordSchema,
  SocietyConsensusRecordSchema,
  SocietyDebateResponseSchema,
  SocietyMeetingResponseSchema,
  SocietyTeamFormationResponseSchema,
  StartDebateRequestSchema,
  TeamMemberRecordSchema,
  TeamRecordSchema,
  type AgentRecord,
  type MemoryEvidence,
  type OrganizationalRoleRecord,
} from "@alexa-control/shared";
import { createHash } from "node:crypto";

import { ExecutionError } from "../execution/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { AgentEvolutionService } from "../agent-evolution/service.js";
import type { AgentStore } from "../agents/store.js";
import type { AgentSocietyStore } from "./store.js";

const uuidFromHash = (value: string) => {
  const hash = createHash("sha256").update(value).digest("hex");
  const variant = ((Number.parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, "0");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${
    variant
  }${hash.slice(18, 20)}-${hash.slice(20, 32)}`;
};

const evidenceFor = (at: string, reference: string): MemoryEvidence[] => [
  {
    sourceType: "agent",
    reference,
    excerpt:
      "Generated from Agent Society organizational metadata. Records are advisory and do not grant permissions.",
    observedAt: at,
  },
];

const roleSeeds: Array<
  Pick<OrganizationalRoleRecord, "role" | "displayName" | "responsibilities">
> = [
  {
    role: "chief_planner",
    displayName: "Chief Planner",
    responsibilities: ["Coordinate collective planning", "Surface trade-offs"],
  },
  {
    role: "engineering_manager",
    displayName: "Engineering Manager",
    responsibilities: ["Prioritize work", "Resolve blockers", "Escalate risks"],
  },
  {
    role: "technical_lead",
    displayName: "Technical Lead",
    responsibilities: ["Guide architecture", "Coordinate reviews"],
  },
  {
    role: "security_engineer",
    displayName: "Security Engineer",
    responsibilities: ["Challenge unsafe plans", "Review approval boundaries"],
  },
  {
    role: "qa_engineer",
    displayName: "QA Engineer",
    responsibilities: ["Plan validation", "Review test coverage"],
  },
  {
    role: "mentor",
    displayName: "Mentor",
    responsibilities: ["Transfer knowledge", "Improve specialist reasoning"],
  },
];

const roleForAgent = (agent: AgentRecord) => {
  if (agent.role === "planning") return "chief_planner";
  if (agent.role === "security") return "security_engineer";
  if (agent.role === "testing") return "qa_engineer";
  if (agent.role === "review") return "architecture_reviewer";
  if (agent.role === "documentation") return "documentation_engineer";
  if (agent.role === "release") return "release_manager";
  if (agent.role === "engineering_manager") return "engineering_manager";
  return "technical_lead";
};

export class AgentSocietyService {
  constructor(
    readonly store: AgentSocietyStore,
    readonly agentStore: AgentStore,
    readonly evolution: AgentEvolutionService,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return AgentSocietyDashboardResponseSchema.parse({
      organizations: await this.store.listOrganizations(ownerId),
      departments: await this.store.listDepartments(ownerId),
      teams: await this.store.listTeams(ownerId, 200),
      teamMembers: await this.store.listTeamMembers(ownerId, 500),
      roles: await this.store.listRoles(ownerId),
      delegations: await this.store.listDelegations(ownerId, 200),
      debates: await this.store.listDebates(ownerId, 200),
      debateArguments: await this.store.listDebateArguments(ownerId, 500),
      consensus: await this.store.listConsensus(ownerId, 200),
      peerReviews: await this.store.listPeerReviews(ownerId, 200),
      mentorships: await this.store.listMentorships(ownerId, 200),
      conflicts: await this.store.listConflicts(ownerId, 200),
      meetings: await this.store.listMeetings(ownerId, 200),
      communications: await this.store.listCommunications(ownerId, 500),
      reputation: await this.store.listReputation(ownerId),
      collaborationEdges: await this.store.listCollaborationEdges(ownerId),
      metrics: await this.store.listMetrics(ownerId, 200),
      memory: await this.store.listMemory(ownerId, 200),
      organizationalOnly: true,
      grantsPermissions: false,
    });
  }

  async formTeam(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = FormSocietyTeamRequestSchema.parse(input.body);
    const at = this.now().toISOString();
    const organization = (await this.store.listOrganizations(input.ownerId))[0];
    if (!organization) {
      throw new ExecutionError(500, "ORGANIZATION_MISSING", "Organization missing.");
    }
    const agents = await this.agentStore.listAgents(input.ownerId);
    const members = agents.slice(0, Math.min(6, agents.length));
    const risk = /security|auth|database|migration|production/i.test(parsed.goal)
      ? "high"
      : "medium";
    const team = TeamRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      organizationId: organization.id,
      departmentId: null,
      workflowId: parsed.workflowId ?? null,
      name: `Task force: ${parsed.goal.slice(0, 80)}`,
      purpose: parsed.goal,
      complexity: members.length > 4 ? "high" : "medium",
      risk,
      status: "active",
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveTeam(team);

    const roles = await this.store.listRoles(input.ownerId);
    const teamMembers = [];
    for (const [index, agent] of members.entries()) {
      const role = this.findRole(roles, roleForAgent(agent));
      const member = TeamMemberRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        teamId: team.id,
        agentId: agent.id,
        roleId: role.id,
        leadership: index === 0 || agent.role === "engineering_manager",
        workloadScore: Math.min(0.95, 0.2 + index * 0.08),
        joinedAt: at,
        leftAt: null,
      });
      await this.store.saveTeamMember(member);
      teamMembers.push(member);
      await this.store.saveCommunication(
        CommunicationRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          teamId: team.id,
          senderAgentId: members[0]?.id ?? agent.id,
          recipientAgentId: agent.id,
          messageType: "task_assignment",
          subject: `Joined ${team.name}`,
          metadata: { role: role.role, grantsPermissions: false },
          evidence: evidenceFor(at, team.name),
          createdAt: at,
        }),
      );
    }

    const consensus = SocietyConsensusRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      teamId: team.id,
      topic: `Initial plan for ${parsed.goal.slice(0, 200)}`,
      rule: risk === "high" ? "human_escalation" : "weighted_confidence",
      finalDecision:
        "Team formed and ready for collective planning. Any implementation remains subject to existing approval gates.",
      supportingEvidence: evidenceFor(at, team.name),
      dissentingOpinions:
        risk === "high"
          ? ["High-risk work should include security and human review before action."]
          : [],
      confidence: 0.78,
      humanEscalationRequired: risk === "high",
      createdAt: at,
    });
    await this.store.saveConsensus(consensus);
    await this.store.saveMetric(
      OrganizationalMetricRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        metricName: "team_formation_quality",
        value: 0.82,
        trend: 0.05,
        summary: "Team formation used role coverage, risk, and available specialists.",
        measuredAt: at,
      }),
    );
    await this.store.saveMemory(
      OrganizationalMemoryRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        memoryType: "team_structure",
        title: team.name,
        summary: `Formed ${teamMembers.length} member task force for: ${parsed.goal}`,
        evidence: evidenceFor(at, team.name),
        createdAt: at,
      }),
    );
    await this.audit({
      eventType: "SOCIETY_TEAM_FORMED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Agent Society team formed without granting permissions.",
      metadata: {
        teamId: team.id,
        memberCount: teamMembers.length,
        grantsPermissions: false,
      },
      requestId: input.requestId,
    });
    return SocietyTeamFormationResponseSchema.parse({
      team,
      members: teamMembers,
      consensus,
    });
  }

  async startDebate(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = StartDebateRequestSchema.parse(input.body);
    await this.requireAgent(input.ownerId, parsed.initiatingAgentId);
    const at = this.now().toISOString();
    const debate = DebateRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      teamId: parsed.teamId ?? null,
      topic: parsed.topic,
      status: "open",
      outcome: null,
      confidence: 0.65,
      createdAt: at,
      updatedAt: at,
    });
    const argument = DebateArgumentRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      debateId: debate.id,
      agentId: parsed.initiatingAgentId,
      stance: "risk",
      argument: parsed.argument,
      evidence: evidenceFor(at, parsed.topic),
      createdAt: at,
    });
    await this.store.saveDebate(debate);
    await this.store.saveDebateArgument(argument);
    await this.store.saveCommunication(
      CommunicationRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        teamId: debate.teamId,
        senderAgentId: parsed.initiatingAgentId,
        recipientAgentId: null,
        messageType: "challenge",
        subject: parsed.topic,
        metadata: { debateId: debate.id },
        evidence: argument.evidence,
        createdAt: at,
      }),
    );
    await this.audit({
      eventType: "SOCIETY_DEBATE_OPENED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Structured debate opened for visible collective reasoning.",
      metadata: { debateId: debate.id, agentId: parsed.initiatingAgentId },
      requestId: input.requestId,
    });
    return SocietyDebateResponseSchema.parse({ debate, argument });
  }

  async recordMeeting(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId, input.requestId);
    const parsed = RecordMeetingRequestSchema.parse(input.body);
    const at = this.now().toISOString();
    const meeting = MeetingRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      teamId: parsed.teamId ?? null,
      meetingType: parsed.meetingType,
      agenda: parsed.agenda,
      summary: parsed.summary,
      decisions: parsed.decisions,
      actionItems: parsed.actionItems,
      createdAt: at,
    });
    await this.store.saveMeeting(meeting);
    await this.store.saveMemory(
      OrganizationalMemoryRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        memoryType: "collective_decision",
        title: `${meeting.meetingType} meeting`,
        summary: meeting.summary,
        evidence: evidenceFor(at, meeting.meetingType),
        createdAt: at,
      }),
    );
    await this.audit({
      eventType: "SOCIETY_MEETING_RECORDED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: "Structured organizational meeting recorded.",
      metadata: { meetingId: meeting.id, meetingType: meeting.meetingType },
      requestId: input.requestId,
    });
    return SocietyMeetingResponseSchema.parse({ meeting });
  }

  async ensureBaseline(ownerId: string, requestId = "system") {
    await this.evolution.ensureBaseline(ownerId, requestId);
    const at = this.now().toISOString();
    let organization = (await this.store.listOrganizations(ownerId))[0];
    if (!organization) {
      organization = OrganizationRecordSchema.parse({
        id: uuidFromHash(`society-org:${ownerId}`),
        ownerId,
        name: "Personal Assistant Engineering Organization",
        mission:
          "Coordinate governed AI specialists through observable collaboration, consensus, mentorship, and review.",
        status: "active",
        createdAt: at,
        updatedAt: at,
      });
      await this.store.saveOrganization(organization);
      await this.audit({
        eventType: "ORGANIZATION_INITIALIZED",
        ownerId,
        ipAddress: "system",
        outcome: "SUCCESS",
        reason: "Agent Society organization initialized.",
        metadata: { organizationId: organization.id, grantsPermissions: false },
        requestId,
      });
    }
    await this.ensureRoles(ownerId, at);
    await this.ensureDepartments(ownerId, organization.id, at);
    await this.ensureReputation(ownerId, at, requestId);
    await this.ensureHealth(ownerId, at);
  }

  private async ensureRoles(ownerId: string, at: string) {
    const existing = new Set(
      (await this.store.listRoles(ownerId)).map((role) => role.role),
    );
    for (const seed of roleSeeds) {
      if (existing.has(seed.role)) continue;
      await this.store.saveRole(
        OrganizationalRoleRecordSchema.parse({
          id: uuidFromHash(`society-role:${ownerId}:${seed.role}`),
          ownerId,
          ...seed,
          configurable: true,
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
  }

  private async ensureDepartments(ownerId: string, organizationId: string, at: string) {
    if ((await this.store.listDepartments(ownerId)).length > 0) return;
    const agents = await this.agentStore.listAgents(ownerId);
    for (const [name, responsibility, lead] of [
      [
        "Planning",
        "Collective planning, prioritization, and dependency analysis.",
        "planning_agent",
      ],
      [
        "Engineering",
        "Implementation reasoning, review, and validation coordination.",
        "coding_agent",
      ],
      [
        "Governance",
        "Security, approval boundaries, audit, and risk challenge.",
        "security_agent",
      ],
    ] as const) {
      await this.store.saveDepartment(
        DepartmentRecordSchema.parse({
          id: uuidFromHash(`society-department:${ownerId}:${name}`),
          ownerId,
          organizationId,
          name,
          responsibility,
          leadAgentId: agents.some((agent) => agent.id === lead) ? lead : null,
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
  }

  private async ensureReputation(ownerId: string, at: string, requestId: string) {
    const existing = new Set(
      (await this.store.listReputation(ownerId)).map((item) => item.agentId),
    );
    for (const agent of await this.agentStore.listAgents(ownerId)) {
      if (existing.has(agent.id)) continue;
      const score = agent.status === "unhealthy" ? 0.45 : 0.78;
      await this.store.saveReputation(
        ReputationScoreRecordSchema.parse({
          id: uuidFromHash(`society-reputation:${ownerId}:${agent.id}`),
          ownerId,
          agentId: agent.id,
          reliability: score,
          reviewQuality: score,
          planningQuality: score,
          communicationQuality: score,
          mentoring: 0.6,
          collaboration: score,
          specialization: 0.7,
          consistency: score,
          confidenceAccuracy: 0.72,
          overall: score,
          evidence: evidenceFor(at, `${agent.displayName} baseline reputation`),
          updatedAt: at,
        }),
      );
      await this.audit({
        eventType: "SOCIETY_REPUTATION_UPDATED",
        ownerId,
        ipAddress: "system",
        outcome: "SUCCESS",
        reason: "Baseline organizational reputation initialized.",
        metadata: { agentId: agent.id },
        requestId,
      });
    }
  }

  private async ensureHealth(ownerId: string, at: string) {
    if ((await this.store.listMetrics(ownerId, 20)).length > 0) return;
    for (const [metricName, value, summary] of [
      [
        "organizational_health",
        0.82,
        "Baseline communication, role coverage, and collaboration health.",
      ],
      [
        "knowledge_sharing",
        0.76,
        "Knowledge exchange is available through structured communications and memory.",
      ],
      [
        "workload_balance",
        0.74,
        "Workload balancing is advisory and based on active team membership.",
      ],
    ] as const) {
      await this.store.saveMetric(
        OrganizationalMetricRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          metricName,
          value,
          trend: 0,
          summary,
          measuredAt: at,
        }),
      );
    }
  }

  private findRole(roles: OrganizationalRoleRecord[], roleName: string) {
    const role =
      roles.find((role) => role.role === roleName) ??
      roles.find((role) => role.role === "technical_lead") ??
      roles[0];
    if (!role) {
      throw new ExecutionError(
        500,
        "ORGANIZATIONAL_ROLE_MISSING",
        "Organizational role baseline is missing.",
      );
    }
    return role;
  }

  private async requireAgent(ownerId: string, agentId: string) {
    const agent = await this.agentStore.findAgent(ownerId, agentId);
    if (!agent) throw new ExecutionError(404, "AGENT_NOT_FOUND", "Agent not found.");
    return agent;
  }
}
