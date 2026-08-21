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

import type { Awaitable } from "../identity/store.js";

export interface AgentSocietyStore {
  saveOrganization(record: OrganizationRecord): Awaitable<void>;
  listOrganizations(ownerId: string): Awaitable<OrganizationRecord[]>;
  saveDepartment(record: DepartmentRecord): Awaitable<void>;
  listDepartments(ownerId: string): Awaitable<DepartmentRecord[]>;
  saveRole(record: OrganizationalRoleRecord): Awaitable<void>;
  listRoles(ownerId: string): Awaitable<OrganizationalRoleRecord[]>;
  saveTeam(record: TeamRecord): Awaitable<void>;
  listTeams(ownerId: string, limit: number): Awaitable<TeamRecord[]>;
  saveTeamMember(record: TeamMemberRecord): Awaitable<void>;
  listTeamMembers(ownerId: string, limit: number): Awaitable<TeamMemberRecord[]>;
  saveDelegation(record: DelegationRecord): Awaitable<void>;
  listDelegations(ownerId: string, limit: number): Awaitable<DelegationRecord[]>;
  saveDebate(record: DebateRecord): Awaitable<void>;
  listDebates(ownerId: string, limit: number): Awaitable<DebateRecord[]>;
  saveDebateArgument(record: DebateArgumentRecord): Awaitable<void>;
  listDebateArguments(
    ownerId: string,
    limit: number,
  ): Awaitable<DebateArgumentRecord[]>;
  saveConsensus(record: SocietyConsensusRecord): Awaitable<void>;
  listConsensus(ownerId: string, limit: number): Awaitable<SocietyConsensusRecord[]>;
  savePeerReview(record: PeerReviewRecord): Awaitable<void>;
  listPeerReviews(ownerId: string, limit: number): Awaitable<PeerReviewRecord[]>;
  saveMentorship(record: MentorshipRecord): Awaitable<void>;
  listMentorships(ownerId: string, limit: number): Awaitable<MentorshipRecord[]>;
  saveConflict(record: OrganizationalConflictRecord): Awaitable<void>;
  listConflicts(
    ownerId: string,
    limit: number,
  ): Awaitable<OrganizationalConflictRecord[]>;
  saveMeeting(record: MeetingRecord): Awaitable<void>;
  listMeetings(ownerId: string, limit: number): Awaitable<MeetingRecord[]>;
  saveCommunication(record: CommunicationRecord): Awaitable<void>;
  listCommunications(ownerId: string, limit: number): Awaitable<CommunicationRecord[]>;
  saveReputation(record: ReputationScoreRecord): Awaitable<void>;
  listReputation(ownerId: string): Awaitable<ReputationScoreRecord[]>;
  saveCollaborationEdge(record: CollaborationEdgeRecord): Awaitable<void>;
  listCollaborationEdges(ownerId: string): Awaitable<CollaborationEdgeRecord[]>;
  saveMetric(record: OrganizationalMetricRecord): Awaitable<void>;
  listMetrics(ownerId: string, limit: number): Awaitable<OrganizationalMetricRecord[]>;
  saveMemory(record: OrganizationalMemoryRecord): Awaitable<void>;
  listMemory(ownerId: string, limit: number): Awaitable<OrganizationalMemoryRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map((item) => clone(item));

export class InMemoryAgentSocietyStore implements AgentSocietyStore {
  readonly #organizations = new Map<string, OrganizationRecord>();
  readonly #departments = new Map<string, DepartmentRecord>();
  readonly #roles = new Map<string, OrganizationalRoleRecord>();
  readonly #teams = new Map<string, TeamRecord>();
  readonly #members = new Map<string, TeamMemberRecord>();
  readonly #delegations = new Map<string, DelegationRecord>();
  readonly #debates = new Map<string, DebateRecord>();
  readonly #arguments = new Map<string, DebateArgumentRecord>();
  readonly #consensus = new Map<string, SocietyConsensusRecord>();
  readonly #reviews = new Map<string, PeerReviewRecord>();
  readonly #mentorships = new Map<string, MentorshipRecord>();
  readonly #conflicts = new Map<string, OrganizationalConflictRecord>();
  readonly #meetings = new Map<string, MeetingRecord>();
  readonly #communications = new Map<string, CommunicationRecord>();
  readonly #reputation = new Map<string, ReputationScoreRecord>();
  readonly #edges = new Map<string, CollaborationEdgeRecord>();
  readonly #metrics = new Map<string, OrganizationalMetricRecord>();
  readonly #memory = new Map<string, OrganizationalMemoryRecord>();

