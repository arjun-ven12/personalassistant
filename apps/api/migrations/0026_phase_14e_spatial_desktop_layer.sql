CREATE TABLE IF NOT EXISTS desktop_objects (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_type text NOT NULL,
  provider_id text NOT NULL,
  status text NOT NULL,
  risk_level text NOT NULL,
  current boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS desktop_objects_owner_type_idx
  ON desktop_objects(owner_id, object_type, status);

CREATE TABLE IF NOT EXISTS desktop_interaction_history (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_id text NOT NULL,
  interaction_type text NOT NULL,
  capability_id text NOT NULL,
  status text NOT NULL,
  requested_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, id)
);

CREATE INDEX IF NOT EXISTS desktop_interaction_history_owner_requested_idx
  ON desktop_interaction_history(owner_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS desktop_profiles (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  mode text NOT NULL,
  active boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS desktop_overlay_settings (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  monitor_id text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS monitor_profiles (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  monitor_id text NOT NULL,
  calibration_state text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS dock_items (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  target_id text NOT NULL,
  position integer NOT NULL,
  pinned boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS desktop_panels (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  panel_type text NOT NULL,
  visible boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS desktop_navigation_history (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  to_object_id text NOT NULL,
  gesture text NOT NULL,
  navigated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, id)
);

CREATE INDEX IF NOT EXISTS desktop_navigation_history_owner_navigated_idx
  ON desktop_navigation_history(owner_id, navigated_at DESC);

CREATE TABLE IF NOT EXISTS desktop_metrics (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  value numeric NOT NULL,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, id)
);
