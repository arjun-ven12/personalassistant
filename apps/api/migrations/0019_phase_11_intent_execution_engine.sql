CREATE TABLE commands (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  source text NOT NULL,
  status text NOT NULL,
  safety_level text NOT NULL,
  approval_required boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX commands_owner_status_idx ON commands(owner_id, status, created_at DESC);

CREATE TABLE intent_analysis (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  command_id uuid,
  category text NOT NULL,
  confidence numeric NOT NULL,
  clarification_needed boolean NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX intent_analysis_owner_category_idx
  ON intent_analysis(owner_id, category, created_at DESC);

CREATE TABLE execution_plans (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  command_id uuid NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX execution_plans_owner_command_idx
  ON execution_plans(owner_id, command_id, created_at DESC);

CREATE TABLE execution_steps (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL,
  command_id uuid NOT NULL,
  sequence integer NOT NULL,
  status text NOT NULL,
  approval_required boolean NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX execution_steps_owner_plan_idx
  ON execution_steps(owner_id, plan_id, sequence);

CREATE TABLE command_history (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  command_id uuid NOT NULL,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX command_history_owner_idx ON command_history(owner_id, created_at DESC);

CREATE TABLE macros (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  mode text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE saved_commands (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  pinned boolean NOT NULL,
  favorite boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE clarification_sessions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  command_id uuid NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE command_templates (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  category text NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE command_metrics (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  value numeric NOT NULL,
  trend numeric NOT NULL,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (trend >= -1 AND trend <= 1)
);

CREATE TABLE command_suggestions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  confidence numeric NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (confidence >= 0 AND confidence <= 1)
);
