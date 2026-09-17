ALTER TABLE engineering_repositories DROP CONSTRAINT engineering_repositories_status_check;
ALTER TABLE engineering_repositories ADD CONSTRAINT engineering_repositories_status_check
  CHECK(status IN ('INITIALIZING','ACTIVE','DISABLED','ARCHIVED'));

CREATE TABLE engineering_deliveries (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  objective_id uuid NOT NULL,
  repository_id uuid NOT NULL,
  status text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id,company_id,id),
  UNIQUE(owner_id,company_id,objective_id),
  UNIQUE(owner_id,company_id,idempotency_key),
  FOREIGN KEY(owner_id,company_id,objective_id)
    REFERENCES engineering_objectives(owner_id,company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,company_id,repository_id)
    REFERENCES engineering_repositories(owner_id,company_id,id) ON DELETE RESTRICT
);
CREATE INDEX engineering_deliveries_scope_idx
  ON engineering_deliveries(owner_id,company_id,status,updated_at DESC);
