CREATE TABLE IF NOT EXISTS adapter_sdk_contracts (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  adapter_instance_id uuid NOT NULL,
  lifecycle_state text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_adapter_sdk_contracts_owner_instance
  ON adapter_sdk_contracts(owner_id, adapter_instance_id);
CREATE INDEX IF NOT EXISTS idx_adapter_sdk_contracts_owner_state
  ON adapter_sdk_contracts(owner_id, lifecycle_state, updated_at DESC);

CREATE TABLE IF NOT EXISTS adapter_lifecycle (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  adapter_instance_id uuid NOT NULL,
  to_state text NOT NULL,
  occurred_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_adapter_lifecycle_owner_instance
  ON adapter_lifecycle(owner_id, adapter_instance_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_adapter_lifecycle_owner_state
  ON adapter_lifecycle(owner_id, to_state, occurred_at DESC);

CREATE TABLE IF NOT EXISTS adapter_sandboxes (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  adapter_instance_id uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_adapter_sandboxes_owner_instance
  ON adapter_sandboxes(owner_id, adapter_instance_id);

CREATE TABLE IF NOT EXISTS adapter_dependencies (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  adapter_instance_id uuid NOT NULL,
  dependency_type text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_adapter_dependencies_owner_instance
  ON adapter_dependencies(owner_id, adapter_instance_id);
CREATE INDEX IF NOT EXISTS idx_adapter_dependencies_owner_type
  ON adapter_dependencies(owner_id, dependency_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS adapter_usage (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  adapter_instance_id uuid NOT NULL,
  operation text NOT NULL,
  recorded_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_adapter_usage_owner_instance
  ON adapter_usage(owner_id, adapter_instance_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_adapter_usage_owner_operation
  ON adapter_usage(owner_id, operation, recorded_at DESC);

CREATE TABLE IF NOT EXISTS adapter_compatibility (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  adapter_instance_id uuid NOT NULL,
  compatibility text NOT NULL,
  checked_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_adapter_compatibility_owner_instance
  ON adapter_compatibility(owner_id, adapter_instance_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_adapter_compatibility_owner_status
  ON adapter_compatibility(owner_id, compatibility, checked_at DESC);

CREATE TABLE IF NOT EXISTS adapter_domains (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  adapter_instance_id uuid NOT NULL,
  domain text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_adapter_domains_owner_domain
  ON adapter_domains(owner_id, domain, updated_at DESC);
