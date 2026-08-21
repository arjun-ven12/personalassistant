CREATE TABLE IF NOT EXISTS workflow_graphs (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  status text NOT NULL,
  template_id uuid,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS workflow_graphs_owner_updated_idx
  ON workflow_graphs(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS workflow_nodes (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  graph_id uuid NOT NULL,
  status text NOT NULL,
  adapter_id text,
  capability_id text,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS workflow_nodes_owner_graph_idx
  ON workflow_nodes(owner_id, graph_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS cross_application_workflow_templates (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  category text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS cross_application_workflow_templates_owner_updated_idx
  ON cross_application_workflow_templates(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS cross_application_workflow_variables (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  graph_id uuid NOT NULL,
  key text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS cross_application_workflow_variables_owner_graph_key_idx
  ON cross_application_workflow_variables(owner_id, graph_id, key);

CREATE TABLE IF NOT EXISTS workflow_execution_history (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  graph_id uuid NOT NULL,
  node_id uuid,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS workflow_execution_history_owner_graph_idx
  ON workflow_execution_history(owner_id, graph_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cross_application_workflow_metrics (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  graph_id uuid NOT NULL,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS cross_application_workflow_metrics_owner_graph_idx
  ON cross_application_workflow_metrics(owner_id, graph_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS cross_application_workflow_failures (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  graph_id uuid NOT NULL,
  node_id uuid,
  error_code text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS cross_application_workflow_failures_owner_graph_idx
  ON cross_application_workflow_failures(owner_id, graph_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cross_application_workflow_recovery (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  graph_id uuid NOT NULL,
  node_id uuid,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS cross_application_workflow_recovery_owner_graph_idx
  ON cross_application_workflow_recovery(owner_id, graph_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cross_application_workflow_checkpoints (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  graph_id uuid NOT NULL,
  node_id uuid NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS cross_application_workflow_checkpoints_owner_graph_idx
  ON cross_application_workflow_checkpoints(owner_id, graph_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cross_application_workflow_context (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  graph_id uuid NOT NULL,
  current_node_id uuid,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS cross_application_workflow_context_owner_graph_idx
  ON cross_application_workflow_context(owner_id, graph_id, updated_at DESC);
