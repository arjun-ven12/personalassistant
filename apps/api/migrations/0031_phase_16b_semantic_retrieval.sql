CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;
SELECT set_config('search_path', current_schema() || ',public', false);

CREATE TABLE IF NOT EXISTS semantic_registry (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_key text NOT NULL,
  display_name text NOT NULL,
  category text NOT NULL,
  visibility text NOT NULL,
  creation_source text NOT NULL,
  route_path text NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, object_key)
);

CREATE INDEX IF NOT EXISTS idx_semantic_registry_owner_updated
  ON semantic_registry(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_registry_owner_category
  ON semantic_registry(owner_id, category, visibility);
CREATE INDEX IF NOT EXISTS idx_semantic_registry_owner_display
  ON semantic_registry(owner_id, lower(display_name));

CREATE TABLE IF NOT EXISTS semantic_aliases (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_id uuid NOT NULL,
  normalized_alias text NOT NULL,
  source text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, object_id) REFERENCES semantic_registry(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_semantic_aliases_owner_alias
  ON semantic_aliases(owner_id, normalized_alias, status);
CREATE INDEX IF NOT EXISTS idx_semantic_aliases_owner_object
  ON semantic_aliases(owner_id, object_id);

CREATE TABLE IF NOT EXISTS semantic_embeddings (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_id uuid NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  embedding_version text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  embedding vector(1536) NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, object_id) REFERENCES semantic_registry(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_semantic_embeddings_owner_object
  ON semantic_embeddings(owner_id, object_id, status);
CREATE INDEX IF NOT EXISTS idx_semantic_embeddings_owner_updated
  ON semantic_embeddings(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_embeddings_vector
  ON semantic_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;

CREATE TABLE IF NOT EXISTS embedding_versions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_id uuid NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, object_id) REFERENCES semantic_registry(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_embedding_versions_owner_object_created
  ON embedding_versions(owner_id, object_id, created_at DESC);

CREATE TABLE IF NOT EXISTS semantic_categories (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  category text NOT NULL,
  description text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, category)
);

CREATE TABLE IF NOT EXISTS semantic_tags (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_id uuid NOT NULL,
  tag text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, object_id) REFERENCES semantic_registry(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_semantic_tags_owner_tag
  ON semantic_tags(owner_id, tag);

CREATE TABLE IF NOT EXISTS semantic_usage (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_id uuid NOT NULL,
  source text NOT NULL,
  success boolean NOT NULL,
  used_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, object_id) REFERENCES semantic_registry(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_semantic_usage_owner_object_used
  ON semantic_usage(owner_id, object_id, used_at DESC);

CREATE TABLE IF NOT EXISTS retrieval_history (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  source text NOT NULL,
  resolution text NOT NULL,
  selected_object_id uuid NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_retrieval_history_owner_created
  ON retrieval_history(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retrieval_history_owner_resolution
  ON retrieval_history(owner_id, resolution);

CREATE TABLE IF NOT EXISTS retrieval_metrics (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  source text NOT NULL,
  resolution text NOT NULL,
  latency_ms double precision NOT NULL,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_retrieval_metrics_owner_measured
  ON retrieval_metrics(owner_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS confidence_models (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name text NOT NULL,
  version text NOT NULL,
  threshold double precision NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  UNIQUE (owner_id, name, version)
);

CREATE TABLE IF NOT EXISTS synonym_dictionary (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  term text NOT NULL,
  source text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_synonym_dictionary_owner_term
  ON synonym_dictionary(owner_id, term, status);

CREATE TABLE IF NOT EXISTS context_ranking (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  context_key text NOT NULL,
  object_id uuid NOT NULL,
  weight double precision NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, object_id) REFERENCES semantic_registry(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_context_ranking_owner_context
  ON context_ranking(owner_id, context_key, weight DESC);

CREATE TABLE IF NOT EXISTS semantic_permissions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_id uuid NOT NULL,
  permission text NOT NULL,
  allowed boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, object_id) REFERENCES semantic_registry(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_semantic_permissions_owner_object
  ON semantic_permissions(owner_id, object_id, permission);
