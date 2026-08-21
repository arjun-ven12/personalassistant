ALTER TABLE execution_requests
  ADD COLUMN server_key_fingerprint varchar(200),
  ADD COLUMN workspace_root_hash char(64),
  ADD COLUMN agent_last_heartbeat_at timestamptz;

CREATE INDEX execution_requests_active_heartbeat_idx
  ON execution_requests(device_id, status, agent_last_heartbeat_at)
  WHERE status IN ('CLAIMED','RUNNING');

CREATE INDEX execution_requests_expiry_cleanup_idx
  ON execution_requests(expires_at)
  WHERE status IN ('PENDING','CLAIMED','RUNNING');

CREATE TABLE server_execution_keys (
  fingerprint varchar(200) PRIMARY KEY,
  public_key_x varchar(256) NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('ACTIVE','RETIRING','REVOKED')),
  created_at timestamptz NOT NULL,
  activated_at timestamptz,
  retiring_at timestamptz,
  revoked_at timestamptz
);

CREATE UNIQUE INDEX server_execution_keys_active_one_idx
  ON server_execution_keys((status))
  WHERE status = 'ACTIVE';
