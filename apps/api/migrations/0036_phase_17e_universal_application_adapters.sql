CREATE TABLE IF NOT EXISTS trusted_applications (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  stable_identifier text NOT NULL,
  bundle_identifier text NOT NULL,
  status text NOT NULL,
  trust_level text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_trusted_applications_owner_updated
  ON trusted_applications(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_trusted_applications_owner_bundle
  ON trusted_applications(owner_id, bundle_identifier);

CREATE TABLE IF NOT EXISTS application_profiles (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_application_profiles_owner_app
  ON application_profiles(owner_id, application_id);

CREATE TABLE IF NOT EXISTS application_capabilities (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  capability text NOT NULL,
  source text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_application_capabilities_owner_app
  ON application_capabilities(owner_id, application_id);
CREATE INDEX IF NOT EXISTS idx_application_capabilities_owner_capability
  ON application_capabilities(owner_id, capability);

CREATE TABLE IF NOT EXISTS adapter_instances (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  adapter_type text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_adapter_instances_owner_app
  ON adapter_instances(owner_id, application_id);

CREATE TABLE IF NOT EXISTS adapter_plugins (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_adapter_plugins_owner_app
  ON adapter_plugins(owner_id, application_id);

CREATE TABLE IF NOT EXISTS application_permissions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  permission text NOT NULL,
  granted boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_application_permissions_owner_app
  ON application_permissions(owner_id, application_id);

CREATE TABLE IF NOT EXISTS application_context (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  current_application_id text NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_application_context_owner_updated
  ON application_context(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS application_events (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_application_events_owner_occurred
  ON application_events(owner_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_events_owner_app
  ON application_events(owner_id, application_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS adapter_metrics (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  metric_name text NOT NULL,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

ALTER TABLE adapter_metrics ADD COLUMN IF NOT EXISTS application_id text;
ALTER TABLE adapter_metrics ADD COLUMN IF NOT EXISTS metric_name text;
ALTER TABLE adapter_metrics ADD COLUMN IF NOT EXISTS measured_at timestamptz;
ALTER TABLE adapter_metrics ADD COLUMN IF NOT EXISTS record jsonb;

CREATE INDEX IF NOT EXISTS idx_adapter_metrics_owner_measured
  ON adapter_metrics(owner_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS adapter_versions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  adapter_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_adapter_versions_owner_recorded
  ON adapter_versions(owner_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS application_health (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  status text NOT NULL,
  checked_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_application_health_owner_checked
  ON application_health(owner_id, checked_at DESC);
