-- Phase 25.5 adds shared, owner-scoped observability projections. These records
-- are evidence only: they grant no execution, company, or data authority.

CREATE TABLE IF NOT EXISTS owner_system_telemetry_spans (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid,
  trace_id text NOT NULL,
  span_id text NOT NULL,
  parent_span_id text,
  service text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL CHECK (status IN ('OK','ERROR')),
  error_source text,
  objective_id uuid,
  workflow_id uuid,
  task_id uuid,
  assignment_id uuid,
  provider text,
  model text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id,trace_id,span_id),
  FOREIGN KEY(owner_id,company_id) REFERENCES companies(owner_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS owner_system_spans_owner_time_idx ON owner_system_telemetry_spans(owner_id,started_at DESC);
CREATE INDEX IF NOT EXISTS owner_system_spans_company_time_idx ON owner_system_telemetry_spans(owner_id,company_id,started_at DESC);
CREATE INDEX IF NOT EXISTS owner_system_spans_trace_idx ON owner_system_telemetry_spans(owner_id,trace_id,started_at);
CREATE INDEX IF NOT EXISTS owner_system_spans_correlation_idx ON owner_system_telemetry_spans(owner_id,company_id,objective_id,workflow_id,task_id,assignment_id);
CREATE INDEX IF NOT EXISTS owner_system_spans_expiry_idx ON owner_system_telemetry_spans(expires_at);

CREATE TABLE IF NOT EXISTS owner_ai_observability_traces (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL,
  trace_id text NOT NULL,
  assignment_id uuid,
  objective_id uuid,
  workflow_id uuid,
  task_id uuid,
  provider text NOT NULL,
  model text NOT NULL,
  task_class text NOT NULL,
  prompt_version text,
  policy_version text,
  success boolean NOT NULL,
  cost_credits numeric(20,6) NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id,company_id,id),
  FOREIGN KEY(owner_id,company_id) REFERENCES companies(owner_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS owner_ai_traces_owner_time_idx ON owner_ai_observability_traces(owner_id,started_at DESC);
CREATE INDEX IF NOT EXISTS owner_ai_traces_company_time_idx ON owner_ai_observability_traces(owner_id,company_id,started_at DESC);
CREATE INDEX IF NOT EXISTS owner_ai_traces_trace_idx ON owner_ai_observability_traces(owner_id,trace_id);
CREATE INDEX IF NOT EXISTS owner_ai_traces_model_idx ON owner_ai_observability_traces(owner_id,company_id,provider,model,task_class,started_at DESC);
CREATE INDEX IF NOT EXISTS owner_ai_traces_correlation_idx ON owner_ai_observability_traces(owner_id,company_id,objective_id,workflow_id,task_id,assignment_id);
CREATE INDEX IF NOT EXISTS owner_ai_traces_expiry_idx ON owner_ai_observability_traces(expires_at);

CREATE TABLE IF NOT EXISTS owner_portfolio_alert_states (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  signal_id text NOT NULL,
  company_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('ACKNOWLEDGED','SNOOZED')),
  snoozed_until timestamptz,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id,signal_id),
  FOREIGN KEY(owner_id,company_id) REFERENCES companies(owner_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS owner_portfolio_alert_company_idx ON owner_portfolio_alert_states(owner_id,company_id,updated_at DESC);
