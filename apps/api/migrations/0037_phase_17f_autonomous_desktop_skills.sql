CREATE TABLE IF NOT EXISTS desktop_skills (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  generated_skill_id uuid NULL,
  health text NOT NULL,
  planner_available boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_desktop_skills_owner_updated
  ON desktop_skills(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS skill_execution (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  root_skill_id uuid NOT NULL,
  status text NOT NULL,
  origin text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_skill_execution_owner_updated
  ON skill_execution(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS desktop_execution_steps (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  status text NOT NULL,
  sequence integer NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_desktop_execution_steps_owner_execution
  ON desktop_execution_steps(owner_id, execution_id, sequence);

CREATE TABLE IF NOT EXISTS execution_graphs (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL,
  root_skill_id uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_execution_graphs_owner_execution
  ON execution_graphs(owner_id, execution_id);

CREATE TABLE IF NOT EXISTS execution_context (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL,
  current_skill_id uuid NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_execution_context_owner_updated
  ON execution_context(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS execution_conditions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL,
  step_id uuid NOT NULL,
  status text NOT NULL,
  evaluated_at timestamptz NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_execution_conditions_owner_execution
  ON execution_conditions(owner_id, execution_id);

CREATE TABLE IF NOT EXISTS execution_dependencies (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL,
  from_step_id uuid NOT NULL,
  to_step_id uuid NOT NULL,
  satisfied boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_execution_dependencies_owner_execution
  ON execution_dependencies(owner_id, execution_id);

CREATE TABLE IF NOT EXISTS approval_checkpoints (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL,
  step_id uuid NOT NULL,
  status text NOT NULL,
  requested_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_approval_checkpoints_owner_requested
  ON approval_checkpoints(owner_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS workflow_failures (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL,
  step_id uuid NULL,
  recoverable boolean NOT NULL,
  occurred_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_failures_owner_occurred
  ON workflow_failures(owner_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS workflow_recovery (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL,
  step_id uuid NULL,
  action text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_recovery_owner_created
  ON workflow_recovery(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS desktop_workflow_metrics (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  execution_id uuid NULL,
  skill_id uuid NULL,
  metric_name text NOT NULL,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

ALTER TABLE desktop_workflow_metrics ADD COLUMN IF NOT EXISTS execution_id uuid;
ALTER TABLE desktop_workflow_metrics ADD COLUMN IF NOT EXISTS skill_id uuid;
ALTER TABLE desktop_workflow_metrics ADD COLUMN IF NOT EXISTS metric_name text;
ALTER TABLE desktop_workflow_metrics ADD COLUMN IF NOT EXISTS measured_at timestamptz;
ALTER TABLE desktop_workflow_metrics ADD COLUMN IF NOT EXISTS record jsonb;

CREATE INDEX IF NOT EXISTS idx_desktop_workflow_metrics_owner_measured
  ON desktop_workflow_metrics(owner_id, measured_at DESC);
