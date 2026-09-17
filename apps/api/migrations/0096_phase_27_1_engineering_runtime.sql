CREATE TABLE engineering_repositories (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  workspace_locator_id text NOT NULL,
  status text NOT NULL CHECK(status IN ('ACTIVE','DISABLED','ARCHIVED')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id,company_id,id),
  UNIQUE(owner_id,company_id,workspace_locator_id)
);
CREATE INDEX engineering_repositories_scope_idx ON engineering_repositories(owner_id,company_id,status,updated_at DESC);

CREATE TABLE engineering_command_profiles (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK(status IN ('ACTIVE','DISABLED')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id,company_id,id)
);

CREATE TABLE engineering_workspaces (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  repository_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  state text NOT NULL CHECK(state IN ('CREATING','READY','DIRTY','VALIDATING','COMPLETED','FAILED','CANCELLED','CLEANING_UP','ARCHIVED')),
  lease_owner text,
  lease_expires_at timestamptz,
  lease_generation bigint NOT NULL DEFAULT 0 CHECK(lease_generation>=0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id,company_id,id),
  FOREIGN KEY(owner_id,company_id,repository_id) REFERENCES engineering_repositories(owner_id,company_id,id) ON DELETE RESTRICT,
  UNIQUE(owner_id,company_id,repository_id,idempotency_key)
);
CREATE INDEX engineering_workspaces_scope_idx ON engineering_workspaces(owner_id,company_id,repository_id,state,updated_at DESC);
CREATE INDEX engineering_workspaces_lease_idx ON engineering_workspaces(lease_expires_at) WHERE lease_expires_at IS NOT NULL;

CREATE TABLE engineering_executions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  repository_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  capability text NOT NULL,
  status text NOT NULL CHECK(status IN ('RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id,company_id,id),
  FOREIGN KEY(owner_id,company_id,repository_id) REFERENCES engineering_repositories(owner_id,company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,company_id,workspace_id) REFERENCES engineering_workspaces(owner_id,company_id,id) ON DELETE RESTRICT
);
CREATE INDEX engineering_executions_scope_idx ON engineering_executions(owner_id,company_id,workspace_id,started_at DESC);

CREATE TABLE engineering_validation_reports (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN ('PASS','FAIL','ERROR','CANCELLED')),
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  FOREIGN KEY(owner_id,company_id,workspace_id) REFERENCES engineering_workspaces(owner_id,company_id,id) ON DELETE RESTRICT
);
CREATE INDEX engineering_validation_reports_scope_idx ON engineering_validation_reports(owner_id,company_id,workspace_id,created_at DESC);
