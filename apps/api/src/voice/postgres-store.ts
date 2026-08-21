import {
  ClarificationHistoryRecordSchema,
  ConversationHistoryRecordSchema,
  ConversationAnalyticsRecordSchema,
  ConversationBookmarkRecordSchema,
  ConversationContextRecordSchema,
  ConversationContinuityRecordSchema,
  ConversationGoalRecordSchema,
  ConversationPersonaRecordSchema,
  ConversationSessionRecordSchema,
  ConversationSummaryRecordSchema,
  ConversationTopicRecordSchema,
  ConversationTurnFeedbackRecordSchema,
  MicrophonePreferenceRecordSchema,
  SttProviderMetricRecordSchema,
  TtsProfileRecordSchema,
  VoiceMetricRecordSchema,
  VoiceProfileRecordSchema,
  VoiceSessionRecordSchema,
  VoiceShortcutRecordSchema,
  WakeWordSettingsRecordSchema,
  type ClarificationHistoryRecord,
  type ConversationHistoryRecord,
  type ConversationAnalyticsRecord,
  type ConversationBookmarkRecord,
  type ConversationContextRecord,
  type ConversationContinuityRecord,
  type ConversationGoalRecord,
  type ConversationPersonaRecord,
  type ConversationSessionRecord,
  type ConversationSummaryRecord,
  type ConversationTopicRecord,
  type ConversationTurnFeedbackRecord,
  type MicrophonePreferenceRecord,
  type SttProviderMetricRecord,
  type TtsProfileRecord,
  type VoiceMetricRecord,
  type VoiceProfileRecord,
  type VoiceSessionRecord,
  type VoiceShortcutRecord,
  type WakeWordSettingsRecord,
} from "@alexa-control/shared";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolClient } from "pg";

import type { VoiceStore } from "./store.js";

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

const insertRecord = async (
  pool: Pool,
  table: string,
  record: { id: string; ownerId: string },
  columns: Record<string, string | number | boolean | null>,
) => {
  const names = ["id", "owner_id", ...Object.keys(columns), "record"];
  const values = [record.id, record.ownerId, ...Object.values(columns), record];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
  await pool.query(
    `INSERT INTO ${table}(${names.join(",")}) VALUES (${placeholders})
     ON CONFLICT (owner_id, id) DO UPDATE SET record=EXCLUDED.record`,
    values,
  );
};

export class PostgresVoiceStore implements VoiceStore {
  readonly #continuityClient = new AsyncLocalStorage<PoolClient>();

  constructor(readonly pool: Pool) {}

