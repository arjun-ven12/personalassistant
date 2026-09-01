-- Shared durable execution substrate. Records are owner/company scoped and grant no authority.
CREATE TABLE IF NOT EXISTS cross_company_collaboration_policies (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL, status text NOT NULL, version integer NOT NULL,
  record jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  UNIQUE(owner_id,company_id),
  FOREIGN KEY(owner_id,company_id) REFERENCES companies(owner_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS cross_company_service_requests (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  source_company_id uuid NOT NULL, destination_company_id uuid NOT NULL,
  status text NOT NULL, trace_id text NOT NULL, approval_id uuid, deadline timestamptz,
  record jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  UNIQUE(owner_id,id),
  FOREIGN KEY(owner_id,source_company_id) REFERENCES companies(owner_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,destination_company_id) REFERENCES companies(owner_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS cross_company_services_source_idx ON cross_company_service_requests(owner_id,source_company_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS cross_company_services_destination_idx ON cross_company_service_requests(owner_id,destination_company_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS cross_company_services_trace_idx ON cross_company_service_requests(owner_id,trace_id);

CREATE TABLE IF NOT EXISTS durable_workflow_executions (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL, service_request_id uuid, deterministic_key text NOT NULL,
  status text NOT NULL, backend text NOT NULL, trace_id text NOT NULL, record jsonb NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, completed_at timestamptz,
  UNIQUE(owner_id,id), UNIQUE(owner_id,deterministic_key),
  FOREIGN KEY(owner_id,company_id) REFERENCES companies(owner_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,service_request_id) REFERENCES cross_company_service_requests(owner_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS durable_workflows_company_idx ON durable_workflow_executions(owner_id,company_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS durable_workflows_trace_idx ON durable_workflow_executions(owner_id,trace_id);

CREATE TABLE IF NOT EXISTS durable_workflow_events (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL, execution_id uuid NOT NULL,
  sequence integer NOT NULL, event_type text NOT NULL, record jsonb NOT NULL, created_at timestamptz NOT NULL,
  UNIQUE(owner_id,execution_id,sequence),
  FOREIGN KEY(owner_id,company_id) REFERENCES companies(owner_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,execution_id) REFERENCES durable_workflow_executions(owner_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS durable_events_replay_idx ON durable_workflow_events(owner_id,execution_id,sequence);

CREATE TABLE IF NOT EXISTS durable_activity_receipts (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL, execution_id uuid NOT NULL,
  idempotency_key text NOT NULL, status text NOT NULL, record jsonb NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  UNIQUE(owner_id,idempotency_key),
  FOREIGN KEY(owner_id,company_id) REFERENCES companies(owner_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,execution_id) REFERENCES durable_workflow_executions(owner_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS sandbox_execution_results (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL, assignment_id uuid NOT NULL, task_id uuid NOT NULL,
  status text NOT NULL, trace_id text NOT NULL, record jsonb NOT NULL, created_at timestamptz NOT NULL,
  FOREIGN KEY(owner_id,company_id) REFERENCES companies(owner_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS sandbox_results_scope_idx ON sandbox_execution_results(owner_id,company_id,created_at DESC);
