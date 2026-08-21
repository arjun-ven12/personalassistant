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
import type { Pool } from "pg";

import { contextKeyFor, type LearningEngineStore } from "./store.js";

const list = async <T>(
  pool: Pool,
  table: string,
  ownerId: string,
  order: string,
  limit: number,
  schema: { parse: (value: unknown) => T },
) => {
  const result = await pool.query<{ record: unknown }>(
    `SELECT record FROM ${table} WHERE owner_id=$1 ORDER BY ${order} DESC LIMIT $2`,
    [ownerId, limit],
  );
  return result.rows.map((row) => schema.parse(row.record));
};

export class PostgresLearningEngineStore implements LearningEngineStore {
  constructor(readonly pool: Pool) {}

  async saveEvent(record: LearningEvent) {
    const parsed = LearningEventSchema.parse(record);
    await this.pool.query(
      `INSERT INTO learning_engine_events(
        id,owner_id,category,subject,observed_value,source_type,source_id,timestamp,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.category,
        parsed.subject,
        parsed.observedValue,
        parsed.sourceType,
        parsed.sourceId,
        parsed.timestamp,
        parsed,
      ],
    );
  }

  listEvents(ownerId: string, limit: number) {
    return list(
      this.pool,
      "learning_engine_events",
      ownerId,
      "timestamp",
      limit,
      LearningEventSchema,
    );
  }

  async saveCandidate(record: LearningCandidate) {
    const parsed = LearningCandidateSchema.parse(record);
    await this.pool.query(
      `INSERT INTO learning_candidates(
        id,owner_id,category,subject,candidate_value,context_key,status,confidence,evidence_count,last_observed_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE
       SET status=$7,confidence=$8,evidence_count=$9,last_observed_at=$10,record=$11`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.category,
        parsed.subject,
        parsed.candidateValue,
        contextKeyFor(parsed.context),
        parsed.status,
        parsed.confidence,
        parsed.evidenceCount,
        parsed.lastObservedAt,
        parsed,
      ],
    );
  }

  async findCandidate(
    ownerId: string,
    category: LearningCandidate["category"],
    subject: string,
    candidateValue: string,
    contextKey: string,
  ) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM learning_candidates
       WHERE owner_id=$1 AND category=$2 AND subject=$3 AND candidate_value=$4 AND context_key=$5
       AND status NOT IN ('EXPIRED','SUPERSEDED')
       ORDER BY last_observed_at DESC LIMIT 1`,
      [ownerId, category, subject, candidateValue, contextKey],
    );
    return result.rows[0] ? LearningCandidateSchema.parse(result.rows[0].record) : null;
  }

  async getCandidate(ownerId: string, id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM learning_candidates WHERE owner_id=$1 AND id=$2",
      [ownerId, id],
    );
    return result.rows[0] ? LearningCandidateSchema.parse(result.rows[0].record) : null;
  }

  listCandidates(ownerId: string, limit: number) {
    return list(
      this.pool,
      "learning_candidates",
      ownerId,
      "last_observed_at",
      limit,
      LearningCandidateSchema,
    );
  }

