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

import type { Awaitable } from "../identity/store.js";

export interface VoiceStore {
  saveSession(record: VoiceSessionRecord): Awaitable<void>;
  listSessions(ownerId: string, limit: number): Awaitable<VoiceSessionRecord[]>;
  getSession(ownerId: string, sessionId: string): Awaitable<VoiceSessionRecord | null>;
  saveProfile(record: VoiceProfileRecord): Awaitable<void>;
  listProfiles(ownerId: string, limit: number): Awaitable<VoiceProfileRecord[]>;
  saveShortcut(record: VoiceShortcutRecord): Awaitable<void>;
  listShortcuts(ownerId: string, limit: number): Awaitable<VoiceShortcutRecord[]>;
  saveConversation(record: ConversationHistoryRecord): Awaitable<void>;
  listConversation(
    ownerId: string,
    limit: number,
  ): Awaitable<ConversationHistoryRecord[]>;
  saveMetric(record: VoiceMetricRecord): Awaitable<void>;
  listMetrics(ownerId: string, limit: number): Awaitable<VoiceMetricRecord[]>;
  saveMicrophonePreference(record: MicrophonePreferenceRecord): Awaitable<void>;
  listMicrophonePreferences(
    ownerId: string,
    limit: number,
  ): Awaitable<MicrophonePreferenceRecord[]>;
  saveWakeWordSettings(record: WakeWordSettingsRecord): Awaitable<void>;
  listWakeWordSettings(
    ownerId: string,
    limit: number,
  ): Awaitable<WakeWordSettingsRecord[]>;
  saveTtsProfile(record: TtsProfileRecord): Awaitable<void>;
  listTtsProfiles(ownerId: string, limit: number): Awaitable<TtsProfileRecord[]>;
  saveSttProviderMetric(record: SttProviderMetricRecord): Awaitable<void>;
  listSttProviderMetrics(
    ownerId: string,
    limit: number,
  ): Awaitable<SttProviderMetricRecord[]>;
  saveConversationSession(record: ConversationSessionRecord): Awaitable<void>;
  listConversationSessions(
    ownerId: string,
    limit: number,
  ): Awaitable<ConversationSessionRecord[]>;
  saveConversationTopic(record: ConversationTopicRecord): Awaitable<void>;
  listConversationTopics(
    ownerId: string,
    limit: number,
  ): Awaitable<ConversationTopicRecord[]>;
  saveConversationGoal(record: ConversationGoalRecord): Awaitable<void>;
  listConversationGoals(
    ownerId: string,
    limit: number,
  ): Awaitable<ConversationGoalRecord[]>;
  saveConversationSummary(record: ConversationSummaryRecord): Awaitable<void>;
  listConversationSummaries(
    ownerId: string,
    limit: number,
  ): Awaitable<ConversationSummaryRecord[]>;
  saveConversationPersona(record: ConversationPersonaRecord): Awaitable<void>;
  listConversationPersonas(
    ownerId: string,
    limit: number,
  ): Awaitable<ConversationPersonaRecord[]>;
  saveClarification(record: ClarificationHistoryRecord): Awaitable<void>;
  listClarifications(
    ownerId: string,
    limit: number,
  ): Awaitable<ClarificationHistoryRecord[]>;
  saveConversationContext(record: ConversationContextRecord): Awaitable<void>;
  listConversationContext(
    ownerId: string,
    limit: number,
  ): Awaitable<ConversationContextRecord[]>;
  saveConversationContinuity(record: ConversationContinuityRecord): Awaitable<void>;
  getConversationContinuity(
    ownerId: string,
    conversationId: string,
  ): Awaitable<ConversationContinuityRecord | null>;
  listConversationContinuity(
    ownerId: string,
    limit: number,
  ): Awaitable<ConversationContinuityRecord[]>;
  claimConversationTurn(
    ownerId: string,
    conversationId: string,
    turnId: string,
    claimedAt: string,
  ): Awaitable<boolean>;
  withConversationContinuityLock<T>(
    ownerId: string,
    conversationId: string,
    run: () => Awaitable<T>,
  ): Promise<T>;
  saveConversationAnalytics(record: ConversationAnalyticsRecord): Awaitable<void>;
  listConversationAnalytics(
    ownerId: string,
    limit: number,
  ): Awaitable<ConversationAnalyticsRecord[]>;
  saveConversationBookmark(record: ConversationBookmarkRecord): Awaitable<void>;
  listConversationBookmarks(
    ownerId: string,
    limit: number,
  ): Awaitable<ConversationBookmarkRecord[]>;
  saveTurnFeedback(record: ConversationTurnFeedbackRecord): Awaitable<void>;
  listTurnFeedback(
    ownerId: string,
    limit: number,
  ): Awaitable<ConversationTurnFeedbackRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemoryVoiceStore implements VoiceStore {
  readonly #sessions = new Map<string, VoiceSessionRecord>();
  readonly #profiles = new Map<string, VoiceProfileRecord>();
  readonly #shortcuts = new Map<string, VoiceShortcutRecord>();
  readonly #conversation = new Map<string, ConversationHistoryRecord>();
  readonly #metrics = new Map<string, VoiceMetricRecord>();
  readonly #microphonePreferences = new Map<string, MicrophonePreferenceRecord>();
  readonly #wakeWordSettings = new Map<string, WakeWordSettingsRecord>();
  readonly #ttsProfiles = new Map<string, TtsProfileRecord>();
  readonly #sttProviderMetrics = new Map<string, SttProviderMetricRecord>();
  readonly #conversationSessions = new Map<string, ConversationSessionRecord>();
  readonly #conversationTopics = new Map<string, ConversationTopicRecord>();
  readonly #conversationGoals = new Map<string, ConversationGoalRecord>();
  readonly #conversationSummaries = new Map<string, ConversationSummaryRecord>();
  readonly #conversationPersonas = new Map<string, ConversationPersonaRecord>();
  readonly #clarifications = new Map<string, ClarificationHistoryRecord>();
  readonly #conversationContext = new Map<string, ConversationContextRecord>();
  readonly #conversationContinuity = new Map<string, ConversationContinuityRecord>();
  readonly #conversationTurnClaims = new Set<string>();
  readonly #conversationContinuityLocks = new Map<string, Promise<void>>();
  readonly #conversationAnalytics = new Map<string, ConversationAnalyticsRecord>();
  readonly #conversationBookmarks = new Map<string, ConversationBookmarkRecord>();
  readonly #turnFeedback = new Map<string, ConversationTurnFeedbackRecord>();

  saveSession(record: VoiceSessionRecord) {
    this.#sessions.set(record.id, clone(VoiceSessionRecordSchema.parse(record)));
  }
  listSessions(ownerId: string, limit: number) {
    return ordered(
      [...this.#sessions.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getSession(ownerId: string, sessionId: string) {
    const session = this.#sessions.get(sessionId);
    return session?.ownerId === ownerId ? clone(session) : null;
  }
  saveProfile(record: VoiceProfileRecord) {
    this.#profiles.set(record.id, clone(VoiceProfileRecordSchema.parse(record)));
  }
  listProfiles(ownerId: string, limit: number) {
    return ordered(
      [...this.#profiles.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveShortcut(record: VoiceShortcutRecord) {
    this.#shortcuts.set(record.id, clone(VoiceShortcutRecordSchema.parse(record)));
  }
  listShortcuts(ownerId: string, limit: number) {
    return ordered(
      [...this.#shortcuts.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveConversation(record: ConversationHistoryRecord) {
    this.#conversation.set(
      record.id,
      clone(ConversationHistoryRecordSchema.parse(record)),
    );
  }
  listConversation(ownerId: string, limit: number) {
    return ordered(
      [...this.#conversation.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveMetric(record: VoiceMetricRecord) {
    this.#metrics.set(record.id, clone(VoiceMetricRecordSchema.parse(record)));
  }
  listMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#metrics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  saveMicrophonePreference(record: MicrophonePreferenceRecord) {
    this.#microphonePreferences.set(
      record.id,
      clone(MicrophonePreferenceRecordSchema.parse(record)),
    );
  }
  listMicrophonePreferences(ownerId: string, limit: number) {
    return ordered(
      [...this.#microphonePreferences.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }
  saveWakeWordSettings(record: WakeWordSettingsRecord) {
    this.#wakeWordSettings.set(
      record.id,
      clone(WakeWordSettingsRecordSchema.parse(record)),
    );
  }
  listWakeWordSettings(ownerId: string, limit: number) {
    return ordered(
      [...this.#wakeWordSettings.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveTtsProfile(record: TtsProfileRecord) {
    this.#ttsProfiles.set(record.id, clone(TtsProfileRecordSchema.parse(record)));
  }
  listTtsProfiles(ownerId: string, limit: number) {
    return ordered(
      [...this.#ttsProfiles.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveSttProviderMetric(record: SttProviderMetricRecord) {
    this.#sttProviderMetrics.set(
      record.id,
      clone(SttProviderMetricRecordSchema.parse(record)),
    );
  }
  listSttProviderMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#sttProviderMetrics.values()].filter((item) => item.ownerId === ownerId),
      "lastCheckedAt",
      limit,
    );
  }
  saveConversationSession(record: ConversationSessionRecord) {
    this.#conversationSessions.set(
      record.id,
      clone(ConversationSessionRecordSchema.parse(record)),
    );
  }
  listConversationSessions(ownerId: string, limit: number) {
    return ordered(
      [...this.#conversationSessions.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }
  saveConversationTopic(record: ConversationTopicRecord) {
    this.#conversationTopics.set(
      record.id,
      clone(ConversationTopicRecordSchema.parse(record)),
    );
  }
  listConversationTopics(ownerId: string, limit: number) {
    return ordered(
      [...this.#conversationTopics.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveConversationGoal(record: ConversationGoalRecord) {
    this.#conversationGoals.set(
      record.id,
      clone(ConversationGoalRecordSchema.parse(record)),
    );
  }
  listConversationGoals(ownerId: string, limit: number) {
    return ordered(
      [...this.#conversationGoals.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveConversationSummary(record: ConversationSummaryRecord) {
    this.#conversationSummaries.set(
      record.id,
      clone(ConversationSummaryRecordSchema.parse(record)),
    );
  }
  listConversationSummaries(ownerId: string, limit: number) {
    return ordered(
      [...this.#conversationSummaries.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "createdAt",
      limit,
    );
  }
  saveConversationPersona(record: ConversationPersonaRecord) {
    this.#conversationPersonas.set(
      record.id,
      clone(ConversationPersonaRecordSchema.parse(record)),
    );
  }
  listConversationPersonas(ownerId: string, limit: number) {
    return ordered(
      [...this.#conversationPersonas.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }
  saveClarification(record: ClarificationHistoryRecord) {
    this.#clarifications.set(
      record.id,
      clone(ClarificationHistoryRecordSchema.parse(record)),
    );
  }
  listClarifications(ownerId: string, limit: number) {
    return ordered(
      [...this.#clarifications.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveConversationContext(record: ConversationContextRecord) {
    this.#conversationContext.set(
      record.id,
      clone(ConversationContextRecordSchema.parse(record)),
    );
  }
  listConversationContext(ownerId: string, limit: number) {
    return ordered(
      [...this.#conversationContext.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }
  saveConversationContinuity(record: ConversationContinuityRecord) {
    this.#conversationContinuity.set(
      `${record.ownerId}:${record.conversationId}`,
      clone(ConversationContinuityRecordSchema.parse(record)),
    );
  }
  getConversationContinuity(ownerId: string, conversationId: string) {
    const record = this.#conversationContinuity.get(`${ownerId}:${conversationId}`);
    return record?.ownerId === ownerId ? clone(record) : null;
  }
  listConversationContinuity(ownerId: string, limit: number) {
    return ordered(
      [...this.#conversationContinuity.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }
  claimConversationTurn(ownerId: string, conversationId: string, turnId: string) {
    const key = `${ownerId}:${conversationId}:${turnId}`;
    if (this.#conversationTurnClaims.has(key)) return false;
    this.#conversationTurnClaims.add(key);
    return true;
  }
  async withConversationContinuityLock<T>(
    ownerId: string,
    conversationId: string,
    run: () => Awaitable<T>,
  ) {
    const key = `${ownerId}:${conversationId}`;
    const previous = this.#conversationContinuityLocks.get(key) ?? Promise.resolve();
    let release: () => void = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.#conversationContinuityLocks.set(key, tail);
    await previous;
    try {
      return await run();
    } finally {
      release();
      if (this.#conversationContinuityLocks.get(key) === tail)
        this.#conversationContinuityLocks.delete(key);
    }
  }
  saveConversationAnalytics(record: ConversationAnalyticsRecord) {
    this.#conversationAnalytics.set(
      record.id,
      clone(ConversationAnalyticsRecordSchema.parse(record)),
    );
  }
  listConversationAnalytics(ownerId: string, limit: number) {
    return ordered(
      [...this.#conversationAnalytics.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "measuredAt",
      limit,
    );
  }
  saveConversationBookmark(record: ConversationBookmarkRecord) {
    this.#conversationBookmarks.set(
      record.id,
      clone(ConversationBookmarkRecordSchema.parse(record)),
    );
  }
  listConversationBookmarks(ownerId: string, limit: number) {
    return ordered(
      [...this.#conversationBookmarks.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "createdAt",
      limit,
    );
  }
  saveTurnFeedback(record: ConversationTurnFeedbackRecord) {
    this.#turnFeedback.set(
      record.id,
      clone(ConversationTurnFeedbackRecordSchema.parse(record)),
    );
  }
  listTurnFeedback(ownerId: string, limit: number) {
    return ordered(
      [...this.#turnFeedback.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
}
