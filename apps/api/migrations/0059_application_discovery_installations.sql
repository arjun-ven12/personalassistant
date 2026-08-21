CREATE TABLE IF NOT EXISTS application_installations (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  application_id varchar(100) NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  bundle_identifier text NOT NULL,
  bundle_path text NOT NULL,
  installed boolean NOT NULL,
  last_seen_at timestamptz NOT NULL,
  unavailable_since timestamptz NULL,
  source text NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, device_id, application_id)
);

CREATE INDEX IF NOT EXISTS idx_application_installations_owner_device
  ON application_installations(owner_id, device_id, installed);

CREATE INDEX IF NOT EXISTS idx_application_installations_owner_bundle
  ON application_installations(owner_id, bundle_identifier);