  async savePreference(record: LearnedPreference) {
    const parsed = LearnedPreferenceSchema.parse(record);
    await this.pool.query(
      `INSERT INTO learned_preferences(
        id,owner_id,category,subject,value,context_key,status,confidence,updated_at,record
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE
       SET status=$7,confidence=$8,updated_at=$9,record=$10`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.category,
        parsed.subject,
        parsed.value,
        contextKeyFor(parsed.context),
        parsed.status,
        parsed.confidence,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  async getPreference(ownerId: string, id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM learned_preferences WHERE owner_id=$1 AND id=$2",
      [ownerId, id],
    );
    return result.rows[0] ? LearnedPreferenceSchema.parse(result.rows[0].record) : null;
  }

  async findActivePreference(
    ownerId: string,
    category: LearnedPreference["category"],
    subject: string,
    contextKey: string,
  ) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM learned_preferences
       WHERE owner_id=$1 AND category=$2 AND subject=$3 AND context_key=$4 AND status IN ('ACTIVE','LOCKED')
       ORDER BY updated_at DESC LIMIT 1`,
      [ownerId, category, subject, contextKey],
    );
    return result.rows[0] ? LearnedPreferenceSchema.parse(result.rows[0].record) : null;
  }

  listPreferences(ownerId: string, limit: number) {
    return list(
      this.pool,
      "learned_preferences",
      ownerId,
      "updated_at",
      limit,
      LearnedPreferenceSchema,
    );
  }

  async saveSequence(record: SequencePattern) {
    const parsed = SequencePatternSchema.parse(record);
    await this.pool.query(
      `INSERT INTO learning_sequences(id,owner_id,sequence_key,confidence,frequency,last_seen_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET confidence=$4,frequency=$5,last_seen_at=$6,record=$7`,
      [
        parsed.id,
        parsed.ownerId,
        `${parsed.orderedActions.join(">")}:${contextKeyFor(parsed.context)}`,
        parsed.confidence,
        parsed.frequency,
        parsed.lastSeenAt,
        parsed,
      ],
    );
  }

  async findSequence(ownerId: string, sequenceKey: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM learning_sequences WHERE owner_id=$1 AND sequence_key=$2 LIMIT 1",
      [ownerId, sequenceKey],
    );
    return result.rows[0] ? SequencePatternSchema.parse(result.rows[0].record) : null;
  }

  listSequences(ownerId: string, limit: number) {
    return list(
      this.pool,
      "learning_sequences",
      ownerId,
      "last_seen_at",
      limit,
      SequencePatternSchema,
    );
  }

  async saveHabit(record: HabitPattern) {
    const parsed = HabitPatternSchema.parse(record);
    await this.pool.query(
      `INSERT INTO learning_habits(id,owner_id,habit_key,category,confidence,frequency,last_seen_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET confidence=$5,frequency=$6,last_seen_at=$7,record=$8`,
      [
        parsed.id,
        parsed.ownerId,
        `${parsed.category}:${parsed.subject}:${parsed.value}:${contextKeyFor(parsed.context)}`,
        parsed.category,
        parsed.confidence,
        parsed.frequency,
        parsed.lastSeenAt,
        parsed,
      ],
    );
  }

  async findHabit(ownerId: string, habitKey: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM learning_habits WHERE owner_id=$1 AND habit_key=$2 LIMIT 1",
      [ownerId, habitKey],
    );
    return result.rows[0] ? HabitPatternSchema.parse(result.rows[0].record) : null;
  }

  listHabits(ownerId: string, limit: number) {
    return list(
      this.pool,
      "learning_habits",
      ownerId,
      "last_seen_at",
      limit,
      HabitPatternSchema,
    );
  }

  async saveSuggestion(record: LearningSuggestion) {
    const parsed = LearningSuggestionSchema.parse(record);
    await this.pool.query(
      `INSERT INTO learning_suggestions(id,owner_id,candidate_id,status,confidence,updated_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET status=$4,confidence=$5,updated_at=$6,record=$7`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.candidateId,
        parsed.status,
        parsed.confidence,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  async getSuggestion(ownerId: string, id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM learning_suggestions WHERE owner_id=$1 AND id=$2",
      [ownerId, id],
    );
    return result.rows[0]
      ? LearningSuggestionSchema.parse(result.rows[0].record)
      : null;
  }

  async findSuggestion(ownerId: string, candidateId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM learning_suggestions WHERE owner_id=$1 AND candidate_id=$2 ORDER BY updated_at DESC LIMIT 1",
      [ownerId, candidateId],
    );
    return result.rows[0]
      ? LearningSuggestionSchema.parse(result.rows[0].record)
      : null;
  }

  listSuggestions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "learning_suggestions",
      ownerId,
      "updated_at",
      limit,
      LearningSuggestionSchema,
    );
  }

  async saveConflict(record: LearningConflict) {
    const parsed = LearningConflictSchema.parse(record);
    await this.pool.query(
      `INSERT INTO learning_conflicts(id,owner_id,category,subject,status,updated_at,record)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET status=$5,updated_at=$6,record=$7`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.category,
        parsed.subject,
        parsed.status,
        parsed.updatedAt,
        parsed,
      ],
    );
  }

  listConflicts(ownerId: string, limit: number) {
    return list(
      this.pool,
      "learning_conflicts",
      ownerId,
      "updated_at",
      limit,
      LearningConflictSchema,
    );
  }

  async saveTimeline(record: LearningTimelineEvent) {
    const parsed = LearningTimelineEventSchema.parse(record);
    await this.pool.query(
      `INSERT INTO learning_timeline(id,owner_id,event_type,occurred_at,record)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO NOTHING`,
      [parsed.id, parsed.ownerId, parsed.eventType, parsed.occurredAt, parsed],
    );
  }

  listTimeline(ownerId: string, limit: number) {
    return list(
      this.pool,
      "learning_timeline",
      ownerId,
      "occurred_at",
      limit,
      LearningTimelineEventSchema,
    );
  }
}
