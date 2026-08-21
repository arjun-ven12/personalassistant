CREATE TABLE IF NOT EXISTS gesture_sequences (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gesture_sequences_owner_id_id_idx
  ON gesture_sequences(owner_id, id);

CREATE INDEX IF NOT EXISTS gesture_sequences_owner_updated_idx
  ON gesture_sequences(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS interaction_predictions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS interaction_predictions_owner_id_id_idx
  ON interaction_predictions(owner_id, id);

CREATE INDEX IF NOT EXISTS interaction_predictions_owner_observed_idx
  ON interaction_predictions(owner_id, ((record->>'observedAt')) DESC);

CREATE TABLE IF NOT EXISTS cursor_metrics (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cursor_metrics_owner_id_id_idx
  ON cursor_metrics(owner_id, id);

CREATE INDEX IF NOT EXISTS cursor_metrics_owner_measured_idx
  ON cursor_metrics(owner_id, ((record->>'measuredAt')) DESC);

CREATE TABLE IF NOT EXISTS ray_sessions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ray_sessions_owner_id_id_idx
  ON ray_sessions(owner_id, id);

CREATE INDEX IF NOT EXISTS ray_sessions_owner_updated_idx
  ON ray_sessions(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS physics_profiles (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS physics_profiles_owner_updated_idx
  ON physics_profiles(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS spatial_navigation_history (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS spatial_navigation_history_owner_id_id_idx
  ON spatial_navigation_history(owner_id, id);

CREATE INDEX IF NOT EXISTS spatial_navigation_history_owner_navigated_idx
  ON spatial_navigation_history(owner_id, ((record->>'navigatedAt')) DESC);
