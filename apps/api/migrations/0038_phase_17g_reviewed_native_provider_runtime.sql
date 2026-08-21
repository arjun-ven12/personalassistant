CREATE TABLE IF NOT EXISTS native_providers (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  provider_type text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_native_providers_owner_updated
  ON native_providers(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS provider_capabilities (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  capability text NOT NULL,
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_provider_capabilities_owner_provider
  ON provider_capabilities(owner_id, provider_id);

CREATE TABLE IF NOT EXISTS provider_health (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  status text NOT NULL,
  health_score double precision NOT NULL,
  checked_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

ALTER TABLE provider_health
  ADD COLUMN IF NOT EXISTS health_score double precision NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_provider_health_owner_checked
  ON provider_health(owner_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS provider_validation (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  status text NOT NULL,
  validated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_provider_validation_owner_validated
  ON provider_validation(owner_id, validated_at DESC);

CREATE TABLE IF NOT EXISTS provider_versions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  version text NOT NULL,
  recorded_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_provider_versions_owner_recorded
  ON provider_versions(owner_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS provider_permissions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  permission text NOT NULL,
  granted boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_provider_permissions_owner_provider
  ON provider_permissions(owner_id, provider_id);

CREATE TABLE IF NOT EXISTS provider_execution (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  capability text NOT NULL,
  status text NOT NULL,
  requested_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_provider_execution_owner_requested
  ON provider_execution(owner_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS provider_metrics (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  metric_name text NOT NULL,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

ALTER TABLE provider_metrics
  ADD COLUMN IF NOT EXISTS measured_at timestamptz;

UPDATE provider_metrics
SET measured_at = NOW()
WHERE measured_at IS NULL;

ALTER TABLE provider_metrics
  ALTER COLUMN measured_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_metrics_owner_measured
  ON provider_metrics(owner_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS provider_diagnostics (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  severity text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_provider_diagnostics_owner_created
  ON provider_diagnostics(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS approved_terminal_commands (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name text NOT NULL,
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_approved_terminal_commands_owner_updated
  ON approved_terminal_commands(owner_id, updated_at DESC);
