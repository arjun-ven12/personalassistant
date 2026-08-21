CREATE TABLE IF NOT EXISTS personality_profiles (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS personality_states (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS behaviour_rules (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS behaviour_traits (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS conversation_states (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS human_understanding_history (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS conversation_examples (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS interaction_statistics (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS preference_learning (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS preference_evidence (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS alias_dictionary (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS vocabulary_entries (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS pattern_library (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS intent_examples (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS intent_statistics (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS personality_clarification_history (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS confidence_history (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS personality_retrieval_history (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS behaviour_examples (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS response_templates (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS social_rules (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS communication_profiles (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS working_profiles (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS decision_profiles (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS personality_versions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS bootstrap_profiles (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS personality_synonym_dictionary (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

ALTER TABLE IF EXISTS personality_profiles ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS personality_profiles ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS personality_states ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS personality_states ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS behaviour_rules ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS behaviour_rules ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS behaviour_traits ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS behaviour_traits ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS conversation_states ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS conversation_states ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS human_understanding_history ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS human_understanding_history ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS conversation_examples ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS conversation_examples ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS interaction_statistics ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS interaction_statistics ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS preference_learning ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS preference_learning ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS preference_evidence ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS preference_evidence ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS alias_dictionary ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS alias_dictionary ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS vocabulary_entries ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS vocabulary_entries ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS pattern_library ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS pattern_library ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS intent_examples ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS intent_examples ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS intent_statistics ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS intent_statistics ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS personality_clarification_history ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS personality_clarification_history ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS confidence_history ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS confidence_history ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS personality_retrieval_history ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS personality_retrieval_history ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS behaviour_examples ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS behaviour_examples ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS response_templates ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS response_templates ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS social_rules ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS social_rules ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS communication_profiles ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS communication_profiles ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS working_profiles ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS working_profiles ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS decision_profiles ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS decision_profiles ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS personality_versions ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS personality_versions ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS bootstrap_profiles ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS bootstrap_profiles ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS personality_synonym_dictionary ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS personality_synonym_dictionary ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_personality_profiles_owner_sort ON personality_profiles(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_personality_states_owner_sort ON personality_states(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_behaviour_rules_owner_sort ON behaviour_rules(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_states_owner_sort ON conversation_states(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_human_understanding_history_owner_sort ON human_understanding_history(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_interaction_statistics_owner_sort ON interaction_statistics(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_preference_learning_owner_sort ON preference_learning(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_preference_evidence_owner_sort ON preference_evidence(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_alias_dictionary_owner_sort ON alias_dictionary(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_vocabulary_entries_owner_sort ON vocabulary_entries(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_pattern_library_owner_sort ON pattern_library(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_personality_clarification_history_owner_sort ON personality_clarification_history(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_confidence_history_owner_sort ON confidence_history(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_personality_retrieval_history_owner_sort ON personality_retrieval_history(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_response_templates_owner_sort ON response_templates(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_rules_owner_sort ON social_rules(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_communication_profiles_owner_sort ON communication_profiles(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_working_profiles_owner_sort ON working_profiles(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_profiles_owner_sort ON decision_profiles(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_personality_versions_owner_sort ON personality_versions(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_bootstrap_profiles_owner_sort ON bootstrap_profiles(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_personality_synonym_dictionary_owner_sort ON personality_synonym_dictionary(owner_id, sort_at DESC);
