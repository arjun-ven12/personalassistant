CREATE TABLE IF NOT EXISTS semantic_provider_indexers (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  application_id text NOT NULL,
  indexer_type text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_semantic_provider_indexers_owner_provider_type
  ON semantic_provider_indexers(owner_id, provider_id, indexer_type);
CREATE INDEX IF NOT EXISTS idx_semantic_provider_indexers_owner_status
  ON semantic_provider_indexers(owner_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS semantic_index_sessions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  indexer_id uuid NOT NULL,
  provider_id text NOT NULL,
  application_id text NOT NULL,
  mode text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_index_sessions_owner_indexer
  ON semantic_index_sessions(owner_id, indexer_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_index_sessions_owner_status
  ON semantic_index_sessions(owner_id, status, started_at DESC);

CREATE TABLE IF NOT EXISTS semantic_index_events (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  indexer_id uuid NOT NULL,
  provider_id text NOT NULL,
  application_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_index_events_owner_event
  ON semantic_index_events(owner_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_index_events_owner_indexer
  ON semantic_index_events(owner_id, indexer_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS semantic_index_versions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_id uuid NOT NULL,
  source_provider_id text NOT NULL,
  indexed_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_index_versions_owner_object
  ON semantic_index_versions(owner_id, object_id, indexed_at DESC);

CREATE TABLE IF NOT EXISTS semantic_fingerprints (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_id uuid NOT NULL,
  source_provider_id text NOT NULL,
  calculated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_fingerprints_owner_object
  ON semantic_fingerprints(owner_id, object_id, calculated_at DESC);

CREATE TABLE IF NOT EXISTS semantic_event_log (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  indexer_id uuid NOT NULL,
  provider_id text NOT NULL,
  application_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_event_log_owner_occurred
  ON semantic_event_log(owner_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS semantic_relationship_updates (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  from_object_id uuid NOT NULL,
  to_object_id uuid NOT NULL,
  relationship text NOT NULL,
  occurred_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_relationship_updates_owner_from
  ON semantic_relationship_updates(owner_id, from_object_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_relationship_updates_owner_to
  ON semantic_relationship_updates(owner_id, to_object_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS semantic_index_health (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  indexer_id uuid NOT NULL,
  status text NOT NULL,
  checked_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_index_health_owner_indexer
  ON semantic_index_health(owner_id, indexer_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS semantic_search_statistics (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_search_statistics_owner_measured
  ON semantic_search_statistics(owner_id, measured_at DESC);
