CREATE TABLE integrations (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  provider text NOT NULL,
  category text NOT NULL,
  status text NOT NULL,
  installed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id),
  CHECK (length(id) BETWEEN 3 AND 120),
  CHECK (provider IN ('github','jira','slack','notion','vscode','github_actions','vercel')),
  CHECK (category IN ('git_provider','issue_tracker','communication','documentation','ide','ci_cd','deployment')),
  CHECK (status IN ('available','installed','auth_required','ready','disabled','unhealthy'))
);

CREATE INDEX integrations_owner_status_idx ON integrations(owner_id, status);

CREATE TABLE integration_credentials (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  integration_id text NOT NULL,
  credential_kind text NOT NULL,
  status text NOT NULL,
  encrypted_reference text,
  created_at timestamptz NOT NULL,
  rotated_at timestamptz,
  expires_at timestamptz,
  record jsonb NOT NULL,
  FOREIGN KEY(owner_id, integration_id) REFERENCES integrations(owner_id, id) ON DELETE CASCADE,
  CHECK (credential_kind IN ('oauth','pat','service_account','oidc','device_flow','local_app')),
  CHECK (status IN ('missing','configured','expired','revoked')),
  CHECK (encrypted_reference IS NULL OR length(encrypted_reference) <= 500)
);

CREATE INDEX integration_credentials_owner_idx
  ON integration_credentials(owner_id, integration_id, status);

CREATE TABLE integration_capabilities (
  integration_id text NOT NULL,
  capability_id text NOT NULL,
  category text NOT NULL,
  risk text NOT NULL,
  approval_required boolean NOT NULL,
  destructive boolean NOT NULL,
  enabled boolean NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(integration_id, capability_id),
  CHECK (risk IN ('low','medium','high'))
);

CREATE TABLE integration_permissions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  integration_id text NOT NULL,
  capability_id text NOT NULL,
  state text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, integration_id, capability_id),
  FOREIGN KEY(owner_id, integration_id) REFERENCES integrations(owner_id, id) ON DELETE CASCADE,
  CHECK (state IN ('granted','revoked','denied'))
);

CREATE INDEX integration_permissions_owner_state_idx
  ON integration_permissions(owner_id, state);

CREATE TABLE integration_health (
  integration_id text PRIMARY KEY,
  state text NOT NULL,
  checked_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (state IN ('unknown','healthy','degraded','unhealthy'))
);

CREATE TABLE integration_usage (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  integration_id text NOT NULL,
  operation_count integer NOT NULL DEFAULT 0,
  denied_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  last_operation_at timestamptz,
  PRIMARY KEY(owner_id, integration_id),
  FOREIGN KEY(owner_id, integration_id) REFERENCES integrations(owner_id, id) ON DELETE CASCADE,
  CHECK (operation_count >= 0),
  CHECK (denied_count >= 0),
  CHECK (failure_count >= 0)
);

CREATE TABLE integration_events (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  integration_id text NOT NULL,
  capability_id text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL,
  requested_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  FOREIGN KEY(owner_id, integration_id) REFERENCES integrations(owner_id, id) ON DELETE CASCADE,
  CHECK (status IN ('REQUESTED','WAITING_APPROVAL','APPROVED','DENIED','COMPLETED','FAILED','CANCELLED'))
);

CREATE INDEX integration_events_owner_requested_idx
  ON integration_events(owner_id, requested_at DESC);

CREATE VIEW integration_audit AS
  SELECT id, owner_id, integration_id, capability_id, operation, status, requested_at, record
  FROM integration_events;
