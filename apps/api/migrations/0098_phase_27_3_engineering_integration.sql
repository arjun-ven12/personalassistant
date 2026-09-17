CREATE TABLE engineering_integration_runs (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  repository_id uuid NOT NULL,
  objective_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL,
  lease_owner text,
  lease_expires_at timestamptz,
  lease_generation bigint NOT NULL DEFAULT 0 CHECK(lease_generation >= 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id,company_id,id),
  UNIQUE(owner_id,company_id,repository_id,idempotency_key),
  FOREIGN KEY(owner_id,company_id,repository_id) REFERENCES engineering_repositories(owner_id,company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,company_id,objective_id) REFERENCES engineering_objectives(owner_id,company_id,id) ON DELETE RESTRICT
);
CREATE INDEX engineering_integration_runs_scope_idx ON engineering_integration_runs(owner_id,company_id,status,updated_at DESC);
CREATE INDEX engineering_integration_runs_lease_idx ON engineering_integration_runs(lease_expires_at) WHERE lease_expires_at IS NOT NULL;

CREATE TABLE engineering_merge_candidates (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id,company_id,run_id),
  FOREIGN KEY(owner_id,company_id,run_id) REFERENCES engineering_integration_runs(owner_id,company_id,id) ON DELETE RESTRICT
);

CREATE TABLE engineering_integration_reviews (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  FOREIGN KEY(owner_id,company_id,run_id) REFERENCES engineering_integration_runs(owner_id,company_id,id) ON DELETE RESTRICT
);
CREATE INDEX engineering_integration_reviews_scope_idx ON engineering_integration_reviews(owner_id,company_id,run_id,created_at);
