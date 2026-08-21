ALTER TABLE ai_budget_policies
  ADD COLUMN IF NOT EXISTS max_calls_per_minute INTEGER CHECK (max_calls_per_minute > 0),
  ADD COLUMN IF NOT EXISTS max_calls_per_run INTEGER CHECK (max_calls_per_run > 0),
  ADD COLUMN IF NOT EXISTS max_cloud_calls_per_run INTEGER CHECK (max_cloud_calls_per_run > 0);

ALTER TABLE ai_budget_reservations
  ADD COLUMN IF NOT EXISTS route_id UUID,
  ADD COLUMN IF NOT EXISTS attempt_id UUID,
  ADD COLUMN IF NOT EXISTS provider_key TEXT,
  ADD COLUMN IF NOT EXISTS model_key TEXT,
  ADD COLUMN IF NOT EXISTS pricing_version TEXT,
  ADD COLUMN IF NOT EXISTS policy_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS context_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE ai_budget_reservations
  DROP CONSTRAINT IF EXISTS ai_budget_reservations_owner_id_request_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS ai_budget_reservations_owner_request_attempt_uidx
  ON ai_budget_reservations(owner_id, request_id, attempt_id)
  WHERE attempt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_budget_reservations_policy_ids_idx
  ON ai_budget_reservations USING GIN(policy_ids);

ALTER TABLE ai_usage_ledger
  ADD COLUMN IF NOT EXISTS cost_center TEXT;

ALTER TABLE ai_usage_ledger
  DROP CONSTRAINT IF EXISTS ai_usage_ledger_request_id_provider_key_model_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_ledger_owner_request_attempt_uidx
  ON ai_usage_ledger(owner_id, request_id, attempt_id)
  WHERE attempt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_usage_ledger_owner_cost_center_time_idx
  ON ai_usage_ledger(owner_id, cost_center, completed_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_ledger_request_idx
  ON ai_usage_ledger(owner_id, request_id);

CREATE TABLE IF NOT EXISTS ai_budget_override_grants (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  approval_id UUID NOT NULL,
  request_id UUID,
  workflow_run_id UUID,
  scope TEXT NOT NULL,
  scope_id TEXT,
  max_additional_spend_usd NUMERIC(20,8) NOT NULL CHECK (max_additional_spend_usd >= 0),
  used_amount_usd NUMERIC(20,8) NOT NULL DEFAULT 0 CHECK (used_amount_usd >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CONSUMED', 'EXPIRED', 'REVOKED')),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(owner_id, approval_id)
);

CREATE INDEX IF NOT EXISTS ai_budget_override_owner_status_idx
  ON ai_budget_override_grants(owner_id, status, expires_at);

CREATE TABLE IF NOT EXISTS ai_economic_anomalies (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  request_id UUID,
  attempt_id UUID,
  anomaly_type TEXT NOT NULL CHECK (anomaly_type IN (
    'UNUSUAL_REQUEST_RATE', 'UNUSUAL_COST_SPIKE', 'UNUSUAL_TOKEN_VOLUME',
    'RETRY_STORM', 'OVER_RESERVATION'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('WARNING', 'CRITICAL')),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_economic_anomalies_owner_time_idx
  ON ai_economic_anomalies(owner_id, created_at DESC);
