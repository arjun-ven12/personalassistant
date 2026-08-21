import {
  HabitPatternSchema,
  LearnedPreferenceSchema,
  LearningCandidateSchema,
  LearningConflictSchema,
  LearningEventSchema,
  LearningSuggestionSchema,
  LearningTimelineEventSchema,
  SequencePatternSchema,
  type HabitPattern,
  type LearnedPreference,
  type LearningCandidate,
  type LearningConflict,
  type LearningEvent,
  type LearningSuggestion,
  type LearningTimelineEvent,
  type SequencePattern,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface LearningEngineStore {
  saveEvent(record: LearningEvent): Awaitable<void>;
  listEvents(ownerId: string, limit: number): Awaitable<LearningEvent[]>;
  saveCandidate(record: LearningCandidate): Awaitable<void>;
  findCandidate(
    ownerId: string,
    category: LearningCandidate["category"],
    subject: string,
    candidateValue: string,
    contextKey: string,
  ): Awaitable<LearningCandidate | null>;
  getCandidate(ownerId: string, id: string): Awaitable<LearningCandidate | null>;
  listCandidates(ownerId: string, limit: number): Awaitable<LearningCandidate[]>;
  savePreference(record: LearnedPreference): Awaitable<void>;
  getPreference(ownerId: string, id: string): Awaitable<LearnedPreference | null>;
  findActivePreference(
    ownerId: string,
    category: LearnedPreference["category"],
    subject: string,
    contextKey: string,
  ): Awaitable<LearnedPreference | null>;
  listPreferences(ownerId: string, limit: number): Awaitable<LearnedPreference[]>;
  saveSequence(record: SequencePattern): Awaitable<void>;
  findSequence(ownerId: string, sequenceKey: string): Awaitable<SequencePattern | null>;
  listSequences(ownerId: string, limit: number): Awaitable<SequencePattern[]>;
  saveHabit(record: HabitPattern): Awaitable<void>;
  findHabit(ownerId: string, habitKey: string): Awaitable<HabitPattern | null>;
  listHabits(ownerId: string, limit: number): Awaitable<HabitPattern[]>;
  saveSuggestion(record: LearningSuggestion): Awaitable<void>;
  getSuggestion(ownerId: string, id: string): Awaitable<LearningSuggestion | null>;
  findSuggestion(
    ownerId: string,
    candidateId: string,
  ): Awaitable<LearningSuggestion | null>;
  listSuggestions(ownerId: string, limit: number): Awaitable<LearningSuggestion[]>;
  saveConflict(record: LearningConflict): Awaitable<void>;
  listConflicts(ownerId: string, limit: number): Awaitable<LearningConflict[]>;
  saveTimeline(record: LearningTimelineEvent): Awaitable<void>;
  listTimeline(ownerId: string, limit: number): Awaitable<LearningTimelineEvent[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemoryLearningEngineStore implements LearningEngineStore {
  readonly #events = new Map<string, LearningEvent>();
  readonly #candidates = new Map<string, LearningCandidate>();
  readonly #preferences = new Map<string, LearnedPreference>();
  readonly #sequences = new Map<string, SequencePattern>();
  readonly #sequenceKeys = new Map<string, string>();
  readonly #habits = new Map<string, HabitPattern>();
  readonly #habitKeys = new Map<string, string>();
  readonly #suggestions = new Map<string, LearningSuggestion>();
  readonly #conflicts = new Map<string, LearningConflict>();
  readonly #timeline = new Map<string, LearningTimelineEvent>();

  saveEvent(record: LearningEvent) {
    const parsed = LearningEventSchema.parse(record);
    this.#events.set(parsed.id, clone(parsed));
  }

  listEvents(ownerId: string, limit: number) {
    return ordered(
      [...this.#events.values()].filter((item) => item.ownerId === ownerId),
      "timestamp",
      limit,
    );
  }

  saveCandidate(record: LearningCandidate) {
    const parsed = LearningCandidateSchema.parse(record);
    this.#candidates.set(parsed.id, clone(parsed));
  }

  findCandidate(
    ownerId: string,
    category: LearningCandidate["category"],
    subject: string,
    candidateValue: string,
    contextKey: string,
  ) {
    const candidate = [...this.#candidates.values()].find(
      (item) =>
        item.ownerId === ownerId &&
        item.category === category &&
        item.subject === subject &&
        item.candidateValue === candidateValue &&
        contextKeyFor(item.context) === contextKey &&
        !["EXPIRED", "SUPERSEDED"].includes(item.status),
    );
    return candidate ? clone(candidate) : null;
  }

  getCandidate(ownerId: string, id: string) {
    const candidate = this.#candidates.get(id);
    return candidate?.ownerId === ownerId ? clone(candidate) : null;
  }

  listCandidates(ownerId: string, limit: number) {
    return ordered(
      [...this.#candidates.values()].filter((item) => item.ownerId === ownerId),
      "lastObservedAt",
      limit,
    );
  }

  savePreference(record: LearnedPreference) {
    const parsed = LearnedPreferenceSchema.parse(record);
    this.#preferences.set(parsed.id, clone(parsed));
  }

  getPreference(ownerId: string, id: string) {
    const preference = this.#preferences.get(id);
    return preference?.ownerId === ownerId ? clone(preference) : null;
  }

  findActivePreference(
    ownerId: string,
    category: LearnedPreference["category"],
    subject: string,
    contextKey: string,
  ) {
    const preference = [...this.#preferences.values()].find(
      (item) =>
        item.ownerId === ownerId &&
        item.category === category &&
        item.subject === subject &&
        contextKeyFor(item.context) === contextKey &&
        ["ACTIVE", "LOCKED"].includes(item.status),
    );
    return preference ? clone(preference) : null;
  }

  listPreferences(ownerId: string, limit: number) {
    return ordered(
      [...this.#preferences.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }

  saveSequence(record: SequencePattern) {
    const parsed = SequencePatternSchema.parse(record);
    this.#sequences.set(parsed.id, clone(parsed));
    this.#sequenceKeys.set(sequenceKeyFor(parsed), parsed.id);
  }

  findSequence(ownerId: string, sequenceKey: string) {
    const id = this.#sequenceKeys.get(`${ownerId}:${sequenceKey}`);
    const sequence = id ? this.#sequences.get(id) : undefined;
    return sequence ? clone(sequence) : null;
  }

  listSequences(ownerId: string, limit: number) {
    return ordered(
      [...this.#sequences.values()].filter((item) => item.ownerId === ownerId),
      "lastSeenAt",
      limit,
    );
  }

  saveHabit(record: HabitPattern) {
    const parsed = HabitPatternSchema.parse(record);
    this.#habits.set(parsed.id, clone(parsed));
    this.#habitKeys.set(habitKeyFor(parsed), parsed.id);
  }

  findHabit(ownerId: string, habitKey: string) {
    const id = this.#habitKeys.get(`${ownerId}:${habitKey}`);
    const habit = id ? this.#habits.get(id) : undefined;
    return habit ? clone(habit) : null;
  }

  listHabits(ownerId: string, limit: number) {
    return ordered(
      [...this.#habits.values()].filter((item) => item.ownerId === ownerId),
      "lastSeenAt",
      limit,
    );
  }

  saveSuggestion(record: LearningSuggestion) {
    const parsed = LearningSuggestionSchema.parse(record);
    this.#suggestions.set(parsed.id, clone(parsed));
  }

  getSuggestion(ownerId: string, id: string) {
    const suggestion = this.#suggestions.get(id);
    return suggestion?.ownerId === ownerId ? clone(suggestion) : null;
  }

  findSuggestion(ownerId: string, candidateId: string) {
    const suggestion = [...this.#suggestions.values()].find(
      (item) => item.ownerId === ownerId && item.candidateId === candidateId,
    );
    return suggestion ? clone(suggestion) : null;
  }

  listSuggestions(ownerId: string, limit: number) {
    return ordered(
      [...this.#suggestions.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }

  saveConflict(record: LearningConflict) {
    const parsed = LearningConflictSchema.parse(record);
    this.#conflicts.set(parsed.id, clone(parsed));
  }

  listConflicts(ownerId: string, limit: number) {
    return ordered(
      [...this.#conflicts.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }

  saveTimeline(record: LearningTimelineEvent) {
    const parsed = LearningTimelineEventSchema.parse(record);
    this.#timeline.set(parsed.id, clone(parsed));
  }

  listTimeline(ownerId: string, limit: number) {
    return ordered(
      [...this.#timeline.values()].filter((item) => item.ownerId === ownerId),
      "occurredAt",
      limit,
    );
  }
}

export const contextKeyFor = (context: LearningCandidate["context"]) =>
  [
    context.level,
    context.projectId ?? "",
    context.applicationId ?? "",
    context.workflowId ?? "",
    context.agentId ?? "",
    context.profileId ?? "",
    context.modality ?? "",
    context.timeBucket ?? "",
    context.weekdayBucket ?? "",
  ].join("|");

const sequenceKeyFor = (record: SequencePattern) =>
  `${record.ownerId}:${record.orderedActions.join(">")}:${contextKeyFor(record.context)}`;

const habitKeyFor = (record: HabitPattern) =>
  `${record.ownerId}:${record.category}:${record.subject}:${record.value}:${contextKeyFor(record.context)}`;
