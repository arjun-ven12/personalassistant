ALTER TABLE security_state
  ADD COLUMN read_only_execution_available boolean NOT NULL DEFAULT false,
  ADD COLUMN write_execution_available boolean NOT NULL DEFAULT false
    CHECK (write_execution_available = false);

CREATE TABLE execution_requests (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  policy_evaluation_id uuid NOT NULL REFERENCES policy_evaluations(id) ON DELETE RESTRICT,
  approval_request_id uuid REFERENCES approval_requests(id) ON DELETE RESTRICT,
  action_digest varchar(128) NOT NULL,
  tool_name varchar(100) NOT NULL CHECK (tool_name IN (
    'workspace.inspect_metadata', 'workspace.read_file', 'git.status',
    'git.diff', 'git.current_branch'
  )),
  status varchar(20) NOT NULL CHECK (status IN (
    'PENDING','CLAIMED','RUNNING','SUCCEEDED','FAILED','TIMED_OUT',
    'CANCELLED','EXPIRED','REJECTED'
  )),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  record jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX execution_requests_owner_time_idx
  ON execution_requests(owner_id, created_at DESC);
CREATE INDEX execution_requests_device_pending_idx
  ON execution_requests(device_id, status, expires_at);

CREATE TABLE execution_results (
  execution_request_id uuid PRIMARY KEY
    REFERENCES execution_requests(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);
CREATE INDEX execution_results_retention_idx ON execution_results(expires_at);
