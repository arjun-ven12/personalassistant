CREATE TABLE IF NOT EXISTS workflows (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS workflows_owner_created_idx
  ON workflows(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflows_status_idx
  ON workflows(status);

CREATE TABLE IF NOT EXISTS workflow_tasks (
  id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS workflow_tasks_workflow_idx
  ON workflow_tasks(workflow_id, created_at ASC);

CREATE INDEX IF NOT EXISTS workflow_tasks_status_idx
  ON workflow_tasks(status);

CREATE TABLE IF NOT EXISTS workflow_dependencies (
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES workflow_tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES workflow_tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (workflow_id, task_id, depends_on_task_id)
);

CREATE TABLE IF NOT EXISTS workflow_checkpoints (
  id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  task_id uuid NULL REFERENCES workflow_tasks(id) ON DELETE SET NULL,
  kind text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS workflow_checkpoints_workflow_idx
  ON workflow_checkpoints(workflow_id, created_at ASC);

CREATE TABLE IF NOT EXISTS workflow_events (
  id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  task_id uuid NULL REFERENCES workflow_tasks(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS workflow_events_workflow_created_idx
  ON workflow_events(workflow_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_progress (
  workflow_id uuid PRIMARY KEY REFERENCES workflows(id) ON DELETE CASCADE,
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_reports (
  workflow_id uuid PRIMARY KEY REFERENCES workflows(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_metrics (
  id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  metric_value numeric NOT NULL,
  dimensions jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_history (
  id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_artifacts (
  id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  task_id uuid NULL REFERENCES workflow_tasks(id) ON DELETE SET NULL,
  artifact_type text NOT NULL,
  artifact_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL
);
