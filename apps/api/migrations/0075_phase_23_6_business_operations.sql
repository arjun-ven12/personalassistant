ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_provider_check;
ALTER TABLE integrations ADD CONSTRAINT integrations_provider_check
  CHECK (provider IN ('github','jira','slack','notion','vscode','github_actions','vercel','gmail','crm','analytics'));
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_category_check;
ALTER TABLE integrations ADD CONSTRAINT integrations_category_check
  CHECK (category IN ('git_provider','issue_tracker','communication','documentation','ide','ci_cd','deployment','crm','analytics'));

CREATE TABLE business_execution_records (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  integration_id text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL,
  requested_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, integration_id, idempotency_key),
  FOREIGN KEY(owner_id, integration_id) REFERENCES integrations(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX business_execution_owner_idx ON business_execution_records(owner_id, requested_at DESC);

CREATE TABLE business_external_events (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  integration_id text NOT NULL,
  external_event_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, integration_id, external_event_id),
  FOREIGN KEY(owner_id, integration_id) REFERENCES integrations(owner_id, id) ON DELETE CASCADE
);
CREATE INDEX business_external_event_owner_idx ON business_external_events(owner_id, occurred_at DESC);

CREATE TABLE external_metric_observations (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  objective_id uuid,
  experiment_id uuid,
  metric_id text NOT NULL,
  observed_at timestamptz NOT NULL,
  record jsonb NOT NULL
);
CREATE INDEX external_metric_owner_idx ON external_metric_observations(owner_id, observed_at DESC);

CREATE TABLE outcome_attributions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  objective_id uuid,
  experiment_id uuid,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);
CREATE INDEX outcome_attribution_owner_idx ON outcome_attributions(owner_id, created_at DESC);

CREATE TABLE business_entity_mappings (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  integration_id text NOT NULL,
  entity_type text NOT NULL,
  external_id text NOT NULL,
  internal_entity_id text NOT NULL,
  last_synced_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, integration_id, entity_type, external_id),
  UNIQUE(owner_id, integration_id, entity_type, internal_entity_id),
  FOREIGN KEY(owner_id, integration_id) REFERENCES integrations(owner_id, id) ON DELETE CASCADE
);

CREATE TABLE integration_sync_checkpoints (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  integration_id text NOT NULL,
  stream text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, integration_id, stream),
  FOREIGN KEY(owner_id, integration_id) REFERENCES integrations(owner_id, id) ON DELETE CASCADE
);
