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

import type { Awaitable } from "../identity/store.js";

export interface HumanUnderstandingStore {
  saveProfile(record: PersonalityProfile): Awaitable<void>;
  getActiveProfile(ownerId: string): Awaitable<PersonalityProfile | null>;
  listProfiles(ownerId: string, limit: number): Awaitable<PersonalityProfile[]>;
  saveIdentity(record: PersonalityIdentityRecord): Awaitable<void>;
  getActiveIdentity(ownerId: string): Awaitable<PersonalityIdentityRecord | null>;
  saveTrait(record: PersonalityTraitRecord): Awaitable<void>;
  listTraits(ownerId: string, limit: number): Awaitable<PersonalityTraitRecord[]>;
  savePersonalityBehaviour(record: PersonalityBehaviourRecord): Awaitable<void>;
  listPersonalityBehaviours(ownerId: string, limit: number): Awaitable<PersonalityBehaviourRecord[]>;
  saveCommunicationRule(record: CommunicationRuleRecord): Awaitable<void>;
  listCommunicationRules(ownerId: string, limit: number): Awaitable<CommunicationRuleRecord[]>;
  saveInteractionPolicy(record: InteractionPolicyRecord): Awaitable<void>;
  listInteractionPolicies(ownerId: string, limit: number): Awaitable<InteractionPolicyRecord[]>;
  saveDecisionPreference(record: DecisionPreferenceRecord): Awaitable<void>;
  listDecisionPreferences(ownerId: string, limit: number): Awaitable<DecisionPreferenceRecord[]>;
  saveWorkingStyle(record: WorkingStyleRecord): Awaitable<void>;
  listWorkingStyles(ownerId: string, limit: number): Awaitable<WorkingStyleRecord[]>;
  saveStructuredBehaviourExample(record: BehaviourExampleRecord): Awaitable<void>;
  listStructuredBehaviourExamples(ownerId: string, limit: number): Awaitable<BehaviourExampleRecord[]>;
  saveLearningEvent(record: PersonalityLearningEventRecord): Awaitable<void>;
  listLearningEvents(ownerId: string, limit: number): Awaitable<PersonalityLearningEventRecord[]>;
  savePreferenceConfidence(record: PreferenceConfidenceRecord): Awaitable<void>;
  listPreferenceConfidence(ownerId: string, limit: number): Awaitable<PreferenceConfidenceRecord[]>;
  savePersonalitySimulation(record: PersonalitySimulationRecord): Awaitable<void>;
  listPersonalitySimulations(ownerId: string, limit: number): Awaitable<PersonalitySimulationRecord[]>;
  savePersonalityStateHistory(record: PersonalityStateHistoryRecord): Awaitable<void>;
  listPersonalityStateHistory(ownerId: string, limit: number): Awaitable<PersonalityStateHistoryRecord[]>;
  saveResponseExplanation(record: ResponseExplanationRecord): Awaitable<void>;
  listResponseExplanations(ownerId: string, limit: number): Awaitable<ResponseExplanationRecord[]>;
  saveCorpusVersion(record: CorpusVersion): Awaitable<void>;
  getActiveCorpusVersion(ownerId: string): Awaitable<CorpusVersion | null>;
  listCorpusVersions(ownerId: string, limit: number): Awaitable<CorpusVersion[]>;
  saveCorpusEntry(record: CorpusEntry): Awaitable<void>;
  listCorpusEntries(ownerId: string, limit: number): Awaitable<CorpusEntry[]>;
  saveCorpusImport(record: CorpusImportRecord): Awaitable<void>;
  listCorpusImports(ownerId: string, limit: number): Awaitable<CorpusImportRecord[]>;
  saveCorpusValidation(record: CorpusValidationResult): Awaitable<void>;
  listCorpusValidations(ownerId: string, limit: number): Awaitable<CorpusValidationResult[]>;
  savePersonalityState(record: PersonalityStateRecord): Awaitable<void>;
  listPersonalityStates(ownerId: string, limit: number): Awaitable<PersonalityStateRecord[]>;
  saveVocabulary(record: VocabularyEntry): Awaitable<void>;
  listVocabulary(ownerId: string, limit: number): Awaitable<VocabularyEntry[]>;
  saveAlias(record: AliasDictionaryEntry): Awaitable<void>;
  listAliases(ownerId: string, limit: number): Awaitable<AliasDictionaryEntry[]>;
  saveSynonym(record: HumanSynonymEntry): Awaitable<void>;
  listSynonyms(ownerId: string, limit: number): Awaitable<HumanSynonymEntry[]>;
  savePattern(record: PatternLibraryEntry): Awaitable<void>;
  listPatterns(ownerId: string, limit: number): Awaitable<PatternLibraryEntry[]>;
  saveBehaviourRule(record: BehaviourRuleRecord): Awaitable<void>;
  listBehaviourRules(ownerId: string, limit: number): Awaitable<BehaviourRuleRecord[]>;
  saveConversationState(record: ConversationStateRecord): Awaitable<void>;
  listConversationStates(ownerId: string, limit: number): Awaitable<ConversationStateRecord[]>;
  saveUnderstanding(record: HumanUnderstandingResult): Awaitable<void>;
  listUnderstandings(ownerId: string, limit: number): Awaitable<HumanUnderstandingResult[]>;
  saveConfidence(record: ConfidenceHistoryRecord): Awaitable<void>;
  listConfidence(ownerId: string, limit: number): Awaitable<ConfidenceHistoryRecord[]>;
  saveClarification(record: ClarificationHistoryRecord19A): Awaitable<void>;
  listClarifications(ownerId: string, limit: number): Awaitable<ClarificationHistoryRecord19A[]>;
  saveRetrieval(record: RetrievalHistoryRecord19A): Awaitable<void>;
  listRetrieval(ownerId: string, limit: number): Awaitable<RetrievalHistoryRecord19A[]>;
  savePreference(record: PreferenceLearningRecord): Awaitable<void>;
  listPreferences(ownerId: string, limit: number): Awaitable<PreferenceLearningRecord[]>;
  savePreferenceEvidence(record: PreferenceEvidenceRecord): Awaitable<void>;
  listPreferenceEvidence(ownerId: string, limit: number): Awaitable<PreferenceEvidenceRecord[]>;
  saveStatistic(record: InteractionStatisticsRecord): Awaitable<void>;
  listStatistics(ownerId: string, limit: number): Awaitable<InteractionStatisticsRecord[]>;
  saveResponseTemplate(record: ResponseTemplateRecord): Awaitable<void>;
  listResponseTemplates(ownerId: string, limit: number): Awaitable<ResponseTemplateRecord[]>;
  saveSocialRule(record: SocialRuleRecord): Awaitable<void>;
  listSocialRules(ownerId: string, limit: number): Awaitable<SocialRuleRecord[]>;
  saveCommunicationProfile(record: CommunicationProfileRecord): Awaitable<void>;
  listCommunicationProfiles(ownerId: string, limit: number): Awaitable<CommunicationProfileRecord[]>;
  saveWorkingProfile(record: WorkingProfileRecord): Awaitable<void>;
  listWorkingProfiles(ownerId: string, limit: number): Awaitable<WorkingProfileRecord[]>;
  saveDecisionProfile(record: DecisionProfileRecord): Awaitable<void>;
  listDecisionProfiles(ownerId: string, limit: number): Awaitable<DecisionProfileRecord[]>;
  savePersonalityVersion(record: PersonalityVersionRecord): Awaitable<void>;
  listPersonalityVersions(ownerId: string, limit: number): Awaitable<PersonalityVersionRecord[]>;
  saveBootstrap(record: BootstrapProfileRecord): Awaitable<void>;
  listBootstraps(ownerId: string, limit: number): Awaitable<BootstrapProfileRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemoryHumanUnderstandingStore implements HumanUnderstandingStore {
  readonly #profiles = new Map<string, PersonalityProfile>();
  readonly #states = new Map<string, PersonalityStateRecord>();
  readonly #vocabulary = new Map<string, VocabularyEntry>();
  readonly #aliases = new Map<string, AliasDictionaryEntry>();
  readonly #synonyms = new Map<string, HumanSynonymEntry>();
  readonly #patterns = new Map<string, PatternLibraryEntry>();
  readonly #rules = new Map<string, BehaviourRuleRecord>();
  readonly #conversationStates = new Map<string, ConversationStateRecord>();
  readonly #understandings = new Map<string, HumanUnderstandingResult>();
  readonly #confidence = new Map<string, ConfidenceHistoryRecord>();
  readonly #clarifications = new Map<string, ClarificationHistoryRecord19A>();
  readonly #retrieval = new Map<string, RetrievalHistoryRecord19A>();
  readonly #preferences = new Map<string, PreferenceLearningRecord>();
  readonly #preferenceEvidence = new Map<string, PreferenceEvidenceRecord>();
  readonly #statistics = new Map<string, InteractionStatisticsRecord>();
  readonly #templates = new Map<string, ResponseTemplateRecord>();
  readonly #socialRules = new Map<string, SocialRuleRecord>();
  readonly #communication = new Map<string, CommunicationProfileRecord>();
  readonly #working = new Map<string, WorkingProfileRecord>();
  readonly #decision = new Map<string, DecisionProfileRecord>();
  readonly #versions = new Map<string, PersonalityVersionRecord>();
  readonly #bootstraps = new Map<string, BootstrapProfileRecord>();
  readonly #identities = new Map<string, PersonalityIdentityRecord>();
  readonly #traits = new Map<string, PersonalityTraitRecord>();
  readonly #behaviours = new Map<string, PersonalityBehaviourRecord>();
  readonly #communicationRules = new Map<string, CommunicationRuleRecord>();
  readonly #interactionPolicies = new Map<string, InteractionPolicyRecord>();
  readonly #decisionPreferences = new Map<string, DecisionPreferenceRecord>();
  readonly #workingStyles = new Map<string, WorkingStyleRecord>();
  readonly #structuredBehaviourExamples = new Map<string, BehaviourExampleRecord>();
  readonly #learningEvents = new Map<string, PersonalityLearningEventRecord>();
  readonly #preferenceConfidence = new Map<string, PreferenceConfidenceRecord>();
  readonly #simulations = new Map<string, PersonalitySimulationRecord>();
  readonly #stateHistory = new Map<string, PersonalityStateHistoryRecord>();
  readonly #responseExplanations = new Map<string, ResponseExplanationRecord>();
  readonly #corpusVersions = new Map<string, CorpusVersion>();
  readonly #corpusEntries = new Map<string, CorpusEntry>();
  readonly #corpusImports = new Map<string, CorpusImportRecord>();
  readonly #corpusValidations = new Map<string, CorpusValidationResult>();

  saveProfile(record: PersonalityProfile) {
    this.#profiles.set(record.id, clone(PersonalityProfileSchema.parse(record)));
  }
  getActiveProfile(ownerId: string) {
    const profile = [...this.#profiles.values()].find(
      (item) => item.ownerId === ownerId && item.active,
    );
    return profile ? clone(profile) : null;
  }
  listProfiles(ownerId: string, limit: number) {
    return ordered([...this.#profiles.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveIdentity(record: PersonalityIdentityRecord) {
    this.#identities.set(record.id, clone(PersonalityIdentityRecordSchema.parse(record)));
  }
  getActiveIdentity(ownerId: string) {
    const identity = [...this.#identities.values()].find((item) => item.ownerId === ownerId && item.active);
    return identity ? clone(identity) : null;
  }
  saveTrait(record: PersonalityTraitRecord) {
    this.#traits.set(record.id, clone(PersonalityTraitRecordSchema.parse(record)));
  }
  listTraits(ownerId: string, limit: number) {
    return ordered([...this.#traits.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  savePersonalityBehaviour(record: PersonalityBehaviourRecord) {
    this.#behaviours.set(record.id, clone(PersonalityBehaviourRecordSchema.parse(record)));
  }
  listPersonalityBehaviours(ownerId: string, limit: number) {
    return ordered([...this.#behaviours.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveCommunicationRule(record: CommunicationRuleRecord) {
    this.#communicationRules.set(record.id, clone(CommunicationRuleRecordSchema.parse(record)));
  }
  listCommunicationRules(ownerId: string, limit: number) {
    return ordered([...this.#communicationRules.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveInteractionPolicy(record: InteractionPolicyRecord) {
    this.#interactionPolicies.set(record.id, clone(InteractionPolicyRecordSchema.parse(record)));
  }
  listInteractionPolicies(ownerId: string, limit: number) {
    return ordered([...this.#interactionPolicies.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveDecisionPreference(record: DecisionPreferenceRecord) {
    this.#decisionPreferences.set(record.id, clone(DecisionPreferenceRecordSchema.parse(record)));
  }
  listDecisionPreferences(ownerId: string, limit: number) {
    return ordered([...this.#decisionPreferences.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveWorkingStyle(record: WorkingStyleRecord) {
    this.#workingStyles.set(record.id, clone(WorkingStyleRecordSchema.parse(record)));
  }
  listWorkingStyles(ownerId: string, limit: number) {
    return ordered([...this.#workingStyles.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveStructuredBehaviourExample(record: BehaviourExampleRecord) {
    this.#structuredBehaviourExamples.set(record.id, clone(BehaviourExampleRecordSchema.parse(record)));
  }
  listStructuredBehaviourExamples(ownerId: string, limit: number) {
    return ordered([...this.#structuredBehaviourExamples.values()].filter((item) => item.ownerId === ownerId), "createdAt", limit);
  }
  saveLearningEvent(record: PersonalityLearningEventRecord) {
    this.#learningEvents.set(record.id, clone(PersonalityLearningEventRecordSchema.parse(record)));
  }
  listLearningEvents(ownerId: string, limit: number) {
    return ordered([...this.#learningEvents.values()].filter((item) => item.ownerId === ownerId), "lastSeenAt", limit);
  }
  savePreferenceConfidence(record: PreferenceConfidenceRecord) {
    this.#preferenceConfidence.set(record.id, clone(PreferenceConfidenceRecordSchema.parse(record)));
  }
  listPreferenceConfidence(ownerId: string, limit: number) {
    return ordered([...this.#preferenceConfidence.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  savePersonalitySimulation(record: PersonalitySimulationRecord) {
    this.#simulations.set(record.id, clone(PersonalitySimulationRecordSchema.parse(record)));
  }
  listPersonalitySimulations(ownerId: string, limit: number) {
    return ordered([...this.#simulations.values()].filter((item) => item.ownerId === ownerId), "createdAt", limit);
  }
  savePersonalityStateHistory(record: PersonalityStateHistoryRecord) {
    this.#stateHistory.set(record.id, clone(PersonalityStateHistoryRecordSchema.parse(record)));
  }
  listPersonalityStateHistory(ownerId: string, limit: number) {
    return ordered([...this.#stateHistory.values()].filter((item) => item.ownerId === ownerId), "createdAt", limit);
  }
  saveResponseExplanation(record: ResponseExplanationRecord) {
    this.#responseExplanations.set(record.id, clone(ResponseExplanationRecordSchema.parse(record)));
  }
  listResponseExplanations(ownerId: string, limit: number) {
    return ordered([...this.#responseExplanations.values()].filter((item) => item.ownerId === ownerId), "createdAt", limit);
  }
  saveCorpusVersion(record: CorpusVersion) {
    this.#corpusVersions.set(record.id, clone(CorpusVersionSchema.parse(record)));
  }
  getActiveCorpusVersion(ownerId: string) {
    const version = [...this.#corpusVersions.values()].find(
      (item) => item.ownerId === ownerId && item.active,
    );
    return version ? clone(version) : null;
  }
  listCorpusVersions(ownerId: string, limit: number) {
    return ordered([...this.#corpusVersions.values()].filter((item) => item.ownerId === ownerId), "createdAt", limit);
  }
  saveCorpusEntry(record: CorpusEntry) {
    this.#corpusEntries.set(record.id, clone(CorpusEntrySchema.parse(record)));
  }
  listCorpusEntries(ownerId: string, limit: number) {
    return ordered([...this.#corpusEntries.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveCorpusImport(record: CorpusImportRecord) {
    this.#corpusImports.set(record.id, clone(CorpusImportRecordSchema.parse(record)));
  }
  listCorpusImports(ownerId: string, limit: number) {
    return ordered([...this.#corpusImports.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveCorpusValidation(record: CorpusValidationResult) {
    this.#corpusValidations.set(record.id, clone(CorpusValidationResultSchema.parse(record)));
  }
  listCorpusValidations(ownerId: string, limit: number) {
    return ordered([...this.#corpusValidations.values()].filter((item) => item.ownerId === ownerId), "createdAt", limit);
  }
  savePersonalityState(record: PersonalityStateRecord) {
    this.#states.set(record.id, clone(PersonalityStateRecordSchema.parse(record)));
  }
  listPersonalityStates(ownerId: string, limit: number) {
    return ordered([...this.#states.values()].filter((item) => item.ownerId === ownerId), "createdAt", limit);
  }
  saveVocabulary(record: VocabularyEntry) {
    this.#vocabulary.set(record.id, clone(VocabularyEntrySchema.parse(record)));
  }
  listVocabulary(ownerId: string, limit: number) {
    return ordered([...this.#vocabulary.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveAlias(record: AliasDictionaryEntry) {
    this.#aliases.set(record.id, clone(AliasDictionaryEntrySchema.parse(record)));
  }
  listAliases(ownerId: string, limit: number) {
    return ordered([...this.#aliases.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveSynonym(record: HumanSynonymEntry) {
    this.#synonyms.set(record.id, clone(HumanSynonymEntrySchema.parse(record)));
  }
  listSynonyms(ownerId: string, limit: number) {
    return ordered([...this.#synonyms.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  savePattern(record: PatternLibraryEntry) {
    this.#patterns.set(record.id, clone(PatternLibraryEntrySchema.parse(record)));
  }
  listPatterns(ownerId: string, limit: number) {
    return ordered([...this.#patterns.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveBehaviourRule(record: BehaviourRuleRecord) {
    this.#rules.set(record.id, clone(BehaviourRuleRecordSchema.parse(record)));
  }
  listBehaviourRules(ownerId: string, limit: number) {
    return ordered([...this.#rules.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveConversationState(record: ConversationStateRecord) {
    this.#conversationStates.set(record.id, clone(ConversationStateRecordSchema.parse(record)));
  }
  listConversationStates(ownerId: string, limit: number) {
    return ordered([...this.#conversationStates.values()].filter((item) => item.ownerId === ownerId), "createdAt", limit);
  }
  saveUnderstanding(record: HumanUnderstandingResult) {
    this.#understandings.set(record.requestId, clone(HumanUnderstandingResultSchema.parse(record)));
  }
  listUnderstandings(ownerId: string, limit: number) {
    return ordered([...this.#understandings.values()].filter((item) => item.ownerId === ownerId), "createdAt", limit);
  }
  saveConfidence(record: ConfidenceHistoryRecord) {
    this.#confidence.set(record.id, clone(ConfidenceHistoryRecordSchema.parse(record)));
  }
  listConfidence(ownerId: string, limit: number) {
    return ordered([...this.#confidence.values()].filter((item) => item.ownerId === ownerId), "createdAt", limit);
  }
  saveClarification(record: ClarificationHistoryRecord19A) {
    this.#clarifications.set(record.id, clone(ClarificationHistoryRecordSchema19A.parse(record)));
  }
  listClarifications(ownerId: string, limit: number) {
    return ordered([...this.#clarifications.values()].filter((item) => item.ownerId === ownerId), "createdAt", limit);
  }
  saveRetrieval(record: RetrievalHistoryRecord19A) {
    this.#retrieval.set(record.id, clone(RetrievalHistoryRecord19ASchema.parse(record)));
  }
  listRetrieval(ownerId: string, limit: number) {
    return ordered([...this.#retrieval.values()].filter((item) => item.ownerId === ownerId), "createdAt", limit);
  }
  savePreference(record: PreferenceLearningRecord) {
    this.#preferences.set(record.id, clone(PreferenceLearningRecordSchema.parse(record)));
  }
  listPreferences(ownerId: string, limit: number) {
    return ordered([...this.#preferences.values()].filter((item) => item.ownerId === ownerId), "lastSeenAt", limit);
  }
  savePreferenceEvidence(record: PreferenceEvidenceRecord) {
    this.#preferenceEvidence.set(record.id, clone(PreferenceEvidenceRecordSchema.parse(record)));
  }
  listPreferenceEvidence(ownerId: string, limit: number) {
    return ordered([...this.#preferenceEvidence.values()].filter((item) => item.ownerId === ownerId), "observedAt", limit);
  }
  saveStatistic(record: InteractionStatisticsRecord) {
    this.#statistics.set(record.id, clone(InteractionStatisticsRecordSchema.parse(record)));
  }
  listStatistics(ownerId: string, limit: number) {
    return ordered([...this.#statistics.values()].filter((item) => item.ownerId === ownerId), "measuredAt", limit);
  }
  saveResponseTemplate(record: ResponseTemplateRecord) {
    this.#templates.set(record.id, clone(ResponseTemplateRecordSchema.parse(record)));
  }
  listResponseTemplates(ownerId: string, limit: number) {
    return ordered([...this.#templates.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveSocialRule(record: SocialRuleRecord) {
    this.#socialRules.set(record.id, clone(SocialRuleRecordSchema.parse(record)));
  }
  listSocialRules(ownerId: string, limit: number) {
    return ordered([...this.#socialRules.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveCommunicationProfile(record: CommunicationProfileRecord) {
    this.#communication.set(record.id, clone(CommunicationProfileRecordSchema.parse(record)));
  }
  listCommunicationProfiles(ownerId: string, limit: number) {
    return ordered([...this.#communication.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveWorkingProfile(record: WorkingProfileRecord) {
    this.#working.set(record.id, clone(WorkingProfileRecordSchema.parse(record)));
  }
  listWorkingProfiles(ownerId: string, limit: number) {
    return ordered([...this.#working.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  saveDecisionProfile(record: DecisionProfileRecord) {
    this.#decision.set(record.id, clone(DecisionProfileRecordSchema.parse(record)));
  }
  listDecisionProfiles(ownerId: string, limit: number) {
    return ordered([...this.#decision.values()].filter((item) => item.ownerId === ownerId), "updatedAt", limit);
  }
  savePersonalityVersion(record: PersonalityVersionRecord) {
    this.#versions.set(record.id, clone(PersonalityVersionRecordSchema.parse(record)));
  }
  listPersonalityVersions(ownerId: string, limit: number) {
    return ordered([...this.#versions.values()].filter((item) => item.ownerId === ownerId), "createdAt", limit);
  }
  saveBootstrap(record: BootstrapProfileRecord) {
    this.#bootstraps.set(record.id, clone(BootstrapProfileRecordSchema.parse(record)));
  }
  listBootstraps(ownerId: string, limit: number) {
    return ordered([...this.#bootstraps.values()].filter((item) => item.ownerId === ownerId), "createdAt", limit);
  }
}
