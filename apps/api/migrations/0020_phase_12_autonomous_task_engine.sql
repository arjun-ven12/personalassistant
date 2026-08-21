CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  status text NOT NULL,
  priority text NOT NULL,
  category text NOT NULL,
  deadline_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS tasks_owner_status_idx ON tasks(owner_id, status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_owner_deadline_idx ON tasks(owner_id, deadline_at) WHERE deadline_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS task_runs (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  status text NOT NULL,
  command_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS task_runs_owner_task_idx ON task_runs(owner_id, task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS task_schedules (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind text NOT NULL,
  timezone text NOT NULL,
  next_run_at timestamptz,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS task_schedules_owner_next_idx ON task_schedules(owner_id, next_run_at);

CREATE TABLE IF NOT EXISTS task_conditions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  logic text NOT NULL,
  field text NOT NULL,
  operator text NOT NULL,
  enabled boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind text NOT NULL,
  optional boolean NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS task_dependencies_owner_task_idx ON task_dependencies(owner_id, task_id);

CREATE TABLE IF NOT EXISTS task_triggers (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type text NOT NULL,
  source text NOT NULL,
  enabled boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS task_triggers_owner_type_idx ON task_triggers(owner_id, type, enabled);

CREATE TABLE IF NOT EXISTS task_notifications (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  channel text NOT NULL,
  status text NOT NULL,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS task_notifications_owner_status_idx
  ON task_notifications(owner_id, status, scheduled_for);

CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  status text NOT NULL,
  priority text NOT NULL,
  completion_percent integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (completion_percent >= 0 AND completion_percent <= 100)
);

CREATE TABLE IF NOT EXISTS task_goal_progress (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS checklists (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  category text NOT NULL,
  reusable boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  checklist_id uuid NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS routines (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  mode text NOT NULL,
  enabled boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS routine_steps (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  routine_id uuid NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS background_monitors (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  monitor_type text NOT NULL,
  status text NOT NULL,
  last_checked_at timestamptz,
  next_check_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS task_metrics (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  value numeric NOT NULL,
  trend numeric NOT NULL,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (trend >= -1 AND trend <= 1)
);

CREATE TABLE IF NOT EXISTS task_suggestions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  confidence numeric NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (confidence >= 0 AND confidence <= 1)
);
