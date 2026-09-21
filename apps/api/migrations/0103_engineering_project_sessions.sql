CREATE TABLE engineering_project_sessions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  repository_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, company_id, id),
  UNIQUE (owner_id, company_id, idempotency_key),
  UNIQUE (owner_id, company_id, conversation_id),
  FOREIGN KEY (owner_id, company_id, repository_id)
    REFERENCES engineering_repositories(owner_id, company_id, id) ON DELETE RESTRICT
);
CREATE INDEX engineering_project_sessions_recent_idx
  ON engineering_project_sessions(owner_id, company_id, updated_at DESC);
