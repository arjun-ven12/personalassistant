CREATE TABLE IF NOT EXISTS semantic_interactions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  origin text NOT NULL,
  requested_action text NOT NULL,
  target_object_id text NULL,
  status text NOT NULL,
  requested_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_interactions_owner_requested
  ON semantic_interactions(owner_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_interactions_owner_target
  ON semantic_interactions(owner_id, target_object_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS interaction_history (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  interaction_id uuid NOT NULL,
  action text NOT NULL,
  target_object_id text NULL,
  origin text NOT NULL,
  result text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_interaction_history_owner_created
  ON interaction_history(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interaction_history_owner_interaction
  ON interaction_history(owner_id, interaction_id);

CREATE TABLE IF NOT EXISTS interaction_verification (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  interaction_id uuid NOT NULL,
  target_object_id text NULL,
  verification_type text NOT NULL,
  status text NOT NULL,
  verified_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_interaction_verification_owner_verified
  ON interaction_verification(owner_id, verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_interaction_verification_owner_interaction
  ON interaction_verification(owner_id, interaction_id);

CREATE TABLE IF NOT EXISTS field_mappings (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_id text NOT NULL,
  field_key text NOT NULL,
  field_type text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_field_mappings_owner_object_key
  ON field_mappings(owner_id, object_id, field_key);
CREATE INDEX IF NOT EXISTS idx_field_mappings_owner_updated
  ON field_mappings(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS interaction_failures (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  interaction_id uuid NOT NULL,
  target_object_id text NULL,
  failure_code text NOT NULL,
  retry_safe boolean NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_interaction_failures_owner_created
  ON interaction_failures(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interaction_failures_owner_code
  ON interaction_failures(owner_id, failure_code, created_at DESC);

CREATE TABLE IF NOT EXISTS desktop_interaction_profiles (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_desktop_interaction_profiles_owner_updated
  ON desktop_interaction_profiles(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS desktop_interaction_metrics (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  value double precision NOT NULL,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_desktop_interaction_metrics_owner_measured
  ON desktop_interaction_metrics(owner_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_desktop_interaction_metrics_owner_name
  ON desktop_interaction_metrics(owner_id, metric_name, measured_at DESC);

CREATE TABLE IF NOT EXISTS semantic_actions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  interaction_id uuid NOT NULL,
  sequence integer NOT NULL,
  action text NOT NULL,
  target_object_id text NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_actions_owner_created
  ON semantic_actions(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_actions_owner_interaction
  ON semantic_actions(owner_id, interaction_id, sequence);

CREATE TABLE IF NOT EXISTS target_resolution (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  query text NULL,
  object_id text NULL,
  resolved_object_id text NULL,
  status text NOT NULL,
  confidence double precision NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_target_resolution_owner_created
  ON target_resolution(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_target_resolution_owner_status
  ON target_resolution(owner_id, status, created_at DESC);
