CREATE TABLE IF NOT EXISTS execution_profiles (
  id text PRIMARY KEY,
  label text NOT NULL,
  category text NOT NULL,
  command_display text NOT NULL,
  timeout_ms integer NOT NULL CHECK (timeout_ms > 0),
  network text NOT NULL CHECK (network = 'disabled'),
  immutable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS validation_runs (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  patch_id uuid NULL REFERENCES patches(id) ON DELETE SET NULL,
  status text NOT NULL,
  classification text NULL,
  execution_request_id uuid NULL REFERENCES execution_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS validation_runs_owner_created_idx
  ON validation_runs(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS validation_runs_execution_request_idx
  ON validation_runs(execution_request_id)
  WHERE execution_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS validation_steps (
  id uuid PRIMARY KEY,
  validation_run_id uuid NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
  profile_id text NOT NULL,
  status text NOT NULL,
  classification text NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS validation_steps_run_idx
  ON validation_steps(validation_run_id);

CREATE TABLE IF NOT EXISTS execution_logs (
  id uuid PRIMARY KEY,
  validation_run_id uuid NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
  step_id uuid NULL,
  stream text NOT NULL CHECK (stream IN ('stdout','stderr')),
  truncated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  content text NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_artifacts (
  id uuid PRIMARY KEY,
  validation_run_id uuid NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
  artifact_type text NOT NULL,
  name text NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS validation_results (
  validation_run_id uuid PRIMARY KEY REFERENCES validation_runs(id) ON DELETE CASCADE,
  classification text NOT NULL,
  summary text NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coverage_reports (
  id uuid PRIMARY KEY,
  validation_run_id uuid NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
  summary jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resource_usage (
  id uuid PRIMARY KEY,
  validation_run_id uuid NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
  duration_ms integer NOT NULL DEFAULT 0,
  cpu_user_ms integer NULL,
  cpu_system_ms integer NULL,
  max_rss_bytes bigint NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS execution_metrics (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  metric_value numeric NOT NULL,
  dimensions jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
