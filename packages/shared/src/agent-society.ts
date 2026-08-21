import { z } from "zod";

import { MemoryEvidenceSchema } from "./memory.js";

export const OrganizationalRoleTypeSchema = z.enum([
  "chief_planner",
  "engineering_manager",
  "technical_lead",
  "backend_engineer",
  "frontend_engineer",
  "security_engineer",
  "qa_engineer",
  "devops_engineer",
  "documentation_engineer",
  "performance_engineer",
  "architecture_reviewer",
  "release_manager",
  "dynamic_specialist",
  "observer",
  "reviewer",
  "mentor",
  "facilitator",
]);

export const SocietyMessageTypeSchema = z.enum([
  "task_assignment",
  "question",
  "proposal",
  "review",
  "challenge",
  "approval_request",
  "knowledge_share",
  "warning",
  "escalation",
  "completion",
  "reflection",
]);

export const ConsensusRuleTypeSchema = z.enum([
  "majority",
  "weighted_confidence",
  "lead_approval",
  "expert_override_recommendation",
  "tie_breaking",
  "human_escalation",
]);

export const OrganizationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    name: z.string().min(1).max(160),
    mission: z.string().min(1).max(1_000),
    status: z.enum(["active", "archived"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DepartmentRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    organizationId: z.string().uuid(),
    name: z.string().min(1).max(120),
    responsibility: z.string().min(1).max(1_000),
    leadAgentId: z.string().min(3).max(120).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const OrganizationalRoleRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    role: OrganizationalRoleTypeSchema,
    displayName: z.string().min(1).max(120),
    responsibilities: z.array(z.string().min(1).max(500)).min(1).max(50),
    configurable: z.literal(true),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const TeamRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    organizationId: z.string().uuid(),
    departmentId: z.string().uuid().nullable(),
    workflowId: z.string().uuid().nullable(),
    name: z.string().min(1).max(160),
    purpose: z.string().min(1).max(1_000),
    complexity: z.enum(["low", "medium", "high"]),
    risk: z.enum(["low", "medium", "high"]),
    status: z.enum(["forming", "active", "blocked", "completed", "archived"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const TeamMemberRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    teamId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    roleId: z.string().uuid(),
    leadership: z.boolean(),
    workloadScore: z.number().min(0).max(1),
    joinedAt: z.iso.datetime(),
    leftAt: z.iso.datetime().nullable(),
  })
  .strict();

export const DelegationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    teamId: z.string().uuid(),
    fromAgentId: z.string().min(3).max(120),
    toAgentId: z.string().min(3).max(120),
    taskTitle: z.string().min(1).max(255),
    rationale: z.string().min(1).max(1_000),
    dependencies: z.array(z.string().uuid()).max(50),
    status: z.enum(["assigned", "accepted", "blocked", "completed", "cancelled"]),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DebateRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    teamId: z.string().uuid().nullable(),
    topic: z.string().min(1).max(500),
    status: z.enum(["open", "resolved", "escalated"]),
    outcome: z.string().max(1_000).nullable(),
    confidence: z.number().min(0).max(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DebateArgumentRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    debateId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    stance: z.enum(["support", "oppose", "alternative", "risk", "question"]),
    argument: z.string().min(1).max(2_000),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const SocietyConsensusRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    teamId: z.string().uuid().nullable(),
    topic: z.string().min(1).max(500),
    rule: ConsensusRuleTypeSchema,
    finalDecision: z.string().min(1).max(1_000),
    supportingEvidence: z.array(MemoryEvidenceSchema).max(100),
    dissentingOpinions: z.array(z.string().min(1).max(1_000)).max(50),
    confidence: z.number().min(0).max(1),
    humanEscalationRequired: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const PeerReviewRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    teamId: z.string().uuid().nullable(),
    reviewerAgentId: z.string().min(3).max(120),
    subjectAgentId: z.string().min(3).max(120),
    reviewType: z.enum([
      "correctness",
      "architecture",
      "security",
      "performance",
      "maintainability",
      "testing",
      "documentation",
    ]),
    summary: z.string().min(1).max(1_000),
    findings: z.array(z.string().min(1).max(1_000)).max(50),
    confidence: z.number().min(0).max(1),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const MentorshipRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    mentorAgentId: z.string().min(3).max(120),
    menteeAgentId: z.string().min(3).max(120),
    focus: z.string().min(1).max(255),
    guidance: z.string().min(1).max(2_000),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const OrganizationalConflictRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    teamId: z.string().uuid().nullable(),
    conflictType: z.enum([
      "planning",
      "architecture",
      "review",
      "resource",
      "priority",
      "tool",
      "memory",
    ]),
    title: z.string().min(1).max(255),
    description: z.string().min(1).max(1_000),
    resolution: z.string().max(1_000).nullable(),
    escalationRequired: z.boolean(),
    status: z.enum(["open", "resolved", "escalated"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const MeetingRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    teamId: z.string().uuid().nullable(),
    meetingType: z.enum([
      "architecture_review",
      "planning_session",
      "risk_review",
      "release_review",
      "retrospective",
      "postmortem",
    ]),
    agenda: z.array(z.string().min(1).max(500)).min(1).max(50),
    summary: z.string().min(1).max(1_000),
    decisions: z.array(z.string().min(1).max(1_000)).max(50),
    actionItems: z.array(z.string().min(1).max(1_000)).max(50),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const CommunicationRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    teamId: z.string().uuid().nullable(),
    senderAgentId: z.string().min(3).max(120),
    recipientAgentId: z.string().min(3).max(120).nullable(),
    messageType: SocietyMessageTypeSchema,
    subject: z.string().min(1).max(255),
    metadata: z.record(z.string().max(80), z.json()).default({}),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const ReputationScoreRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    agentId: z.string().min(3).max(120),
    reliability: z.number().min(0).max(1),
    reviewQuality: z.number().min(0).max(1),
    planningQuality: z.number().min(0).max(1),
    communicationQuality: z.number().min(0).max(1),
    mentoring: z.number().min(0).max(1),
    collaboration: z.number().min(0).max(1),
    specialization: z.number().min(0).max(1),
    consistency: z.number().min(0).max(1),
    confidenceAccuracy: z.number().min(0).max(1),
    overall: z.number().min(0).max(1),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CollaborationEdgeRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    sourceAgentId: z.string().min(3).max(120),
    targetAgentId: z.string().min(3).max(120),
    relationship: z.enum([
      "collaborated",
      "reviewed",
      "mentored",
      "debated",
      "delegated",
      "shared_knowledge",
    ]),
    weight: z.number().min(0).max(1),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const OrganizationalMetricRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    metricName: z.string().min(1).max(120),
    value: z.number(),
    trend: z.number().min(-1).max(1),
    summary: z.string().min(1).max(1_000),
    measuredAt: z.iso.datetime(),
  })
  .strict();

export const OrganizationalMemoryRecordSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid(),
    memoryType: z.enum([
      "team_structure",
      "collaboration",
      "leadership",
      "collective_decision",
      "milestone",
      "lesson",
    ]),
    title: z.string().min(1).max(255),
    summary: z.string().min(1).max(2_000),
    evidence: z.array(MemoryEvidenceSchema).max(100),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const AgentSocietyDashboardResponseSchema = z
  .object({
    organizations: z.array(OrganizationRecordSchema).max(100),
    departments: z.array(DepartmentRecordSchema).max(500),
    teams: z.array(TeamRecordSchema).max(500),
    teamMembers: z.array(TeamMemberRecordSchema).max(1_000),
    roles: z.array(OrganizationalRoleRecordSchema).max(200),
    delegations: z.array(DelegationRecordSchema).max(500),
    debates: z.array(DebateRecordSchema).max(500),
    debateArguments: z.array(DebateArgumentRecordSchema).max(1_000),
    consensus: z.array(SocietyConsensusRecordSchema).max(500),
    peerReviews: z.array(PeerReviewRecordSchema).max(500),
    mentorships: z.array(MentorshipRecordSchema).max(500),
    conflicts: z.array(OrganizationalConflictRecordSchema).max(500),
    meetings: z.array(MeetingRecordSchema).max(500),
    communications: z.array(CommunicationRecordSchema).max(1_000),
    reputation: z.array(ReputationScoreRecordSchema).max(500),
    collaborationEdges: z.array(CollaborationEdgeRecordSchema).max(1_000),
    metrics: z.array(OrganizationalMetricRecordSchema).max(500),
    memory: z.array(OrganizationalMemoryRecordSchema).max(500),
    organizationalOnly: z.literal(true),
    grantsPermissions: z.literal(false),
  })
  .strict();

export const FormSocietyTeamRequestSchema = z
  .object({
    goal: z.string().trim().min(1).max(1_000),
    workflowId: z.string().uuid().nullable().optional(),
    repositoryIds: z.array(z.string().uuid()).max(20).default([]),
  })
  .strict();

export const StartDebateRequestSchema = z
  .object({
    teamId: z.string().uuid().nullable().optional(),
    topic: z.string().trim().min(1).max(500),
    initiatingAgentId: z.string().min(3).max(120),
    argument: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const RecordMeetingRequestSchema = z
  .object({
    teamId: z.string().uuid().nullable().optional(),
    meetingType: MeetingRecordSchema.shape.meetingType,
    agenda: z.array(z.string().trim().min(1).max(500)).min(1).max(50),
    summary: z.string().trim().min(1).max(1_000),
    decisions: z.array(z.string().trim().min(1).max(1_000)).max(50).default([]),
    actionItems: z.array(z.string().trim().min(1).max(1_000)).max(50).default([]),
  })
  .strict();

export const SocietyTeamFormationResponseSchema = z
  .object({
    team: TeamRecordSchema,
    members: z.array(TeamMemberRecordSchema).max(100),
    consensus: SocietyConsensusRecordSchema,
  })
  .strict();

export const SocietyDebateResponseSchema = z
  .object({
    debate: DebateRecordSchema,
    argument: DebateArgumentRecordSchema,
  })
  .strict();

export const SocietyMeetingResponseSchema = z
  .object({ meeting: MeetingRecordSchema })
  .strict();

export type OrganizationRecord = z.infer<typeof OrganizationRecordSchema>;
export type DepartmentRecord = z.infer<typeof DepartmentRecordSchema>;
export type OrganizationalRoleRecord = z.infer<typeof OrganizationalRoleRecordSchema>;
export type TeamRecord = z.infer<typeof TeamRecordSchema>;
export type TeamMemberRecord = z.infer<typeof TeamMemberRecordSchema>;
export type DelegationRecord = z.infer<typeof DelegationRecordSchema>;
export type DebateRecord = z.infer<typeof DebateRecordSchema>;
export type DebateArgumentRecord = z.infer<typeof DebateArgumentRecordSchema>;
export type SocietyConsensusRecord = z.infer<typeof SocietyConsensusRecordSchema>;
export type PeerReviewRecord = z.infer<typeof PeerReviewRecordSchema>;
export type MentorshipRecord = z.infer<typeof MentorshipRecordSchema>;
export type OrganizationalConflictRecord = z.infer<
  typeof OrganizationalConflictRecordSchema
>;
export type MeetingRecord = z.infer<typeof MeetingRecordSchema>;
export type CommunicationRecord = z.infer<typeof CommunicationRecordSchema>;
export type ReputationScoreRecord = z.infer<typeof ReputationScoreRecordSchema>;
export type CollaborationEdgeRecord = z.infer<typeof CollaborationEdgeRecordSchema>;
export type OrganizationalMetricRecord = z.infer<
  typeof OrganizationalMetricRecordSchema
>;
export type OrganizationalMemoryRecord = z.infer<
  typeof OrganizationalMemoryRecordSchema
>;
export type AgentSocietyDashboardResponse = z.infer<
  typeof AgentSocietyDashboardResponseSchema
>;
export type FormSocietyTeamRequest = z.infer<typeof FormSocietyTeamRequestSchema>;
export type StartDebateRequest = z.infer<typeof StartDebateRequestSchema>;
export type RecordMeetingRequest = z.infer<typeof RecordMeetingRequestSchema>;
