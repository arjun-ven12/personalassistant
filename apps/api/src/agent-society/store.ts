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
import { companyScope } from "../companies/scope.js";

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
const scopedKey = (ownerId: string, id: string) =>
  `${ownerId}:${companyScope.companyId(ownerId) ?? "owner-default"}:${id}`;
const scopedPrefix = (ownerId: string) =>
  `${ownerId}:${companyScope.companyId(ownerId) ?? "owner-default"}:`;
const scopedValues = <T extends { ownerId: string }>(values: Map<string, T>, ownerId: string) =>
  [...values.entries()]
    .filter(([key, value]) => key.startsWith(scopedPrefix(ownerId)) && value.ownerId === ownerId)
    .map(([, value]) => value);
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
    const parsed = OrganizationRecordSchema.parse(record);
    this.#organizations.set(scopedKey(parsed.ownerId, parsed.id), clone(parsed));
  }
  listOrganizations(ownerId: string) {
    return scopedValues(this.#organizations, ownerId).map(clone);
  }
  saveDepartment(record: DepartmentRecord) {
    const parsed = DepartmentRecordSchema.parse(record);
    this.#departments.set(scopedKey(parsed.ownerId, parsed.id), clone(parsed));
  }
  listDepartments(ownerId: string) {
    return scopedValues(this.#departments, ownerId).map(clone);
  }
  saveRole(record: OrganizationalRoleRecord) {
    const parsed = OrganizationalRoleRecordSchema.parse(record);
    this.#roles.set(scopedKey(parsed.ownerId, parsed.role), clone(parsed));
  }
  listRoles(ownerId: string) {
    return scopedValues(this.#roles, ownerId).map(clone);
  }
  saveTeam(record: TeamRecord) {
    const parsed = TeamRecordSchema.parse(record);
    this.#teams.set(scopedKey(parsed.ownerId, parsed.id), clone(parsed));
  }
  listTeams(ownerId: string, limit: number) {
    return ordered(
      scopedValues(this.#teams, ownerId),
      "createdAt",
      limit,
    );
  }
  saveTeamMember(record: TeamMemberRecord) {
    const parsed = TeamMemberRecordSchema.parse(record);
    this.#members.set(scopedKey(parsed.ownerId, parsed.id), clone(parsed));
  }
  listTeamMembers(ownerId: string, limit: number) {
    return ordered(
      scopedValues(this.#members, ownerId),
      "joinedAt",
      limit,
    );
  }
  saveDelegation(record: DelegationRecord) {
    const parsed = DelegationRecordSchema.parse(record);
    this.#delegations.set(scopedKey(parsed.ownerId, parsed.id), clone(parsed));
  }
  listDelegations(ownerId: string, limit: number) {
    return ordered(
      scopedValues(this.#delegations, ownerId),
      "createdAt",
      limit,
    );
  }
  saveDebate(record: DebateRecord) {
    const parsed = DebateRecordSchema.parse(record);
    this.#debates.set(scopedKey(parsed.ownerId, parsed.id), clone(parsed));
  }
  listDebates(ownerId: string, limit: number) {
    return ordered(
      scopedValues(this.#debates, ownerId),
      "createdAt",
      limit,
    );
  }
  saveDebateArgument(record: DebateArgumentRecord) {
    const parsed = DebateArgumentRecordSchema.parse(record);
    this.#arguments.set(scopedKey(parsed.ownerId, parsed.id), clone(parsed));
  }
  listDebateArguments(ownerId: string, limit: number) {
    return ordered(
      scopedValues(this.#arguments, ownerId),
      "createdAt",
      limit,
    );
  }
  saveConsensus(record: SocietyConsensusRecord) {
    const parsed = SocietyConsensusRecordSchema.parse(record);
    this.#consensus.set(scopedKey(parsed.ownerId, parsed.id), clone(parsed));
  }
  listConsensus(ownerId: string, limit: number) {
    return ordered(
      scopedValues(this.#consensus, ownerId),
      "createdAt",
      limit,
    );
  }
  savePeerReview(record: PeerReviewRecord) {
    const parsed = PeerReviewRecordSchema.parse(record);
    this.#reviews.set(scopedKey(parsed.ownerId, parsed.id), clone(parsed));
  }
  listPeerReviews(ownerId: string, limit: number) {
    return ordered(
      scopedValues(this.#reviews, ownerId),
      "createdAt",
      limit,
    );
  }
  saveMentorship(record: MentorshipRecord) {
    const parsed = MentorshipRecordSchema.parse(record);
    this.#mentorships.set(scopedKey(parsed.ownerId, parsed.id), clone(parsed));
  }
  listMentorships(ownerId: string, limit: number) {
    return ordered(
      scopedValues(this.#mentorships, ownerId),
      "createdAt",
      limit,
    );
  }
  saveConflict(record: OrganizationalConflictRecord) {
    this.#conflicts.set(
      scopedKey(record.ownerId, record.id),
      clone(OrganizationalConflictRecordSchema.parse(record)),
    );
  }
  listConflicts(ownerId: string, limit: number) {
    return ordered(
      scopedValues(this.#conflicts, ownerId),
      "createdAt",
      limit,
    );
  }
  saveMeeting(record: MeetingRecord) {
    const parsed = MeetingRecordSchema.parse(record);
    this.#meetings.set(scopedKey(parsed.ownerId, parsed.id), clone(parsed));
  }
  listMeetings(ownerId: string, limit: number) {
    return ordered(
      scopedValues(this.#meetings, ownerId),
      "createdAt",
      limit,
    );
  }
  saveCommunication(record: CommunicationRecord) {
    const parsed = CommunicationRecordSchema.parse(record);
    this.#communications.set(scopedKey(parsed.ownerId, parsed.id), clone(parsed));
  }
  listCommunications(ownerId: string, limit: number) {
    return ordered(
      scopedValues(this.#communications, ownerId),
      "createdAt",
      limit,
    );
  }
  saveReputation(record: ReputationScoreRecord) {
    const parsed = ReputationScoreRecordSchema.parse(record);
    this.#reputation.set(scopedKey(parsed.ownerId, parsed.agentId), clone(parsed));
  }
  listReputation(ownerId: string) {
    return scopedValues(this.#reputation, ownerId).map(clone);
  }
  saveCollaborationEdge(record: CollaborationEdgeRecord) {
    const parsed = CollaborationEdgeRecordSchema.parse(record);
    this.#edges.set(
      scopedKey(parsed.ownerId, `${parsed.sourceAgentId}:${parsed.targetAgentId}:${parsed.relationship}`),
      clone(parsed),
    );
  }
  listCollaborationEdges(ownerId: string) {
    return scopedValues(this.#edges, ownerId).map(clone);
  }
  saveMetric(record: OrganizationalMetricRecord) {
    const parsed = OrganizationalMetricRecordSchema.parse(record);
    this.#metrics.set(scopedKey(parsed.ownerId, parsed.id), clone(parsed));
  }
  listMetrics(ownerId: string, limit: number) {
    return ordered(
      scopedValues(this.#metrics, ownerId),
      "measuredAt",
      limit,
    );
  }
  saveMemory(record: OrganizationalMemoryRecord) {
    const parsed = OrganizationalMemoryRecordSchema.parse(record);
    this.#memory.set(scopedKey(parsed.ownerId, parsed.id), clone(parsed));
  }
  listMemory(ownerId: string, limit: number) {
    return ordered(
      scopedValues(this.#memory, ownerId),
      "createdAt",
      limit,
    );
  }
}
