CREATE TABLE IF NOT EXISTS native_gesture_sessions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS native_gesture_sessions_owner_id_id_idx
  ON native_gesture_sessions(owner_id, id);

CREATE INDEX IF NOT EXISTS native_gesture_sessions_owner_device_idx
  ON native_gesture_sessions(owner_id, device_id);

CREATE INDEX IF NOT EXISTS native_gesture_sessions_owner_updated_idx
  ON native_gesture_sessions(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS runtime_profiles (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS runtime_profiles_owner_id_id_idx
  ON runtime_profiles(owner_id, id);

CREATE INDEX IF NOT EXISTS runtime_profiles_owner_active_idx
  ON runtime_profiles(owner_id, ((record->>'active')));

CREATE TABLE IF NOT EXISTS camera_providers (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS camera_providers_owner_updated_idx
  ON camera_providers(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS monitor_layouts (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS monitor_layouts_owner_id_id_idx
  ON monitor_layouts(owner_id, id);

CREATE TABLE IF NOT EXISTS desktop_context_history (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS desktop_context_history_owner_id_id_idx
  ON desktop_context_history(owner_id, id);

CREATE INDEX IF NOT EXISTS desktop_context_history_owner_observed_idx
  ON desktop_context_history(owner_id, ((record->>'observedAt')) DESC);

CREATE TABLE IF NOT EXISTS native_runtime_metrics (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS native_runtime_metrics_owner_id_id_idx
  ON native_runtime_metrics(owner_id, id);

CREATE INDEX IF NOT EXISTS native_runtime_metrics_owner_measured_idx
  ON native_runtime_metrics(owner_id, ((record->>'measuredAt')) DESC);

CREATE TABLE IF NOT EXISTS spatial_overlays (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS spatial_overlays_owner_id_id_idx
  ON spatial_overlays(owner_id, id);

CREATE TABLE IF NOT EXISTS runtime_sync (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS runtime_sync_owner_id_id_idx
  ON runtime_sync(owner_id, id);

CREATE INDEX IF NOT EXISTS runtime_sync_owner_synced_idx
  ON runtime_sync(owner_id, ((record->>'lastSyncedAt')) DESC);
