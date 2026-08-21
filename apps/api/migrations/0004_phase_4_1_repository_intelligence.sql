CREATE TABLE repositories (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  index_status varchar(30) NOT NULL CHECK (index_status IN (
    'UNINDEXED','INDEXING','INDEXED','STALE','FAILED','REINDEX_REQUIRED'
  )),
  active_generation integer,
  active_fingerprint char(64),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, workspace_id)
);
CREATE INDEX repositories_owner_idx ON repositories(owner_id, workspace_id);

CREATE TABLE repository_index_jobs (
  id uuid PRIMARY KEY,
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  status varchar(20) NOT NULL CHECK (status IN (
    'QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED'
  )),
  execution_request_id uuid REFERENCES execution_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  record jsonb NOT NULL
);
CREATE UNIQUE INDEX repository_index_jobs_active_one_idx
  ON repository_index_jobs(repository_id)
  WHERE status IN ('QUEUED','RUNNING');
CREATE INDEX repository_index_jobs_execution_idx
  ON repository_index_jobs(execution_request_id);

CREATE TABLE repository_generations (
  id uuid PRIMARY KEY,
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  generation integer NOT NULL,
  fingerprint char(64) NOT NULL,
  execution_request_id uuid NOT NULL REFERENCES execution_requests(id) ON DELETE RESTRICT,
  indexed_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(repository_id, generation),
  UNIQUE(repository_id, fingerprint)
);
CREATE INDEX repository_generations_owner_idx
  ON repository_generations(owner_id, workspace_id, generation DESC);

CREATE TABLE file_inventory (
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  relative_path varchar(1024) NOT NULL,
  parent_directory varchar(1024) NOT NULL,
  extension varchar(32) NOT NULL,
  language varchar(80) NOT NULL,
  classification varchar(30) NOT NULL,
  size_bytes bigint NOT NULL,
  modified_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(repository_id, generation, relative_path)
);
CREATE INDEX file_inventory_query_idx
  ON file_inventory(repository_id, generation, extension, language, classification);
CREATE INDEX file_inventory_directory_idx
  ON file_inventory(repository_id, generation, parent_directory);

CREATE TABLE directory_nodes (
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  relative_path varchar(1024) NOT NULL,
  parent_directory varchar(1024),
  record jsonb NOT NULL,
  PRIMARY KEY(repository_id, generation, relative_path)
);
CREATE INDEX directory_nodes_parent_idx
  ON directory_nodes(repository_id, generation, parent_directory);
