import {
  CollaborationEdgeRecordSchema,
  CommunicationRecordSchema,
  DebateArgumentRecordSchema,
  DebateRecordSchema,
  DelegationRecordSchema,
  DepartmentRecordSchema,
  MeetingRecordSchema,
  MentorshipRecordSchema,
  OrganizationRecordSchema,
  OrganizationalConflictRecordSchema,
  OrganizationalMemoryRecordSchema,
  OrganizationalMetricRecordSchema,
  OrganizationalRoleRecordSchema,
  PeerReviewRecordSchema,
  ReputationScoreRecordSchema,
  SocietyConsensusRecordSchema,
  TeamMemberRecordSchema,
  TeamRecordSchema,
  type CollaborationEdgeRecord,
  type CommunicationRecord,
  type DebateArgumentRecord,
  type DebateRecord,
  type DelegationRecord,
  type DepartmentRecord,
  type MeetingRecord,
  type MentorshipRecord,
  type OrganizationRecord,
  type OrganizationalConflictRecord,
  type OrganizationalMemoryRecord,
  type OrganizationalMetricRecord,
  type OrganizationalRoleRecord,
  type PeerReviewRecord,
  type ReputationScoreRecord,
  type SocietyConsensusRecord,
  type TeamMemberRecord,
  type TeamRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { AgentSocietyStore } from "./store.js";
import { companyScope } from "../companies/scope.js";

const list = async <T>(
  pool: Pool,
  table: string,
  ownerId: string,
  order: string,
  limit: number,
  schema: { parse: (value: unknown) => T },
) => {
  const result = await pool.query<{ record: unknown }>(
    `SELECT record FROM ${table} WHERE owner_id=$1 AND ($3::uuid IS NULL OR company_id=$3) ORDER BY ${order} DESC LIMIT $2`,
    [ownerId, limit, companyScope.companyId(ownerId) ?? null],
  );
  return result.rows.map((row) => schema.parse(row.record));
};

const insertRecord = async (
  pool: Pool,
  table: string,
  record: { id: string; ownerId: string },
  columns: Record<string, string | number | boolean | null>,
) => {
  const names = ["id", "owner_id", ...Object.keys(columns), "record", "company_id"];
  const values = [
    record.id,
    record.ownerId,
    ...Object.values(columns),
    record,
    companyScope.companyId(record.ownerId) ?? null,
  ];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
  const updates = [...Object.keys(columns), "record", "company_id"]
    .map((column) => `${column}=EXCLUDED.${column}`)
    .join(",");
  await pool.query(
    `INSERT INTO ${table}(${names.join(",")}) VALUES (${placeholders})
     ON CONFLICT (id) DO UPDATE SET ${updates}`,
    values,
  );
};

export class PostgresAgentSocietyStore implements AgentSocietyStore {
  constructor(readonly pool: Pool) {}

  async saveOrganization(record: OrganizationRecord) {
    const parsed = OrganizationRecordSchema.parse(record);
    await insertRecord(this.pool, "organizations", parsed, {
      status: parsed.status,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listOrganizations(ownerId: string) {
    return list(
      this.pool,
      "organizations",
      ownerId,
      "updated_at",
      100,
      OrganizationRecordSchema,
    );
  }
  async saveDepartment(record: DepartmentRecord) {
    const parsed = DepartmentRecordSchema.parse(record);
    await insertRecord(this.pool, "departments", parsed, {
      organization_id: parsed.organizationId,
      lead_agent_id: parsed.leadAgentId,
      parent_department_id: parsed.parentDepartmentId ?? null,
      manager_assignment_id: parsed.managerAssignmentId ?? null,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listDepartments(ownerId: string) {
    return list(
      this.pool,
      "departments",
      ownerId,
      "updated_at",
      500,
      DepartmentRecordSchema,
    );
  }
  async saveRole(record: OrganizationalRoleRecord) {
    const parsed = OrganizationalRoleRecordSchema.parse(record);
    await this.pool.query(
      `INSERT INTO organizational_roles(id,owner_id,role,created_at,updated_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (owner_id,role) DO UPDATE SET updated_at=$5,record=$6`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.role,
        parsed.createdAt,
        parsed.updatedAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }
  listRoles(ownerId: string) {
    return list(
      this.pool,
      "organizational_roles",
      ownerId,
      "updated_at",
      200,
      OrganizationalRoleRecordSchema,
    );
  }
  async saveTeam(record: TeamRecord) {
    const parsed = TeamRecordSchema.parse(record);
    await insertRecord(this.pool, "teams", parsed, {
      organization_id: parsed.organizationId,
      department_id: parsed.departmentId,
      workflow_id: parsed.workflowId,
      complexity: parsed.complexity,
      risk: parsed.risk,
      status: parsed.status,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listTeams(ownerId: string, limit: number) {
    return list(this.pool, "teams", ownerId, "created_at", limit, TeamRecordSchema);
  }
  async saveTeamMember(record: TeamMemberRecord) {
    const parsed = TeamMemberRecordSchema.parse(record);
    await insertRecord(this.pool, "team_members", parsed, {
      team_id: parsed.teamId,
      agent_id: parsed.agentId,
      role_id: parsed.roleId,
      leadership: parsed.leadership,
      joined_at: parsed.joinedAt,
    });
  }
  listTeamMembers(ownerId: string, limit: number) {
    return list(
      this.pool,
      "team_members",
      ownerId,
      "joined_at",
      limit,
      TeamMemberRecordSchema,
    );
  }
  async saveDelegation(record: DelegationRecord) {
    const parsed = DelegationRecordSchema.parse(record);
    await insertRecord(this.pool, "agent_society_delegations", parsed, {
      team_id: parsed.teamId,
      from_agent_id: parsed.fromAgentId,
      to_agent_id: parsed.toAgentId,
      status: parsed.status,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listDelegations(ownerId: string, limit: number) {
    return list(
      this.pool,
      "agent_society_delegations",
      ownerId,
      "created_at",
      limit,
      DelegationRecordSchema,
    );
  }
  async saveDebate(record: DebateRecord) {
    const parsed = DebateRecordSchema.parse(record);
    await insertRecord(this.pool, "debates", parsed, {
      team_id: parsed.teamId,
      status: parsed.status,
      confidence: parsed.confidence,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listDebates(ownerId: string, limit: number) {
    return list(this.pool, "debates", ownerId, "created_at", limit, DebateRecordSchema);
  }
  async saveDebateArgument(record: DebateArgumentRecord) {
    const parsed = DebateArgumentRecordSchema.parse(record);
    await insertRecord(this.pool, "debate_arguments", parsed, {
      debate_id: parsed.debateId,
      agent_id: parsed.agentId,
      stance: parsed.stance,
      created_at: parsed.createdAt,
    });
  }
  listDebateArguments(ownerId: string, limit: number) {
    return list(
      this.pool,
      "debate_arguments",
      ownerId,
      "created_at",
      limit,
      DebateArgumentRecordSchema,
    );
  }
  async saveConsensus(record: SocietyConsensusRecord) {
    const parsed = SocietyConsensusRecordSchema.parse(record);
    await insertRecord(this.pool, "consensus_sessions", parsed, {
      team_id: parsed.teamId,
      rule: parsed.rule,
      confidence: parsed.confidence,
      human_escalation_required: parsed.humanEscalationRequired,
      created_at: parsed.createdAt,
    });
  }
  listConsensus(ownerId: string, limit: number) {
    return list(
      this.pool,
      "consensus_sessions",
      ownerId,
      "created_at",
      limit,
      SocietyConsensusRecordSchema,
    );
  }
  async savePeerReview(record: PeerReviewRecord) {
    const parsed = PeerReviewRecordSchema.parse(record);
    await insertRecord(this.pool, "peer_reviews", parsed, {
      team_id: parsed.teamId,
      reviewer_agent_id: parsed.reviewerAgentId,
      subject_agent_id: parsed.subjectAgentId,
      review_type: parsed.reviewType,
      confidence: parsed.confidence,
      created_at: parsed.createdAt,
    });
  }
  listPeerReviews(ownerId: string, limit: number) {
    return list(
      this.pool,
      "peer_reviews",
      ownerId,
      "created_at",
      limit,
      PeerReviewRecordSchema,
    );
  }
  async saveMentorship(record: MentorshipRecord) {
    const parsed = MentorshipRecordSchema.parse(record);
    await insertRecord(this.pool, "mentorships", parsed, {
      mentor_agent_id: parsed.mentorAgentId,
      mentee_agent_id: parsed.menteeAgentId,
      created_at: parsed.createdAt,
    });
  }
  listMentorships(ownerId: string, limit: number) {
    return list(
      this.pool,
      "mentorships",
      ownerId,
      "created_at",
      limit,
      MentorshipRecordSchema,
    );
  }
  async saveConflict(record: OrganizationalConflictRecord) {
    const parsed = OrganizationalConflictRecordSchema.parse(record);
    await insertRecord(this.pool, "conflicts", parsed, {
      team_id: parsed.teamId,
      conflict_type: parsed.conflictType,
      escalation_required: parsed.escalationRequired,
      status: parsed.status,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listConflicts(ownerId: string, limit: number) {
    return list(
      this.pool,
      "conflicts",
      ownerId,
      "created_at",
      limit,
      OrganizationalConflictRecordSchema,
    );
  }
  async saveMeeting(record: MeetingRecord) {
    const parsed = MeetingRecordSchema.parse(record);
    await insertRecord(this.pool, "meetings", parsed, {
      team_id: parsed.teamId,
      meeting_type: parsed.meetingType,
      created_at: parsed.createdAt,
    });
  }
  listMeetings(ownerId: string, limit: number) {
    return list(
      this.pool,
      "meetings",
      ownerId,
      "created_at",
      limit,
      MeetingRecordSchema,
    );
  }
  async saveCommunication(record: CommunicationRecord) {
    const parsed = CommunicationRecordSchema.parse(record);
    await insertRecord(this.pool, "communications", parsed, {
      team_id: parsed.teamId,
      sender_agent_id: parsed.senderAgentId,
      recipient_agent_id: parsed.recipientAgentId,
      message_type: parsed.messageType,
      created_at: parsed.createdAt,
    });
  }
  listCommunications(ownerId: string, limit: number) {
    return list(
      this.pool,
      "communications",
      ownerId,
      "created_at",
      limit,
      CommunicationRecordSchema,
    );
  }
  async saveReputation(record: ReputationScoreRecord) {
    const parsed = ReputationScoreRecordSchema.parse(record);
    await this.pool.query(
      `INSERT INTO reputation_scores(id,owner_id,agent_id,overall,updated_at,record,company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (owner_id,agent_id) DO UPDATE SET overall=$4,updated_at=$5,record=$6`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.agentId,
        parsed.overall,
        parsed.updatedAt,
        parsed,
        companyScope.companyId(parsed.ownerId) ?? null,
      ],
    );
  }
  listReputation(ownerId: string) {
    return list(
      this.pool,
      "reputation_scores",
      ownerId,
      "updated_at",
      500,
      ReputationScoreRecordSchema,
    );
  }
  async saveCollaborationEdge(record: CollaborationEdgeRecord) {
    const parsed = CollaborationEdgeRecordSchema.parse(record);
    await insertRecord(this.pool, "collaboration_edges", parsed, {
      source_agent_id: parsed.sourceAgentId,
      target_agent_id: parsed.targetAgentId,
      relationship: parsed.relationship,
      weight: parsed.weight,
      updated_at: parsed.updatedAt,
    });
  }
  listCollaborationEdges(ownerId: string) {
    return list(
      this.pool,
      "collaboration_edges",
      ownerId,
      "updated_at",
      1000,
      CollaborationEdgeRecordSchema,
    );
  }
  async saveMetric(record: OrganizationalMetricRecord) {
    const parsed = OrganizationalMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "organizational_metrics", parsed, {
      metric_name: parsed.metricName,
      value: parsed.value,
      trend: parsed.trend,
      measured_at: parsed.measuredAt,
    });
  }
  listMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "organizational_metrics",
      ownerId,
      "measured_at",
      limit,
      OrganizationalMetricRecordSchema,
    );
  }
  async saveMemory(record: OrganizationalMemoryRecord) {
    const parsed = OrganizationalMemoryRecordSchema.parse(record);
    await insertRecord(this.pool, "organizational_memory", parsed, {
      memory_type: parsed.memoryType,
      created_at: parsed.createdAt,
    });
  }
  listMemory(ownerId: string, limit: number) {
    return list(
      this.pool,
      "organizational_memory",
      ownerId,
      "created_at",
      limit,
      OrganizationalMemoryRecordSchema,
    );
  }
}
