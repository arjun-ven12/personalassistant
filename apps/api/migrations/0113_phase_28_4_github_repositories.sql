CREATE TABLE engineering_github_repositories (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  provider_repository_id bigint NOT NULL,
  credential_reference_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, company_id, id),
  UNIQUE (owner_id, company_id, provider_repository_id)
);
CREATE INDEX engineering_github_repositories_recent_idx
  ON engineering_github_repositories(owner_id, company_id, updated_at DESC);

CREATE TABLE engineering_github_creations (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  request_digest text NOT NULL,
  status text NOT NULL CHECK (status IN ('UNCERTAIN', 'COMPLETE')),
  registration_id uuid,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (owner_id, company_id, idempotency_key)
);
