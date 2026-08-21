CREATE TABLE IF NOT EXISTS ai_pricing_versions (
  id UUID PRIMARY KEY,
  provider_key TEXT NOT NULL,
  model_key TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  input_per_million_tokens NUMERIC(20,8),
  cached_input_per_million_tokens NUMERIC(20,8),
  output_per_million_tokens NUMERIC(20,8),
  request_fee NUMERIC(20,8),
  version TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,
  source TEXT,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'HISTORICAL', 'UNKNOWN')),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (provider_key, model_key, version)
);

CREATE TABLE IF NOT EXISTS ai_budget_policies (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  scope_id TEXT,
  period TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  limit_usd NUMERIC(20,8) NOT NULL CHECK (limit_usd >= 0),
  warning_threshold_pct NUMERIC(5,2) NOT NULL,
  throttle_threshold_pct NUMERIC(5,2),
  hard_stop_threshold_pct NUMERIC(5,2) NOT NULL,
  overflow_behavior TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_budget_policies_owner_scope_idx ON ai_budget_policies(owner_id, scope, scope_id);

CREATE TABLE IF NOT EXISTS ai_budget_reservations (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  amount_usd NUMERIC(20,8) NOT NULL CHECK (amount_usd >= 0),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SETTLED', 'RELEASED', 'EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  settled_amount_usd NUMERIC(20,8),
  UNIQUE (owner_id, request_id)
);

CREATE INDEX IF NOT EXISTS ai_budget_reservations_owner_status_idx ON ai_budget_reservations(owner_id, status, expires_at);

CREATE TABLE IF NOT EXISTS ai_usage_ledger (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  route_id UUID,
  attempt_id UUID,
  reservation_id UUID REFERENCES ai_budget_reservations(id) ON DELETE SET NULL,
  provider_key TEXT NOT NULL,
  model_key TEXT NOT NULL,
  agent_id UUID,
  department_id TEXT,
  workflow_id UUID,
  workflow_run_id UUID,
  task_id UUID,
  conversation_id UUID,
  purpose TEXT NOT NULL,
  locality TEXT NOT NULL CHECK (locality IN ('LOCAL', 'CLOUD')),
  input_tokens INTEGER,
  cached_input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  total_tokens INTEGER,
  usage_source TEXT NOT NULL,
  estimated_cost_usd NUMERIC(20,8),
  actual_cost_usd NUMERIC(20,8),
  pricing_version TEXT,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (request_id, provider_key, model_key)
);

CREATE INDEX IF NOT EXISTS ai_usage_ledger_owner_time_idx ON ai_usage_ledger(owner_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_ledger_provider_time_idx ON ai_usage_ledger(owner_id, provider_key, completed_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_ledger_agent_time_idx ON ai_usage_ledger(owner_id, agent_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_ledger_workflow_time_idx ON ai_usage_ledger(owner_id, workflow_id, completed_at DESC);
