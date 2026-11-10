CREATE TABLE launch_review_packages (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  objective_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id,company_id,id),
  UNIQUE(owner_id,company_id,objective_id)
);
CREATE INDEX launch_review_packages_status_idx ON launch_review_packages(owner_id,company_id,status,updated_at DESC);

CREATE TABLE launch_review_package_versions (
  owner_id uuid NOT NULL,
  company_id uuid NOT NULL,
  package_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id,company_id,package_id,version),
  FOREIGN KEY(owner_id,company_id,package_id)
    REFERENCES launch_review_packages(owner_id,company_id,id) ON DELETE RESTRICT
);

-- Only internal launch-stage keys need the cross-process uniqueness guarantee.
-- Stage attempts use a package-version suffix, so an owner retry is a new task.
CREATE UNIQUE INDEX workforce_launch_stage_idempotency_idx
  ON workforce_runtime_tasks(owner_id,company_id,(record->>'idempotencyKey'))
  WHERE record->>'idempotencyKey' LIKE 'launch:%';
