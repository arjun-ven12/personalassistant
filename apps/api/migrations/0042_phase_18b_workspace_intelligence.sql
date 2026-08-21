CREATE TABLE IF NOT EXISTS semantic_workspaces (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  provider_id text NULL,
  domain text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_workspaces_owner_app
  ON semantic_workspaces(owner_id, application_id);
CREATE INDEX IF NOT EXISTS idx_semantic_workspaces_owner_updated
  ON semantic_workspaces(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS workspace_semantic_objects (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  provider_id text NULL,
  object_type text NOT NULL,
  title text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_semantic_objects_owner_type
  ON workspace_semantic_objects(owner_id, object_type);
CREATE INDEX IF NOT EXISTS idx_workspace_semantic_objects_owner_app
  ON workspace_semantic_objects(owner_id, application_id);
CREATE INDEX IF NOT EXISTS idx_workspace_semantic_objects_owner_title
  ON workspace_semantic_objects(owner_id, lower(title));

CREATE TABLE IF NOT EXISTS workspace_semantic_relationships (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  from_object_id uuid NOT NULL,
  to_object_id uuid NOT NULL,
  relationship text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_semantic_relationships_owner_from
  ON workspace_semantic_relationships(owner_id, from_object_id, relationship);
CREATE INDEX IF NOT EXISTS idx_workspace_semantic_relationships_owner_to
  ON workspace_semantic_relationships(owner_id, to_object_id, relationship);

CREATE TABLE IF NOT EXISTS workspace_semantic_context (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  current_application_id text NULL,
  current_object_id uuid NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_semantic_context_owner_updated
  ON workspace_semantic_context(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS workspace_semantic_indexes (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_id uuid NOT NULL,
  indexed_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_semantic_indexes_owner_object
  ON workspace_semantic_indexes(owner_id, object_id);

CREATE TABLE IF NOT EXISTS workspace_semantic_navigation (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  resolved_object_id uuid NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_semantic_navigation_owner_created
  ON workspace_semantic_navigation(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_semantic_navigation_owner_object
  ON workspace_semantic_navigation(owner_id, resolved_object_id);

CREATE TABLE IF NOT EXISTS semantic_history (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  resolved_object_id uuid NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_history_owner_created
  ON semantic_history(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_memory (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_id uuid NOT NULL,
  memory_type text NOT NULL,
  last_used_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_memory_owner_type
  ON workspace_memory(owner_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_workspace_memory_owner_used
  ON workspace_memory(owner_id, last_used_at DESC);

CREATE TABLE IF NOT EXISTS object_metadata (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_id uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_object_metadata_owner_object
  ON object_metadata(owner_id, object_id);

CREATE TABLE IF NOT EXISTS object_search_index (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_id uuid NOT NULL,
  indexed_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_object_search_index_owner_object
  ON object_search_index(owner_id, object_id);
