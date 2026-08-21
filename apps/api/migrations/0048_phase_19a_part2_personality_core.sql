CREATE TABLE IF NOT EXISTS personality_identity (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS personality_behaviours (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS communication_rules (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS interaction_policies (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS decision_preferences (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS working_styles (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS personality_learning_events (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS preference_confidence (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS personality_simulations (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS personality_state_history (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS response_explanations (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

ALTER TABLE IF EXISTS behaviour_traits ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS behaviour_traits ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS behaviour_examples ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS behaviour_examples ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS social_rules ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS social_rules ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS personality_profiles ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS personality_profiles ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS personality_versions ADD COLUMN IF NOT EXISTS sort_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS personality_versions ADD COLUMN IF NOT EXISTS record jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_personality_identity_owner_sort ON personality_identity(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_behaviour_traits_owner_sort ON behaviour_traits(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_personality_behaviours_owner_sort ON personality_behaviours(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_communication_rules_owner_sort ON communication_rules(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_interaction_policies_owner_sort ON interaction_policies(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_preferences_owner_sort ON decision_preferences(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_working_styles_owner_sort ON working_styles(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_behaviour_examples_owner_sort ON behaviour_examples(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_personality_learning_events_owner_sort ON personality_learning_events(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_preference_confidence_owner_sort ON preference_confidence(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_personality_simulations_owner_sort ON personality_simulations(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_personality_state_history_owner_sort ON personality_state_history(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_response_explanations_owner_sort ON response_explanations(owner_id, sort_at DESC);
