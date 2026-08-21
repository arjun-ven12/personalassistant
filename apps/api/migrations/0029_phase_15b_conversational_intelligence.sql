CREATE TABLE IF NOT EXISTS conversation_sessions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  lifecycle_state text NOT NULL,
  modality text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS conversation_sessions_owner_state_idx
  ON conversation_sessions(owner_id, lifecycle_state, updated_at DESC);

CREATE TABLE IF NOT EXISTS conversation_topics (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS conversation_topics_owner_session_idx
  ON conversation_topics(owner_id, conversation_id, status);

CREATE TABLE IF NOT EXISTS conversation_goals (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS conversation_goals_owner_session_idx
  ON conversation_goals(owner_id, conversation_id, status);

CREATE TABLE IF NOT EXISTS conversation_summaries (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  summary_type text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS conversation_summaries_owner_session_idx
  ON conversation_summaries(owner_id, conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conversation_personas (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  mode text NOT NULL,
  active boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS conversation_personas_owner_active_idx
  ON conversation_personas(owner_id, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS clarification_history (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS clarification_history_owner_status_idx
  ON clarification_history(owner_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS conversation_context (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  planner_state text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS conversation_context_owner_session_idx
  ON conversation_context(owner_id, conversation_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS conversation_analytics (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS conversation_analytics_owner_measured_idx
  ON conversation_analytics(owner_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS conversation_bookmarks (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS conversation_bookmarks_owner_created_idx
  ON conversation_bookmarks(owner_id, created_at DESC);
