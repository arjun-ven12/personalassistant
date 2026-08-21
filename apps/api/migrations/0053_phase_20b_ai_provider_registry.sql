CREATE TABLE IF NOT EXISTS ai_providers (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('LOCAL', 'CLOUD', 'HYBRID', 'ENTERPRISE')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  configuration_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (owner_id, provider_key)
);

CREATE TABLE IF NOT EXISTS ai_models (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
  model_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  family TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  capabilities_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_window INTEGER,
  max_output_tokens INTEGER,
  locality TEXT NOT NULL CHECK (locality IN ('LOCAL', 'REMOTE')),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (owner_id, provider_id, model_key)
);

CREATE TABLE IF NOT EXISTS ai_model_roles (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  provider_id UUID NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (owner_id, role)
);

CREATE TABLE IF NOT EXISTS ai_provider_health_events (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  error_category TEXT,
  models_visible INTEGER NOT NULL DEFAULT 0,
  checked_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_runtime_events (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  provider_key TEXT NOT NULL,
  model_key TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  error_category TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_models_owner_provider_idx ON ai_models(owner_id, provider_id);
CREATE INDEX IF NOT EXISTS ai_model_roles_owner_role_idx ON ai_model_roles(owner_id, role);
CREATE INDEX IF NOT EXISTS ai_runtime_events_owner_created_idx ON ai_runtime_events(owner_id, created_at DESC);