  async saveSession(record: VoiceSessionRecord) {
    const parsed = VoiceSessionRecordSchema.parse(record);
    await insertRecord(this.pool, "voice_sessions", parsed, {
      status: parsed.status,
      runtime_state: parsed.runtimeState,
      started_at: parsed.startedAt,
      ended_at: parsed.endedAt,
      updated_at: parsed.updatedAt,
    });
  }
  listSessions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "voice_sessions",
      ownerId,
      "updated_at",
      limit,
      VoiceSessionRecordSchema,
    );
  }
  async getSession(ownerId: string, sessionId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM voice_sessions WHERE owner_id=$1 AND id=$2",
      [ownerId, sessionId],
    );
    return result.rows[0]
      ? VoiceSessionRecordSchema.parse(result.rows[0].record)
      : null;
  }
  async saveProfile(record: VoiceProfileRecord) {
    const parsed = VoiceProfileRecordSchema.parse(record);
    await insertRecord(this.pool, "voice_profiles", parsed, {
      mode: parsed.mode,
      active: parsed.active,
      updated_at: parsed.updatedAt,
    });
  }
  listProfiles(ownerId: string, limit: number) {
    return list(
      this.pool,
      "voice_profiles",
      ownerId,
      "updated_at",
      limit,
      VoiceProfileRecordSchema,
    );
  }
  async saveShortcut(record: VoiceShortcutRecord) {
    const parsed = VoiceShortcutRecordSchema.parse(record);
    await insertRecord(this.pool, "voice_shortcuts", parsed, {
      phrase: parsed.phrase.toLowerCase(),
      enabled: parsed.enabled,
      updated_at: parsed.updatedAt,
    });
  }
  listShortcuts(ownerId: string, limit: number) {
    return list(
      this.pool,
      "voice_shortcuts",
      ownerId,
      "updated_at",
      limit,
      VoiceShortcutRecordSchema,
    );
  }
  async saveConversation(record: ConversationHistoryRecord) {
    const parsed = ConversationHistoryRecordSchema.parse(record);
    await insertRecord(this.pool, "conversation_history", parsed, {
      session_id: parsed.sessionId,
      role: parsed.role,
      command_id: parsed.commandId,
      created_at: parsed.createdAt,
    });
  }
  listConversation(ownerId: string, limit: number) {
    return list(
      this.pool,
      "conversation_history",
      ownerId,
      "created_at",
      limit,
      ConversationHistoryRecordSchema,
    );
  }
  async saveMetric(record: VoiceMetricRecord) {
    const parsed = VoiceMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "voice_metrics", parsed, {
      session_id: parsed.sessionId,
      provider: parsed.provider,
      measured_at: parsed.measuredAt,
    });
  }
  listMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "voice_metrics",
      ownerId,
      "measured_at",
      limit,
      VoiceMetricRecordSchema,
    );
  }
  async saveMicrophonePreference(record: MicrophonePreferenceRecord) {
    const parsed = MicrophonePreferenceRecordSchema.parse(record);
    await insertRecord(this.pool, "microphone_preferences", parsed, {
      permission_state: parsed.permissionState,
      updated_at: parsed.updatedAt,
    });
  }
  listMicrophonePreferences(ownerId: string, limit: number) {
    return list(
      this.pool,
      "microphone_preferences",
      ownerId,
      "updated_at",
      limit,
      MicrophonePreferenceRecordSchema,
    );
  }
  async saveWakeWordSettings(record: WakeWordSettingsRecord) {
    const parsed = WakeWordSettingsRecordSchema.parse(record);
    await insertRecord(this.pool, "wake_word_settings", parsed, {
      enabled: parsed.enabled,
      updated_at: parsed.updatedAt,
    });
  }
  listWakeWordSettings(ownerId: string, limit: number) {
    return list(
      this.pool,
      "wake_word_settings",
      ownerId,
      "updated_at",
      limit,
      WakeWordSettingsRecordSchema,
    );
  }
  async saveTtsProfile(record: TtsProfileRecord) {
    const parsed = TtsProfileRecordSchema.parse(record);
    await insertRecord(this.pool, "tts_profiles", parsed, {
      profile_id: parsed.profileId,
      provider: parsed.provider,
      updated_at: parsed.updatedAt,
    });
  }
  listTtsProfiles(ownerId: string, limit: number) {
    return list(
      this.pool,
      "tts_profiles",
      ownerId,
      "updated_at",
      limit,
      TtsProfileRecordSchema,
    );
  }
  async saveSttProviderMetric(record: SttProviderMetricRecord) {
    const parsed = SttProviderMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "stt_provider_metrics", parsed, {
      provider: parsed.provider,
      last_checked_at: parsed.lastCheckedAt,
    });
  }
  listSttProviderMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "stt_provider_metrics",
      ownerId,
      "last_checked_at",
      limit,
      SttProviderMetricRecordSchema,
    );
  }
  async saveConversationSession(record: ConversationSessionRecord) {
    const parsed = ConversationSessionRecordSchema.parse(record);
    await insertRecord(this.pool, "conversation_sessions", parsed, {
      lifecycle_state: parsed.lifecycleState,
      modality: parsed.modality,
      updated_at: parsed.updatedAt,
    });
  }
  listConversationSessions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "conversation_sessions",
      ownerId,
      "updated_at",
      limit,
      ConversationSessionRecordSchema,
    );
  }
  async saveConversationTopic(record: ConversationTopicRecord) {
    const parsed = ConversationTopicRecordSchema.parse(record);
    await insertRecord(this.pool, "conversation_topics", parsed, {
      conversation_id: parsed.conversationId,
      status: parsed.status,
      updated_at: parsed.updatedAt,
    });
  }
  listConversationTopics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "conversation_topics",
      ownerId,
      "updated_at",
      limit,
      ConversationTopicRecordSchema,
    );
  }
  async saveConversationGoal(record: ConversationGoalRecord) {
    const parsed = ConversationGoalRecordSchema.parse(record);
    await insertRecord(this.pool, "conversation_goals", parsed, {
      conversation_id: parsed.conversationId,
      status: parsed.status,
      updated_at: parsed.updatedAt,
    });
  }
  listConversationGoals(ownerId: string, limit: number) {
    return list(
      this.pool,
      "conversation_goals",
      ownerId,
      "updated_at",
      limit,
      ConversationGoalRecordSchema,
    );
  }
  async saveConversationSummary(record: ConversationSummaryRecord) {
    const parsed = ConversationSummaryRecordSchema.parse(record);
    await insertRecord(this.pool, "conversation_summaries", parsed, {
      conversation_id: parsed.conversationId,
      summary_type: parsed.summaryType,
      created_at: parsed.createdAt,
    });
  }
  listConversationSummaries(ownerId: string, limit: number) {
    return list(
      this.pool,
      "conversation_summaries",
      ownerId,
      "created_at",
      limit,
      ConversationSummaryRecordSchema,
    );
  }
  async saveConversationPersona(record: ConversationPersonaRecord) {
    const parsed = ConversationPersonaRecordSchema.parse(record);
    await insertRecord(this.pool, "conversation_personas", parsed, {
      mode: parsed.mode,
      active: parsed.active,
      updated_at: parsed.updatedAt,
    });
  }
  listConversationPersonas(ownerId: string, limit: number) {
    return list(
      this.pool,
      "conversation_personas",
      ownerId,
      "updated_at",
      limit,
      ConversationPersonaRecordSchema,
    );
  }
  async saveClarification(record: ClarificationHistoryRecord) {
    const parsed = ClarificationHistoryRecordSchema.parse(record);
    await insertRecord(this.pool, "clarification_history", parsed, {
      conversation_id: parsed.conversationId,
      status: parsed.status,
      updated_at: parsed.updatedAt,
    });
  }
  listClarifications(ownerId: string, limit: number) {
    return list(
      this.pool,
      "clarification_history",
      ownerId,
      "updated_at",
      limit,
      ClarificationHistoryRecordSchema,
    );
  }
  async saveConversationContext(record: ConversationContextRecord) {
    const parsed = ConversationContextRecordSchema.parse(record);
    await insertRecord(this.pool, "conversation_context", parsed, {
      conversation_id: parsed.conversationId,
      planner_state: parsed.plannerState,
      updated_at: parsed.updatedAt,
    });
  }
  listConversationContext(ownerId: string, limit: number) {
    return list(
      this.pool,
      "conversation_context",
      ownerId,
      "updated_at",
      limit,
      ConversationContextRecordSchema,
    );
  }
  async saveConversationContinuity(record: ConversationContinuityRecord) {
    const parsed = ConversationContinuityRecordSchema.parse(record);
    const database = this.#continuityClient.getStore() ?? this.pool;
    await database.query(
      `INSERT INTO conversation_continuity(id,owner_id,conversation_id,updated_at,record)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(owner_id,conversation_id) DO UPDATE SET
         updated_at=EXCLUDED.updated_at,
         record=EXCLUDED.record`,
      [parsed.id, parsed.ownerId, parsed.conversationId, parsed.updatedAt, parsed],
    );
  }
  async getConversationContinuity(ownerId: string, conversationId: string) {
    const database = this.#continuityClient.getStore() ?? this.pool;
    const result = await database.query<{ record: unknown }>(
      "SELECT record FROM conversation_continuity WHERE owner_id=$1 AND conversation_id=$2",
      [ownerId, conversationId],
    );
    return result.rows[0]
      ? ConversationContinuityRecordSchema.parse(result.rows[0].record)
      : null;
  }
  listConversationContinuity(ownerId: string, limit: number) {
    return list(
      this.pool,
      "conversation_continuity",
      ownerId,
      "updated_at",
      limit,
      ConversationContinuityRecordSchema,
    );
  }
  async claimConversationTurn(
    ownerId: string,
    conversationId: string,
    turnId: string,
    claimedAt: string,
  ) {
    const database = this.#continuityClient.getStore() ?? this.pool;
    const result = await database.query(
      `INSERT INTO conversation_continuity_turn_claims(owner_id,conversation_id,turn_id,claimed_at)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(owner_id,conversation_id,turn_id) DO NOTHING`,
      [ownerId, conversationId, turnId, claimedAt],
    );
    return (result.rowCount ?? 0) === 1;
  }
  async withConversationContinuityLock<T>(
    ownerId: string,
    conversationId: string,
    run: () => T | Promise<T>,
  ) {
    const client = await this.pool.connect();
    const lockKey = `${ownerId}:${conversationId}`;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);
      const result = await this.#continuityClient.run(client, run);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  async saveConversationAnalytics(record: ConversationAnalyticsRecord) {
    const parsed = ConversationAnalyticsRecordSchema.parse(record);
    await insertRecord(this.pool, "conversation_analytics", parsed, {
      conversation_id: parsed.conversationId,
      measured_at: parsed.measuredAt,
    });
  }
  listConversationAnalytics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "conversation_analytics",
      ownerId,
      "measured_at",
      limit,
      ConversationAnalyticsRecordSchema,
    );
  }
  async saveConversationBookmark(record: ConversationBookmarkRecord) {
    const parsed = ConversationBookmarkRecordSchema.parse(record);
    await insertRecord(this.pool, "conversation_bookmarks", parsed, {
      conversation_id: parsed.conversationId,
      created_at: parsed.createdAt,
    });
  }
  listConversationBookmarks(ownerId: string, limit: number) {
    return list(
      this.pool,
      "conversation_bookmarks",
      ownerId,
      "created_at",
      limit,
      ConversationBookmarkRecordSchema,
    );
  }
  async saveTurnFeedback(record: ConversationTurnFeedbackRecord) {
    const parsed = ConversationTurnFeedbackRecordSchema.parse(record);
    await insertRecord(this.pool, "conversation_turn_feedback", parsed, {
      turn_id: parsed.turnId,
      kind: parsed.kind,
      created_at: parsed.createdAt,
    });
  }
  listTurnFeedback(ownerId: string, limit: number) {
    return list(
      this.pool,
      "conversation_turn_feedback",
      ownerId,
      "created_at",
      limit,
      ConversationTurnFeedbackRecordSchema,
    );
  }
}
