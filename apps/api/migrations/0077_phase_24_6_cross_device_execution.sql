CREATE TABLE IF NOT EXISTS cross_device_clients (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  session_id text NOT NULL,
  client_type text NOT NULL,
  record jsonb NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS cross_device_clients_owner_idx
  ON cross_device_clients(owner_id, lease_expires_at DESC);

CREATE TABLE IF NOT EXISTS cross_device_commands (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  source_client_instance_id uuid NOT NULL,
  target_id uuid,
  status text NOT NULL,
  idempotency_key uuid NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  UNIQUE(owner_id, source_client_instance_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS cross_device_commands_source_idx
  ON cross_device_commands(owner_id, source_client_instance_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS cross_device_commands_target_idx
  ON cross_device_commands(owner_id, target_id, status, created_at ASC);
