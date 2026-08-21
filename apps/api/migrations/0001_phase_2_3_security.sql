CREATE TABLE schema_migrations (
  version varchar(100) PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE owners (
  id uuid PRIMARY KEY,
  email varchar(320) NOT NULL,
  password_hash varchar(500) NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT owners_email_lower_unique UNIQUE (email)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  token_hash varchar(128) NOT NULL UNIQUE,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX sessions_owner_active_idx ON sessions(owner_id, revoked_at, absolute_expires_at);

CREATE TABLE pairing_intents (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  code_hash varchar(128) NOT NULL UNIQUE,
  record jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX pairing_intents_expiry_idx ON pairing_intents(expires_at);

CREATE TABLE devices (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  pairing_polling_token_hash varchar(128) NOT NULL UNIQUE,
  fingerprint varchar(200) NOT NULL,
  trust_status varchar(20) NOT NULL CHECK (trust_status IN ('PENDING', 'TRUSTED', 'REVOKED')),
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT devices_owner_fingerprint_unique UNIQUE (owner_id, fingerprint)
);
CREATE INDEX devices_owner_trust_idx ON devices(owner_id, trust_status);

CREATE TABLE used_nonces (
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  nonce varchar(200) NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (device_id, nonce)
);
CREATE INDEX used_nonces_expiry_idx ON used_nonces(expires_at);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  owner_id uuid REFERENCES owners(id) ON DELETE RESTRICT,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  event_type varchar(100) NOT NULL,
  outcome varchar(20) NOT NULL,
  request_id varchar(100) NOT NULL,
  occurred_at timestamptz NOT NULL,
  record jsonb NOT NULL
);
CREATE INDEX audit_events_owner_time_idx ON audit_events(owner_id, occurred_at DESC);
CREATE INDEX audit_events_request_idx ON audit_events(request_id);

CREATE TABLE applications (
  id varchar(100) PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX applications_owner_enabled_idx ON applications(owner_id, enabled);

CREATE TABLE workspaces (
  id varchar(100) PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX workspaces_owner_enabled_idx ON workspaces(owner_id, enabled);

CREATE TABLE tool_registry (
  name varchar(100) PRIMARY KEY,
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE approval_requests (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  action_digest varchar(128) NOT NULL,
  status varchar(20) NOT NULL CHECK (
    status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'CONSUMED')
  ),
  record jsonb NOT NULL,
  requested_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX approvals_owner_status_idx ON approval_requests(owner_id, status, requested_at DESC);
CREATE UNIQUE INDEX approvals_one_pending_digest_idx
  ON approval_requests(owner_id, action_digest) WHERE status = 'PENDING';

CREATE TABLE policy_evaluations (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  decision varchar(20) NOT NULL,
  evaluated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);
CREATE INDEX policy_evaluations_owner_time_idx
  ON policy_evaluations(owner_id, evaluated_at DESC);

CREATE TABLE security_state (
  id varchar(30) PRIMARY KEY CHECK (id = 'global'),
  emergency_stop_active boolean NOT NULL DEFAULT true,
  privileged_execution_available boolean NOT NULL DEFAULT false
    CHECK (privileged_execution_available = false),
  updated_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1
);
INSERT INTO security_state (
  id, emergency_stop_active, privileged_execution_available, updated_at
) VALUES ('global', true, false, now());

CREATE TABLE csrf_tokens (
  session_id uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  token_hash varchar(128) NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX csrf_tokens_expiry_idx ON csrf_tokens(expires_at);

CREATE TABLE recent_auth_challenges (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  token_hash varchar(128) NOT NULL,
  purpose varchar(80) NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX recent_auth_challenges_expiry_idx ON recent_auth_challenges(expires_at);

CREATE TABLE recent_auth_grants (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  purpose varchar(80) NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX recent_auth_grants_session_purpose_idx
  ON recent_auth_grants(session_id, purpose, expires_at);

CREATE TABLE recovery_codes (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  code_hash varchar(500) NOT NULL,
  generated_at timestamptz NOT NULL,
  consumed_at timestamptz,
  invalidated_at timestamptz
);
CREATE INDEX recovery_codes_owner_active_idx
  ON recovery_codes(owner_id, consumed_at, invalidated_at);
