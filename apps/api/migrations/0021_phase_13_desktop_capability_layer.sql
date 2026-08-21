CREATE TABLE IF NOT EXISTS desktop_capabilities (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  category text NOT NULL,
  risk_level text NOT NULL,
  status text NOT NULL,
  provider_id text NOT NULL,
  approval_required boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS desktop_capabilities_owner_category_idx
  ON desktop_capabilities(owner_id, category, status);

CREATE TABLE IF NOT EXISTS capability_providers (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  provider_type text NOT NULL,
  status text NOT NULL,
  last_checked_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS desktop_context (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  permission_state text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, id)
);

CREATE INDEX IF NOT EXISTS desktop_context_owner_updated_idx
  ON desktop_context(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS application_registry (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  bundle_id text NOT NULL,
  status text NOT NULL,
  pinned boolean NOT NULL,
  recent boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS window_layouts (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, id)
);

CREATE TABLE IF NOT EXISTS clipboard_history (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  format text NOT NULL,
  sensitive boolean NOT NULL,
  captured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, id)
);

CREATE INDEX IF NOT EXISTS clipboard_history_owner_captured_idx
  ON clipboard_history(owner_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS desktop_actions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  capability_id text NOT NULL,
  provider_id text NOT NULL,
  status text NOT NULL,
  risk_level text NOT NULL,
  approval_required boolean NOT NULL,
  requested_at timestamptz NOT NULL,
  completed_at timestamptz,
  record jsonb NOT NULL,
  UNIQUE(owner_id, id)
);

CREATE INDEX IF NOT EXISTS desktop_actions_owner_status_idx
  ON desktop_actions(owner_id, status, requested_at DESC);

CREATE TABLE IF NOT EXISTS capability_metrics (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  capability_id text NOT NULL,
  metric_name text NOT NULL,
  value numeric NOT NULL,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, id)
);

CREATE TABLE IF NOT EXISTS provider_health (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  status text NOT NULL,
  checked_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, id)
);

CREATE TABLE IF NOT EXISTS desktop_preferences (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  key text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, id),
  UNIQUE(owner_id, key)
);
