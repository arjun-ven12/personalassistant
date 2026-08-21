CREATE TABLE IF NOT EXISTS camera_devices (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id)
);

CREATE TABLE IF NOT EXISTS vision_sessions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vision_sessions_owner_id_id_idx
  ON vision_sessions(owner_id, id);

CREATE INDEX IF NOT EXISTS vision_sessions_owner_updated_idx
  ON vision_sessions(owner_id, ((record->>'updatedAt')) DESC);

CREATE TABLE IF NOT EXISTS gesture_profiles (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gesture_profiles_owner_id_id_idx
  ON gesture_profiles(owner_id, id);

CREATE INDEX IF NOT EXISTS gesture_profiles_owner_active_idx
  ON gesture_profiles(owner_id, ((record->>'active')));

CREATE TABLE IF NOT EXISTS gesture_mappings (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  gesture text NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gesture_mappings_owner_id_id_idx
  ON gesture_mappings(owner_id, id);

CREATE INDEX IF NOT EXISTS gesture_mappings_owner_profile_idx
  ON gesture_mappings(owner_id, profile_id);

CREATE INDEX IF NOT EXISTS gesture_mappings_owner_gesture_idx
  ON gesture_mappings(owner_id, gesture);

CREATE TABLE IF NOT EXISTS gesture_history (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gesture_history_owner_id_id_idx
  ON gesture_history(owner_id, id);

CREATE INDEX IF NOT EXISTS gesture_history_owner_observed_idx
  ON gesture_history(owner_id, ((record->>'observedAt')) DESC);

CREATE TABLE IF NOT EXISTS gesture_calibration (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gesture_calibration_owner_id_id_idx
  ON gesture_calibration(owner_id, id);

CREATE INDEX IF NOT EXISTS gesture_calibration_owner_profile_idx
  ON gesture_calibration(owner_id, profile_id);

CREATE TABLE IF NOT EXISTS gesture_macros (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gesture_macros_owner_id_id_idx
  ON gesture_macros(owner_id, id);

CREATE INDEX IF NOT EXISTS gesture_macros_owner_profile_idx
  ON gesture_macros(owner_id, profile_id);

CREATE TABLE IF NOT EXISTS gesture_metrics (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gesture_metrics_owner_id_id_idx
  ON gesture_metrics(owner_id, id);

CREATE INDEX IF NOT EXISTS gesture_metrics_owner_measured_idx
  ON gesture_metrics(owner_id, ((record->>'measuredAt')) DESC);

CREATE TABLE IF NOT EXISTS custom_gestures (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS custom_gestures_owner_id_id_idx
  ON custom_gestures(owner_id, id);

CREATE INDEX IF NOT EXISTS custom_gestures_owner_profile_idx
  ON custom_gestures(owner_id, profile_id);

CREATE TABLE IF NOT EXISTS gesture_versions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gesture_versions_owner_id_id_idx
  ON gesture_versions(owner_id, id);

CREATE INDEX IF NOT EXISTS gesture_versions_owner_record_idx
  ON gesture_versions(owner_id, ((record->>'recordType')), ((record->>'recordId')));

CREATE TABLE IF NOT EXISTS tracking_metrics (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tracking_metrics_owner_id_id_idx
  ON tracking_metrics(owner_id, id);

CREATE INDEX IF NOT EXISTS tracking_metrics_owner_measured_idx
  ON tracking_metrics(owner_id, ((record->>'measuredAt')) DESC);