  saveOrganization(record: OrganizationRecord) {
    this.#organizations.set(record.id, clone(OrganizationRecordSchema.parse(record)));
  }
  listOrganizations(ownerId: string) {
    return [...this.#organizations.values()]
      .filter((item) => item.ownerId === ownerId)
      .map(clone);
  }
  saveDepartment(record: DepartmentRecord) {
    this.#departments.set(record.id, clone(DepartmentRecordSchema.parse(record)));
  }
  listDepartments(ownerId: string) {
    return [...this.#departments.values()]
      .filter((item) => item.ownerId === ownerId)
      .map(clone);
  }
  saveRole(record: OrganizationalRoleRecord) {
    const parsed = OrganizationalRoleRecordSchema.parse(record);
    this.#roles.set(`${parsed.ownerId}:${parsed.role}`, clone(parsed));
  }
  listRoles(ownerId: string) {
    return [...this.#roles.values()]
      .filter((item) => item.ownerId === ownerId)
      .map(clone);
  }
  saveTeam(record: TeamRecord) {
    this.#teams.set(record.id, clone(TeamRecordSchema.parse(record)));
  }
  listTeams(ownerId: string, limit: number) {
    return ordered(
      [...this.#teams.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveTeamMember(record: TeamMemberRecord) {
    this.#members.set(record.id, clone(TeamMemberRecordSchema.parse(record)));
  }
  listTeamMembers(ownerId: string, limit: number) {
    return ordered(
      [...this.#members.values()].filter((item) => item.ownerId === ownerId),
      "joinedAt",
      limit,
    );
  }
  saveDelegation(record: DelegationRecord) {
    this.#delegations.set(record.id, clone(DelegationRecordSchema.parse(record)));
  }
  listDelegations(ownerId: string, limit: number) {
    return ordered(
      [...this.#delegations.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveDebate(record: DebateRecord) {
    this.#debates.set(record.id, clone(DebateRecordSchema.parse(record)));
  }
  listDebates(ownerId: string, limit: number) {
    return ordered(
      [...this.#debates.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveDebateArgument(record: DebateArgumentRecord) {
    this.#arguments.set(record.id, clone(DebateArgumentRecordSchema.parse(record)));
  }
  listDebateArguments(ownerId: string, limit: number) {
    return ordered(
      [...this.#arguments.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveConsensus(record: SocietyConsensusRecord) {
    this.#consensus.set(record.id, clone(SocietyConsensusRecordSchema.parse(record)));
  }
  listConsensus(ownerId: string, limit: number) {
    return ordered(
      [...this.#consensus.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  savePeerReview(record: PeerReviewRecord) {
    this.#reviews.set(record.id, clone(PeerReviewRecordSchema.parse(record)));
  }
  listPeerReviews(ownerId: string, limit: number) {
    return ordered(
      [...this.#reviews.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveMentorship(record: MentorshipRecord) {
    this.#mentorships.set(record.id, clone(MentorshipRecordSchema.parse(record)));
  }
  listMentorships(ownerId: string, limit: number) {
    return ordered(
      [...this.#mentorships.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveConflict(record: OrganizationalConflictRecord) {
    this.#conflicts.set(
      record.id,
      clone(OrganizationalConflictRecordSchema.parse(record)),
    );
  }
  listConflicts(ownerId: string, limit: number) {
    return ordered(
      [...this.#conflicts.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveMeeting(record: MeetingRecord) {
    this.#meetings.set(record.id, clone(MeetingRecordSchema.parse(record)));
  }
  listMeetings(ownerId: string, limit: number) {
    return ordered(
      [...this.#meetings.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveCommunication(record: CommunicationRecord) {
    this.#communications.set(record.id, clone(CommunicationRecordSchema.parse(record)));
  }
  listCommunications(ownerId: string, limit: number) {
    return ordered(
      [...this.#communications.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveReputation(record: ReputationScoreRecord) {
    const parsed = ReputationScoreRecordSchema.parse(record);
    this.#reputation.set(`${parsed.ownerId}:${parsed.agentId}`, clone(parsed));
  }
  listReputation(ownerId: string) {
    return [...this.#reputation.values()]
      .filter((item) => item.ownerId === ownerId)
      .map(clone);
  }
  saveCollaborationEdge(record: CollaborationEdgeRecord) {
    const parsed = CollaborationEdgeRecordSchema.parse(record);
    this.#edges.set(
      `${parsed.ownerId}:${parsed.sourceAgentId}:${parsed.targetAgentId}:${parsed.relationship}`,
      clone(parsed),
    );
  }
  listCollaborationEdges(ownerId: string) {
    return [...this.#edges.values()]
      .filter((item) => item.ownerId === ownerId)
      .map(clone);
  }
  saveMetric(record: OrganizationalMetricRecord) {
    this.#metrics.set(record.id, clone(OrganizationalMetricRecordSchema.parse(record)));
  }
  listMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#metrics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  saveMemory(record: OrganizationalMemoryRecord) {
    this.#memory.set(record.id, clone(OrganizationalMemoryRecordSchema.parse(record)));
  }
  listMemory(ownerId: string, limit: number) {
    return ordered(
      [...this.#memory.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
}
