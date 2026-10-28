-- Secure Reader has its own identity and authorization boundary in the shared
-- Neon database. This migration only creates new objects; it does not adopt
-- Athena owners, sessions, companies, or documents as Reader principals.
-- A pre-existing secure_reader schema is an operator-review condition.
CREATE SCHEMA secure_reader;

CREATE TABLE secure_reader.users (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN','READER')),
  enabled boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE secure_reader.challenges (
  hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES secure_reader.users(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE TABLE secure_reader.sessions (
  id uuid PRIMARY KEY,
  token_hash text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES secure_reader.users(id),
  device_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE TABLE secure_reader.documents (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  sector text NOT NULL CHECK (sector IN ('institutional','engineering','brand','quantum','intelligence','clients','founder')),
  classification text NOT NULL,
  object_key text UNIQUE NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  page_count integer NOT NULL CHECK (page_count BETWEEN 1 AND 100),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  removed_at timestamptz,
  watermark jsonb NOT NULL DEFAULT '{"opacity":0.18,"placement":"diagonal","fontSize":18}'
);
CREATE TABLE secure_reader.grants (
  user_id uuid NOT NULL REFERENCES secure_reader.users(id),
  document_id uuid NOT NULL REFERENCES secure_reader.documents(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (user_id,document_id)
);
CREATE TABLE secure_reader.page_tickets (
  hash text PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES secure_reader.sessions(id),
  user_id uuid NOT NULL REFERENCES secure_reader.users(id),
  document_id uuid NOT NULL REFERENCES secure_reader.documents(id),
  page integer NOT NULL CHECK (page BETWEEN 1 AND 100),
  version integer NOT NULL,
  grant_version integer NOT NULL DEFAULT 1,
  admin_preview boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE TABLE secure_reader.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  session_id uuid,
  event text NOT NULL,
  resource_id uuid,
  outcome text NOT NULL CHECK (outcome IN ('ALLOW','DENY')),
  subject_id uuid
);
CREATE TABLE secure_reader.rate_buckets (
  key text PRIMARY KEY,
  window_at bigint NOT NULL,
  count integer NOT NULL
);
CREATE TABLE secure_reader.document_versions (
  document_id uuid NOT NULL REFERENCES secure_reader.documents(id),
  version integer NOT NULL CHECK (version > 0),
  object_key text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  page_count integer NOT NULL CHECK (page_count BETWEEN 1 AND 100),
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id,version)
);
CREATE INDEX secure_reader_tickets_expiry ON secure_reader.page_tickets(expires_at);
CREATE INDEX secure_reader_audit_recent ON secure_reader.audit_events(at DESC);
