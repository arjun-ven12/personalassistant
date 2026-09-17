CREATE TABLE engineering_objectives (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  repository_id uuid NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id,company_id,id),
  FOREIGN KEY(owner_id,company_id,repository_id)
    REFERENCES engineering_repositories(owner_id,company_id,id) ON DELETE RESTRICT
);
CREATE INDEX engineering_objectives_scope_idx
  ON engineering_objectives(owner_id,company_id,status,updated_at DESC);

CREATE TABLE engineering_objective_tasks (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  objective_id uuid NOT NULL,
  repository_id uuid NOT NULL,
  status text NOT NULL,
  lease_owner text,
  lease_expires_at timestamptz,
  lease_generation bigint NOT NULL DEFAULT 0 CHECK(lease_generation >= 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id,company_id,id),
  FOREIGN KEY(owner_id,company_id,objective_id)
    REFERENCES engineering_objectives(owner_id,company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,company_id,repository_id)
    REFERENCES engineering_repositories(owner_id,company_id,id) ON DELETE RESTRICT
);
CREATE INDEX engineering_objective_tasks_ready_idx
  ON engineering_objective_tasks(owner_id,company_id,objective_id,status,updated_at);
CREATE INDEX engineering_objective_tasks_lease_idx
  ON engineering_objective_tasks(lease_expires_at) WHERE lease_expires_at IS NOT NULL;

CREATE TABLE engineering_task_results (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  objective_id uuid NOT NULL,
  task_id uuid NOT NULL,
  completed_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id,company_id,task_id),
  FOREIGN KEY(owner_id,company_id,objective_id)
    REFERENCES engineering_objectives(owner_id,company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,company_id,task_id)
    REFERENCES engineering_objective_tasks(owner_id,company_id,id) ON DELETE RESTRICT
);

CREATE TABLE engineering_task_artifacts (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  objective_id uuid NOT NULL,
  task_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  FOREIGN KEY(owner_id,company_id,objective_id)
    REFERENCES engineering_objectives(owner_id,company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,company_id,task_id)
    REFERENCES engineering_objective_tasks(owner_id,company_id,id) ON DELETE RESTRICT
);

CREATE TABLE engineering_orchestration_events (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  objective_id uuid NOT NULL,
  task_id uuid,
  type text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  FOREIGN KEY(owner_id,company_id,objective_id)
    REFERENCES engineering_objectives(owner_id,company_id,id) ON DELETE RESTRICT
);
CREATE INDEX engineering_orchestration_events_scope_idx
  ON engineering_orchestration_events(owner_id,company_id,objective_id,created_at);
