CREATE TABLE IF NOT EXISTS learning_engine_events (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  observed_value TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS learning_engine_events_owner_timestamp_idx
  ON learning_engine_events(owner_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS learning_engine_events_owner_category_subject_idx
  ON learning_engine_events(owner_id, category, subject);

CREATE TABLE IF NOT EXISTS learning_candidates (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  candidate_value TEXT NOT NULL,
  context_key TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  evidence_count INTEGER NOT NULL,
  last_observed_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS learning_candidates_owner_observed_idx
  ON learning_candidates(owner_id, last_observed_at DESC);
CREATE INDEX IF NOT EXISTS learning_candidates_owner_lookup_idx
  ON learning_candidates(owner_id, category, subject, candidate_value, context_key);

CREATE TABLE IF NOT EXISTS learned_preferences (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  value TEXT NOT NULL,
  context_key TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS learned_preferences_owner_updated_idx
  ON learned_preferences(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS learned_preferences_owner_lookup_idx
  ON learned_preferences(owner_id, category, subject, context_key, status);

CREATE TABLE IF NOT EXISTS learning_sequences (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  sequence_key TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  frequency INTEGER NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS learning_sequences_owner_key_idx
  ON learning_sequences(owner_id, sequence_key);
CREATE INDEX IF NOT EXISTS learning_sequences_owner_seen_idx
  ON learning_sequences(owner_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS learning_habits (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  habit_key TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  frequency INTEGER NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS learning_habits_owner_key_idx
  ON learning_habits(owner_id, habit_key);
CREATE INDEX IF NOT EXISTS learning_habits_owner_seen_idx
  ON learning_habits(owner_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS learning_suggestions (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL,
  status TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS learning_suggestions_owner_updated_idx
  ON learning_suggestions(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS learning_suggestions_owner_candidate_idx
  ON learning_suggestions(owner_id, candidate_id);

CREATE TABLE IF NOT EXISTS learning_conflicts (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS learning_conflicts_owner_updated_idx
  ON learning_conflicts(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS learning_conflicts_owner_subject_idx
  ON learning_conflicts(owner_id, category, subject, status);

CREATE TABLE IF NOT EXISTS learning_timeline (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS learning_timeline_owner_occurred_idx
  ON learning_timeline(owner_id, occurred_at DESC);
