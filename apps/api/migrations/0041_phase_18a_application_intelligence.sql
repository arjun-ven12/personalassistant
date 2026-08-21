CREATE TABLE IF NOT EXISTS application_domains (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  domain text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_application_domains_owner_domain
  ON application_domains(owner_id, domain);

CREATE TABLE IF NOT EXISTS semantic_application_capabilities (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  capability_id text NOT NULL,
  domain text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_semantic_application_capabilities_owner_capability
  ON semantic_application_capabilities(owner_id, capability_id);
CREATE INDEX IF NOT EXISTS idx_semantic_application_capabilities_owner_domain
  ON semantic_application_capabilities(owner_id, domain);

CREATE TABLE IF NOT EXISTS semantic_provider_capabilities (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  provider_id text NOT NULL,
  capability_id text NOT NULL,
  domain text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_semantic_provider_capabilities_owner_unique
  ON semantic_provider_capabilities(owner_id, application_id, provider_id, capability_id);
CREATE INDEX IF NOT EXISTS idx_semantic_provider_capabilities_owner_capability
  ON semantic_provider_capabilities(owner_id, capability_id);
CREATE INDEX IF NOT EXISTS idx_semantic_provider_capabilities_owner_app
  ON semantic_provider_capabilities(owner_id, application_id);

CREATE TABLE IF NOT EXISTS application_sessions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  provider_id text NULL,
  domain text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_application_sessions_owner_updated
  ON application_sessions(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_sessions_owner_app
  ON application_sessions(owner_id, application_id);

CREATE TABLE IF NOT EXISTS application_memory (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  provider_id text NULL,
  domain text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_application_memory_owner_domain
  ON application_memory(owner_id, domain);
CREATE INDEX IF NOT EXISTS idx_application_memory_owner_app
  ON application_memory(owner_id, application_id);

CREATE TABLE IF NOT EXISTS provider_selection_history (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  capability_id text NOT NULL,
  domain text NOT NULL,
  selected_application_id text NULL,
  selected_provider_id text NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_provider_selection_history_owner_created
  ON provider_selection_history(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_selection_history_owner_capability
  ON provider_selection_history(owner_id, capability_id);

CREATE TABLE IF NOT EXISTS cross_application_workflows (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_cross_application_workflows_owner_updated
  ON cross_application_workflows(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS application_semantic_objects (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  object_type text NOT NULL,
  application_id text NOT NULL,
  provider_id text NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_application_semantic_objects_owner_type
  ON application_semantic_objects(owner_id, object_type);
CREATE INDEX IF NOT EXISTS idx_application_semantic_objects_owner_app
  ON application_semantic_objects(owner_id, application_id);
