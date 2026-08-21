CREATE TABLE IF NOT EXISTS desktop_applications (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  display_name text NOT NULL,
  bundle_id text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_desktop_applications_owner_application
  ON desktop_applications(owner_id, application_id);

CREATE TABLE IF NOT EXISTS desktop_windows (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  role text NOT NULL,
  focused boolean NOT NULL,
  visible boolean NOT NULL,
  modal boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_desktop_windows_owner_application
  ON desktop_windows(owner_id, application_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS semantic_objects (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  window_id text NULL,
  parent_id text NULL,
  role text NOT NULL,
  display_name text NOT NULL,
  visibility text NOT NULL,
  source text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_objects_owner_app_window
  ON semantic_objects(owner_id, application_id, window_id);
CREATE INDEX IF NOT EXISTS idx_semantic_objects_owner_role_visibility
  ON semantic_objects(owner_id, role, visibility);
CREATE INDEX IF NOT EXISTS idx_semantic_objects_owner_display
  ON semantic_objects(owner_id, lower(display_name));

CREATE TABLE IF NOT EXISTS semantic_relationships (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  from_object_id text NOT NULL,
  to_object_id text NOT NULL,
  relationship text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_relationships_owner_from
  ON semantic_relationships(owner_id, from_object_id, relationship);
CREATE INDEX IF NOT EXISTS idx_semantic_relationships_owner_to
  ON semantic_relationships(owner_id, to_object_id, relationship);

CREATE TABLE IF NOT EXISTS desktop_registry (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  registry_type text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_desktop_registry_owner_updated
  ON desktop_registry(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS desktop_events (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  application_id text NULL,
  window_id text NULL,
  object_id text NULL,
  occurred_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_desktop_events_owner_occurred
  ON desktop_events(owner_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS desktop_semantic_context (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  current_application_id text NULL,
  current_window_id text NULL,
  focused_object_id text NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_desktop_semantic_context_owner_updated
  ON desktop_semantic_context(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS accessibility_snapshots (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  application_id text NOT NULL,
  status text NOT NULL,
  captured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_accessibility_snapshots_owner_captured
  ON accessibility_snapshots(owner_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS semantic_versions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_id text NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_versions_owner_object
  ON semantic_versions(owner_id, object_id, created_at DESC);

CREATE TABLE IF NOT EXISTS window_history (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  window_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_window_history_owner_window
  ON window_history(owner_id, window_id, occurred_at DESC);
