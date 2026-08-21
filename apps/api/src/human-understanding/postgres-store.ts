import {
  AliasDictionaryEntrySchema,
  BehaviourExampleRecordSchema,
  BehaviourRuleRecordSchema,
  BootstrapProfileRecordSchema,
  CommunicationRuleRecordSchema,
  ClarificationHistoryRecordSchema19A,
  CommunicationProfileRecordSchema,
  ConfidenceHistoryRecordSchema,
  ConversationStateRecordSchema,
  CorpusEntrySchema,
  CorpusImportRecordSchema,
  CorpusValidationResultSchema,
  CorpusVersionSchema,
  DecisionPreferenceRecordSchema,
  DecisionProfileRecordSchema,
  HumanUnderstandingResultSchema,
  HumanSynonymEntrySchema,
  InteractionPolicyRecordSchema,
  InteractionStatisticsRecordSchema,
  PersonalityLearningEventRecordSchema,
  PatternLibraryEntrySchema,
  PersonalityBehaviourRecordSchema,
  PersonalityIdentityRecordSchema,
  PersonalityProfileSchema,
  PersonalitySimulationRecordSchema,
  PersonalityStateHistoryRecordSchema,
  PersonalityStateRecordSchema,
  PersonalityTraitRecordSchema,
  PersonalityVersionRecordSchema,
  PreferenceConfidenceRecordSchema,
  PreferenceEvidenceRecordSchema,
  PreferenceLearningRecordSchema,
  ResponseExplanationRecordSchema,
  ResponseTemplateRecordSchema,
  RetrievalHistoryRecord19ASchema,
  SocialRuleRecordSchema,
  VocabularyEntrySchema,
  WorkingStyleRecordSchema,
  WorkingProfileRecordSchema,
  type AliasDictionaryEntry,
  type BehaviourExampleRecord,
  type BehaviourRuleRecord,
  type BootstrapProfileRecord,
  type CommunicationRuleRecord,
  type ClarificationHistoryRecord19A,
  type CommunicationProfileRecord,
  type ConfidenceHistoryRecord,
  type ConversationStateRecord,
  type CorpusEntry,
  type CorpusImportRecord,
  type CorpusValidationResult,
  type CorpusVersion,
  type DecisionPreferenceRecord,
  type DecisionProfileRecord,
  type HumanSynonymEntry,
  type HumanUnderstandingResult,
  type InteractionPolicyRecord,
  type InteractionStatisticsRecord,
  type PersonalityLearningEventRecord,
  type PatternLibraryEntry,
  type PersonalityBehaviourRecord,
  type PersonalityIdentityRecord,
  type PersonalityProfile,
  type PersonalitySimulationRecord,
  type PersonalityStateHistoryRecord,
  type PersonalityStateRecord,
  type PersonalityTraitRecord,
  type PersonalityVersionRecord,
  type PreferenceConfidenceRecord,
  type PreferenceEvidenceRecord,
  type PreferenceLearningRecord,
  type ResponseExplanationRecord,
  type ResponseTemplateRecord,
  type RetrievalHistoryRecord19A,
  type SocialRuleRecord,
  type VocabularyEntry,
  type WorkingStyleRecord,
  type WorkingProfileRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { HumanUnderstandingStore } from "./store.js";

const SYSTEM_OWNER = "00000000-0000-0000-0000-000000000000";

type Schema<T> = { parse: (value: unknown) => T };
type RecordWithId = { id: string; ownerId: string };

const save = async <T extends RecordWithId>(
  pool: Pool,
  table: string,
  record: T,
  orderValue: string,
) => {
  await pool.query(
    `INSERT INTO ${table}(id,owner_id,sort_at,record)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (owner_id,id) DO UPDATE SET sort_at=$3,record=$4`,
    [record.id, record.ownerId, orderValue, record],
  );
};

const list = async <T>(
  pool: Pool,
  table: string,
  ownerId: string,
  limit: number,
  schema: Schema<T>,
) => {
  const result = await pool.query<{ record: unknown }>(
    `SELECT record FROM ${table}
     WHERE owner_id=$1
     ORDER BY sort_at DESC
     LIMIT $2`,
    [ownerId, limit],
  );
  return result.rows.map((row) => schema.parse(row.record));
};

export class PostgresHumanUnderstandingStore implements HumanUnderstandingStore {
  constructor(readonly pool: Pool) {}

  async saveProfile(record: PersonalityProfile) {
    const parsed = PersonalityProfileSchema.parse(record);
    await save(this.pool, "personality_profiles", parsed, parsed.updatedAt);
  }
  async getActiveProfile(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM personality_profiles
       WHERE owner_id=$1 AND (record->>'active')::boolean IS TRUE
       ORDER BY sort_at DESC LIMIT 1`,
      [ownerId],
    );
    return result.rows[0] ? PersonalityProfileSchema.parse(result.rows[0].record) : null;
  }
  listProfiles(ownerId: string, limit: number) {
    return list(this.pool, "personality_profiles", ownerId, limit, PersonalityProfileSchema);
  }
  async saveIdentity(record: PersonalityIdentityRecord) {
    const parsed = PersonalityIdentityRecordSchema.parse(record);
    await save(this.pool, "personality_identity", parsed, parsed.updatedAt);
  }
  async getActiveIdentity(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM personality_identity
       WHERE owner_id=$1 AND (record->>'active')::boolean IS TRUE
       ORDER BY sort_at DESC LIMIT 1`,
      [ownerId],
    );
    return result.rows[0] ? PersonalityIdentityRecordSchema.parse(result.rows[0].record) : null;
  }
  async saveTrait(record: PersonalityTraitRecord) {
    const parsed = PersonalityTraitRecordSchema.parse(record);
    await save(this.pool, "behaviour_traits", parsed, parsed.updatedAt);
  }
  listTraits(ownerId: string, limit: number) {
    return list(this.pool, "behaviour_traits", ownerId, limit, PersonalityTraitRecordSchema);
  }
  async savePersonalityBehaviour(record: PersonalityBehaviourRecord) {
    const parsed = PersonalityBehaviourRecordSchema.parse(record);
    await save(this.pool, "personality_behaviours", parsed, parsed.updatedAt);
  }
  listPersonalityBehaviours(ownerId: string, limit: number) {
    return list(this.pool, "personality_behaviours", ownerId, limit, PersonalityBehaviourRecordSchema);
  }
  async saveCommunicationRule(record: CommunicationRuleRecord) {
    const parsed = CommunicationRuleRecordSchema.parse(record);
    await save(this.pool, "communication_rules", parsed, parsed.updatedAt);
  }
  listCommunicationRules(ownerId: string, limit: number) {
    return list(this.pool, "communication_rules", ownerId, limit, CommunicationRuleRecordSchema);
  }
  async saveInteractionPolicy(record: InteractionPolicyRecord) {
    const parsed = InteractionPolicyRecordSchema.parse(record);
    await save(this.pool, "interaction_policies", parsed, parsed.updatedAt);
  }
  listInteractionPolicies(ownerId: string, limit: number) {
    return list(this.pool, "interaction_policies", ownerId, limit, InteractionPolicyRecordSchema);
  }
  async saveDecisionPreference(record: DecisionPreferenceRecord) {
    const parsed = DecisionPreferenceRecordSchema.parse(record);
    await save(this.pool, "decision_preferences", parsed, parsed.updatedAt);
  }
  listDecisionPreferences(ownerId: string, limit: number) {
    return list(this.pool, "decision_preferences", ownerId, limit, DecisionPreferenceRecordSchema);
  }
  async saveWorkingStyle(record: WorkingStyleRecord) {
    const parsed = WorkingStyleRecordSchema.parse(record);
    await save(this.pool, "working_styles", parsed, parsed.updatedAt);
  }
  listWorkingStyles(ownerId: string, limit: number) {
    return list(this.pool, "working_styles", ownerId, limit, WorkingStyleRecordSchema);
  }
  async saveStructuredBehaviourExample(record: BehaviourExampleRecord) {
    const parsed = BehaviourExampleRecordSchema.parse(record);
    await save(this.pool, "behaviour_examples", parsed, parsed.createdAt);
  }
  listStructuredBehaviourExamples(ownerId: string, limit: number) {
    return list(this.pool, "behaviour_examples", ownerId, limit, BehaviourExampleRecordSchema);
  }
  async saveLearningEvent(record: PersonalityLearningEventRecord) {
    const parsed = PersonalityLearningEventRecordSchema.parse(record);
    await save(this.pool, "personality_learning_events", parsed, parsed.lastSeenAt);
  }
  listLearningEvents(ownerId: string, limit: number) {
    return list(this.pool, "personality_learning_events", ownerId, limit, PersonalityLearningEventRecordSchema);
  }
  async savePreferenceConfidence(record: PreferenceConfidenceRecord) {
    const parsed = PreferenceConfidenceRecordSchema.parse(record);
    await save(this.pool, "preference_confidence", parsed, parsed.updatedAt);
  }
  listPreferenceConfidence(ownerId: string, limit: number) {
    return list(this.pool, "preference_confidence", ownerId, limit, PreferenceConfidenceRecordSchema);
  }
  async savePersonalitySimulation(record: PersonalitySimulationRecord) {
    const parsed = PersonalitySimulationRecordSchema.parse(record);
    await save(this.pool, "personality_simulations", parsed, parsed.createdAt);
  }
  listPersonalitySimulations(ownerId: string, limit: number) {
    return list(this.pool, "personality_simulations", ownerId, limit, PersonalitySimulationRecordSchema);
  }
  async savePersonalityStateHistory(record: PersonalityStateHistoryRecord) {
    const parsed = PersonalityStateHistoryRecordSchema.parse(record);
    await save(this.pool, "personality_state_history", parsed, parsed.createdAt);
  }
  listPersonalityStateHistory(ownerId: string, limit: number) {
    return list(this.pool, "personality_state_history", ownerId, limit, PersonalityStateHistoryRecordSchema);
  }
  async saveResponseExplanation(record: ResponseExplanationRecord) {
    const parsed = ResponseExplanationRecordSchema.parse(record);
    await save(this.pool, "response_explanations", parsed, parsed.createdAt);
  }
  listResponseExplanations(ownerId: string, limit: number) {
    return list(this.pool, "response_explanations", ownerId, limit, ResponseExplanationRecordSchema);
  }
  async saveCorpusVersion(record: CorpusVersion) {
    const parsed = CorpusVersionSchema.parse(record);
    await save(this.pool, "personality_corpus_versions", parsed, parsed.createdAt);
  }
  async getActiveCorpusVersion(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM personality_corpus_versions
       WHERE owner_id=$1 AND (record->>'active')::boolean IS TRUE
       ORDER BY sort_at DESC LIMIT 1`,
      [ownerId],
    );
    return result.rows[0] ? CorpusVersionSchema.parse(result.rows[0].record) : null;
  }
  listCorpusVersions(ownerId: string, limit: number) {
    return list(this.pool, "personality_corpus_versions", ownerId, limit, CorpusVersionSchema);
  }
  async saveCorpusEntry(record: CorpusEntry) {
    const parsed = CorpusEntrySchema.parse(record);
    await save(this.pool, "personality_corpus_entries", parsed, parsed.updatedAt);
  }
  listCorpusEntries(ownerId: string, limit: number) {
    return list(this.pool, "personality_corpus_entries", ownerId, limit, CorpusEntrySchema);
  }
  async saveCorpusImport(record: CorpusImportRecord) {
    const parsed = CorpusImportRecordSchema.parse(record);
    await save(this.pool, "personality_corpus_imports", parsed, parsed.updatedAt);
  }
  listCorpusImports(ownerId: string, limit: number) {
    return list(this.pool, "personality_corpus_imports", ownerId, limit, CorpusImportRecordSchema);
  }
  async saveCorpusValidation(record: CorpusValidationResult) {
    const parsed = CorpusValidationResultSchema.parse(record);
    await save(this.pool, "personality_corpus_validation_results", parsed, parsed.createdAt);
  }
  listCorpusValidations(ownerId: string, limit: number) {
    return list(this.pool, "personality_corpus_validation_results", ownerId, limit, CorpusValidationResultSchema);
  }
  async savePersonalityState(record: PersonalityStateRecord) {
    const parsed = PersonalityStateRecordSchema.parse(record);
    await save(this.pool, "personality_states", parsed, parsed.createdAt);
  }
  listPersonalityStates(ownerId: string, limit: number) {
    return list(this.pool, "personality_states", ownerId, limit, PersonalityStateRecordSchema);
  }
  async saveVocabulary(record: VocabularyEntry) {
    const parsed = VocabularyEntrySchema.parse(record);
    await save(this.pool, "vocabulary_entries", parsed, parsed.updatedAt);
  }
  listVocabulary(ownerId: string, limit: number) {
    return list(this.pool, "vocabulary_entries", ownerId, limit, VocabularyEntrySchema);
  }
  async saveAlias(record: AliasDictionaryEntry) {
    const parsed = AliasDictionaryEntrySchema.parse(record);
    await save(this.pool, "alias_dictionary", parsed, parsed.updatedAt);
  }
  listAliases(ownerId: string, limit: number) {
    return list(this.pool, "alias_dictionary", ownerId, limit, AliasDictionaryEntrySchema);
  }
  async saveSynonym(record: HumanSynonymEntry) {
    const parsed = HumanSynonymEntrySchema.parse(record);
    await save(this.pool, "personality_synonym_dictionary", parsed, parsed.updatedAt);
  }
  async listSynonyms(ownerId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM personality_synonym_dictionary
       WHERE owner_id=$1 OR owner_id=$2
       ORDER BY sort_at DESC LIMIT $3`,
      [ownerId, SYSTEM_OWNER, limit],
    );
    return result.rows.map((row) => HumanSynonymEntrySchema.parse(row.record));
  }
  async savePattern(record: PatternLibraryEntry) {
    const parsed = PatternLibraryEntrySchema.parse(record);
    await save(this.pool, "pattern_library", parsed, parsed.updatedAt);
  }
  listPatterns(ownerId: string, limit: number) {
    return list(this.pool, "pattern_library", ownerId, limit, PatternLibraryEntrySchema);
  }
  async saveBehaviourRule(record: BehaviourRuleRecord) {
    const parsed = BehaviourRuleRecordSchema.parse(record);
    await save(this.pool, "behaviour_rules", parsed, parsed.updatedAt);
  }
  listBehaviourRules(ownerId: string, limit: number) {
    return list(this.pool, "behaviour_rules", ownerId, limit, BehaviourRuleRecordSchema);
  }
  async saveConversationState(record: ConversationStateRecord) {
    const parsed = ConversationStateRecordSchema.parse(record);
    await save(this.pool, "conversation_states", parsed, parsed.createdAt);
  }
  listConversationStates(ownerId: string, limit: number) {
    return list(this.pool, "conversation_states", ownerId, limit, ConversationStateRecordSchema);
  }
  async saveUnderstanding(record: HumanUnderstandingResult) {
    const parsed = HumanUnderstandingResultSchema.parse(record);
    await save(
      this.pool,
      "human_understanding_history",
      { ...parsed, id: parsed.requestId },
      parsed.createdAt,
    );
  }
  listUnderstandings(ownerId: string, limit: number) {
    return list(this.pool, "human_understanding_history", ownerId, limit, HumanUnderstandingResultSchema);
  }
  async saveConfidence(record: ConfidenceHistoryRecord) {
    const parsed = ConfidenceHistoryRecordSchema.parse(record);
    await save(this.pool, "confidence_history", parsed, parsed.createdAt);
  }
  listConfidence(ownerId: string, limit: number) {
    return list(this.pool, "confidence_history", ownerId, limit, ConfidenceHistoryRecordSchema);
  }
  async saveClarification(record: ClarificationHistoryRecord19A) {
    const parsed = ClarificationHistoryRecordSchema19A.parse(record);
    await save(this.pool, "personality_clarification_history", parsed, parsed.createdAt);
  }
  listClarifications(ownerId: string, limit: number) {
    return list(this.pool, "personality_clarification_history", ownerId, limit, ClarificationHistoryRecordSchema19A);
  }
  async saveRetrieval(record: RetrievalHistoryRecord19A) {
    const parsed = RetrievalHistoryRecord19ASchema.parse(record);
    await save(this.pool, "personality_retrieval_history", parsed, parsed.createdAt);
  }
  listRetrieval(ownerId: string, limit: number) {
    return list(this.pool, "personality_retrieval_history", ownerId, limit, RetrievalHistoryRecord19ASchema);
  }
  async savePreference(record: PreferenceLearningRecord) {
    const parsed = PreferenceLearningRecordSchema.parse(record);
    await save(this.pool, "preference_learning", parsed, parsed.lastSeenAt);
  }
  listPreferences(ownerId: string, limit: number) {
    return list(this.pool, "preference_learning", ownerId, limit, PreferenceLearningRecordSchema);
  }
  async savePreferenceEvidence(record: PreferenceEvidenceRecord) {
    const parsed = PreferenceEvidenceRecordSchema.parse(record);
    await save(this.pool, "preference_evidence", parsed, parsed.observedAt);
  }
  listPreferenceEvidence(ownerId: string, limit: number) {
    return list(this.pool, "preference_evidence", ownerId, limit, PreferenceEvidenceRecordSchema);
  }
  async saveStatistic(record: InteractionStatisticsRecord) {
    const parsed = InteractionStatisticsRecordSchema.parse(record);
    await save(this.pool, "interaction_statistics", parsed, parsed.measuredAt);
  }
  listStatistics(ownerId: string, limit: number) {
    return list(this.pool, "interaction_statistics", ownerId, limit, InteractionStatisticsRecordSchema);
  }
  async saveResponseTemplate(record: ResponseTemplateRecord) {
    const parsed = ResponseTemplateRecordSchema.parse(record);
    await save(this.pool, "response_templates", parsed, parsed.updatedAt);
  }
  listResponseTemplates(ownerId: string, limit: number) {
    return list(this.pool, "response_templates", ownerId, limit, ResponseTemplateRecordSchema);
  }
  async saveSocialRule(record: SocialRuleRecord) {
    const parsed = SocialRuleRecordSchema.parse(record);
    await save(this.pool, "social_rules", parsed, parsed.updatedAt);
  }
  listSocialRules(ownerId: string, limit: number) {
    return list(this.pool, "social_rules", ownerId, limit, SocialRuleRecordSchema);
  }
  async saveCommunicationProfile(record: CommunicationProfileRecord) {
    const parsed = CommunicationProfileRecordSchema.parse(record);
    await save(this.pool, "communication_profiles", parsed, parsed.updatedAt);
  }
  listCommunicationProfiles(ownerId: string, limit: number) {
    return list(this.pool, "communication_profiles", ownerId, limit, CommunicationProfileRecordSchema);
  }
  async saveWorkingProfile(record: WorkingProfileRecord) {
    const parsed = WorkingProfileRecordSchema.parse(record);
    await save(this.pool, "working_profiles", parsed, parsed.updatedAt);
  }
  listWorkingProfiles(ownerId: string, limit: number) {
    return list(this.pool, "working_profiles", ownerId, limit, WorkingProfileRecordSchema);
  }
  async saveDecisionProfile(record: DecisionProfileRecord) {
    const parsed = DecisionProfileRecordSchema.parse(record);
    await save(this.pool, "decision_profiles", parsed, parsed.updatedAt);
  }
  listDecisionProfiles(ownerId: string, limit: number) {
    return list(this.pool, "decision_profiles", ownerId, limit, DecisionProfileRecordSchema);
  }
  async savePersonalityVersion(record: PersonalityVersionRecord) {
    const parsed = PersonalityVersionRecordSchema.parse(record);
    await save(this.pool, "personality_versions", parsed, parsed.createdAt);
  }
  listPersonalityVersions(ownerId: string, limit: number) {
    return list(this.pool, "personality_versions", ownerId, limit, PersonalityVersionRecordSchema);
  }
  async saveBootstrap(record: BootstrapProfileRecord) {
    const parsed = BootstrapProfileRecordSchema.parse(record);
    await save(this.pool, "bootstrap_profiles", parsed, parsed.createdAt);
  }
  listBootstraps(ownerId: string, limit: number) {
    return list(this.pool, "bootstrap_profiles", ownerId, limit, BootstrapProfileRecordSchema);
  }
}
