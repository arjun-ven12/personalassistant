CREATE TABLE IF NOT EXISTS spatial_components (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  component_type text NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS spatial_components_owner_type_idx
  ON spatial_components(owner_id, component_type);

CREATE INDEX IF NOT EXISTS spatial_components_owner_updated_idx
  ON spatial_components(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS interaction_profiles (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS interaction_profiles_owner_updated_idx
  ON interaction_profiles(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS animation_profiles (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS animation_profiles_owner_updated_idx
  ON animation_profiles(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS spatial_preferences (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS spatial_preferences_owner_updated_idx
  ON spatial_preferences(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS interaction_sessions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS interaction_sessions_owner_id_id_idx
  ON interaction_sessions(owner_id, id);

CREATE INDEX IF NOT EXISTS interaction_sessions_owner_updated_idx
  ON interaction_sessions(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS interaction_metrics (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS interaction_metrics_owner_id_id_idx
  ON interaction_metrics(owner_id, id);

CREATE INDEX IF NOT EXISTS interaction_metrics_owner_measured_idx
  ON interaction_metrics(owner_id, ((record->>'measuredAt')) DESC);
