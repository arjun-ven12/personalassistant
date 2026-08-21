CREATE TABLE IF NOT EXISTS navigation_graph (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  graph_version text NOT NULL,
  node_count integer NOT NULL,
  edge_count integer NOT NULL,
  generated_at timestamptz NOT NULL,
  deterministic boolean NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_navigation_graph_owner_generated
  ON navigation_graph(owner_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS focus_history (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_id text NOT NULL,
  previous_object_id text NULL,
  focus_reason text NOT NULL,
  changed_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_focus_history_owner_changed
  ON focus_history(owner_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_focus_history_owner_object
  ON focus_history(owner_id, object_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS navigation_history (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_object_id text NULL,
  to_object_id text NULL,
  status text NOT NULL,
  occurred_at timestamptz NOT NULL,
  read_only boolean NOT NULL,
  activated_control boolean NOT NULL,
  typed_text boolean NOT NULL,
  clicked_button boolean NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_navigation_history_owner_occurred
  ON navigation_history(owner_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_navigation_history_owner_status
  ON navigation_history(owner_id, status, occurred_at DESC);

CREATE TABLE IF NOT EXISTS navigation_sessions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  status text NOT NULL,
  current_object_id text NULL,
  started_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_navigation_sessions_owner_updated
  ON navigation_sessions(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS navigation_targets (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_id text NOT NULL,
  label text NOT NULL,
  role text NOT NULL,
  priority double precision NOT NULL,
  visible boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_navigation_targets_owner_object
  ON navigation_targets(owner_id, object_id);
CREATE INDEX IF NOT EXISTS idx_navigation_targets_owner_role_visible
  ON navigation_targets(owner_id, role, visible);

CREATE TABLE IF NOT EXISTS highlight_profiles (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_highlight_profiles_owner_updated
  ON highlight_profiles(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS navigation_metrics (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  value double precision NOT NULL,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_navigation_metrics_owner_measured
  ON navigation_metrics(owner_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_navigation_metrics_owner_name
  ON navigation_metrics(owner_id, metric_name, measured_at DESC);

CREATE TABLE IF NOT EXISTS window_navigation (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  window_id text NOT NULL,
  application_id text NOT NULL,
  focused_object_id text NULL,
  navigated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_window_navigation_owner_window
  ON window_navigation(owner_id, window_id, navigated_at DESC);
