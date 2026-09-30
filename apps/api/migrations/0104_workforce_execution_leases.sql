-- Additive fencing for the existing workforce runtime. No task/history rewrite.
ALTER TABLE workforce_runtime_tasks ADD COLUMN IF NOT EXISTS execution_lease_token UUID;
ALTER TABLE workforce_runtime_tasks ADD COLUMN IF NOT EXISTS execution_lease_owner TEXT;
ALTER TABLE workforce_runtime_tasks ADD COLUMN IF NOT EXISTS execution_lease_expires_at TIMESTAMPTZ;
ALTER TABLE workforce_runtime_tasks ADD COLUMN IF NOT EXISTS lifecycle_pending BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS workforce_runtime_lifecycle_pending_idx ON workforce_runtime_tasks(updated_at) WHERE lifecycle_pending;
CREATE INDEX IF NOT EXISTS workforce_runtime_expired_execution_idx
  ON workforce_runtime_tasks(execution_lease_expires_at,updated_at)
  WHERE status IN ('RUNNING','RESERVED');
