CREATE TABLE patches (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  status varchar(40) NOT NULL,
  patch_digest char(64) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);
CREATE INDEX patches_owner_idx ON patches(owner_id, created_at DESC);
CREATE INDEX patches_repository_idx ON patches(repository_id, status);

CREATE TABLE patch_reviews (
  id uuid PRIMARY KEY,
  patch_id uuid NOT NULL REFERENCES patches(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  status varchar(40) NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);
CREATE INDEX patch_reviews_patch_idx ON patch_reviews(patch_id, created_at DESC);

CREATE TABLE rollback_snapshots (
  id uuid PRIMARY KEY,
  patch_id uuid NOT NULL REFERENCES patches(id) ON DELETE CASCADE,
  execution_request_id uuid REFERENCES execution_requests(id) ON DELETE SET NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);
CREATE INDEX rollback_snapshots_patch_idx ON rollback_snapshots(patch_id, created_at DESC);

CREATE TABLE patch_execution_history (
  id uuid PRIMARY KEY,
  patch_id uuid NOT NULL REFERENCES patches(id) ON DELETE CASCADE,
  execution_request_id uuid REFERENCES execution_requests(id) ON DELETE SET NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  status varchar(40) NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);
