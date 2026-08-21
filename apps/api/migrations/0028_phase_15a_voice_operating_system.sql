CREATE TABLE IF NOT EXISTS voice_sessions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  status text NOT NULL,
  runtime_state text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS voice_sessions_owner_status_idx
  ON voice_sessions(owner_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS voice_profiles (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  mode text NOT NULL,
  active boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS voice_profiles_owner_active_idx
  ON voice_profiles(owner_id, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS voice_shortcuts (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  phrase text NOT NULL,
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS voice_shortcuts_owner_phrase_idx
  ON voice_shortcuts(owner_id, phrase, enabled);

CREATE TABLE IF NOT EXISTS conversation_history (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  session_id uuid,
  role text NOT NULL,
  command_id uuid,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS conversation_history_owner_created_idx
  ON conversation_history(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS conversation_history_owner_session_idx
  ON conversation_history(owner_id, session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS voice_metrics (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  session_id uuid,
  provider text NOT NULL,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS voice_metrics_owner_measured_idx
  ON voice_metrics(owner_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS microphone_preferences (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  permission_state text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS microphone_preferences_owner_updated_idx
  ON microphone_preferences(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS wake_word_settings (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS wake_word_settings_owner_updated_idx
  ON wake_word_settings(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS tts_profiles (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  provider text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS tts_profiles_owner_profile_idx
  ON tts_profiles(owner_id, profile_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS stt_provider_metrics (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  provider text NOT NULL,
  last_checked_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS stt_provider_metrics_owner_provider_idx
  ON stt_provider_metrics(owner_id, provider, last_checked_at DESC);
