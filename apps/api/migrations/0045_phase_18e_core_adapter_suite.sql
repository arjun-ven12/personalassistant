CREATE TABLE IF NOT EXISTS core_application_sessions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  adapter_id text NOT NULL,
  application_id text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_core_application_sessions_owner_app
  ON core_application_sessions(owner_id, application_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS application_context_snapshots (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  adapter_id text NOT NULL,
  application_id text NOT NULL,
  captured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_application_context_snapshots_owner_app
  ON application_context_snapshots(owner_id, application_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS adapter_action_history (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  adapter_id text NOT NULL,
  application_id text NOT NULL,
  capability_id text NOT NULL,
  status text NOT NULL,
  requested_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_adapter_action_history_owner_adapter
  ON adapter_action_history(owner_id, adapter_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_adapter_action_history_owner_capability
  ON adapter_action_history(owner_id, capability_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS adapter_health_metrics (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  adapter_id text NOT NULL,
  application_id text NOT NULL,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_adapter_health_metrics_owner_adapter
  ON adapter_health_metrics(owner_id, adapter_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS adapter_permission_status (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  adapter_id text NOT NULL,
  application_id text NOT NULL,
  permission text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_adapter_permission_status_owner_app
  ON adapter_permission_status(owner_id, application_id, permission);

CREATE TABLE IF NOT EXISTS semantic_action_history (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  adapter_id text NOT NULL,
  application_id text NOT NULL,
  capability_id text NOT NULL,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_action_history_owner_adapter
  ON semantic_action_history(owner_id, adapter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_action_history_owner_capability
  ON semantic_action_history(owner_id, capability_id, created_at DESC);

CREATE TABLE IF NOT EXISTS application_usage (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  adapter_id text NOT NULL,
  application_id text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_application_usage_owner_adapter
  ON application_usage(owner_id, adapter_id, updated_at DESC);
