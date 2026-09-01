-- Additive Phase 25.6 completion fields. Alexa remains the workflow authority.
ALTER TABLE durable_workflow_executions
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_acquired_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_generation integer NOT NULL DEFAULT 0;

ALTER TABLE durable_workflow_executions
  DROP CONSTRAINT IF EXISTS durable_workflow_lease_complete;
ALTER TABLE durable_workflow_executions
  ADD CONSTRAINT durable_workflow_lease_complete CHECK (
    (lease_owner IS NULL AND lease_acquired_at IS NULL AND lease_expires_at IS NULL AND last_heartbeat_at IS NULL)
    OR
    (lease_owner IS NOT NULL AND lease_acquired_at IS NOT NULL AND lease_expires_at IS NOT NULL AND last_heartbeat_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS durable_workflow_claim_idx
  ON durable_workflow_executions(status,next_run_at,lease_expires_at,updated_at)
  WHERE status IN ('QUEUED','RUNNING');

CREATE UNIQUE INDEX IF NOT EXISTS durable_workflow_one_service_idx
  ON durable_workflow_executions(owner_id,service_request_id)
  WHERE service_request_id IS NOT NULL;

ALTER TABLE agent_economy_reservations
  DROP CONSTRAINT IF EXISTS agent_economy_reservation_scope_unique;
ALTER TABLE agent_economy_reservations
  ADD CONSTRAINT agent_economy_reservation_scope_unique UNIQUE(owner_id,company_id,id);

ALTER TABLE cross_company_service_requests
  ADD COLUMN IF NOT EXISTS paying_company_id uuid,
  ADD COLUMN IF NOT EXISTS paying_assignment_id uuid,
  ADD COLUMN IF NOT EXISTS economy_reservation_id uuid,
  ADD COLUMN IF NOT EXISTS economy_state text NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS estimated_cost_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_cost_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settled_cost_credits integer NOT NULL DEFAULT 0;

ALTER TABLE cross_company_service_requests
  DROP CONSTRAINT IF EXISTS cross_company_economy_state_check;
ALTER TABLE cross_company_service_requests
  ADD CONSTRAINT cross_company_economy_state_check
  CHECK(economy_state IN ('NONE','RESERVED','SETTLED','RELEASED'));

ALTER TABLE cross_company_service_requests
  DROP CONSTRAINT IF EXISTS cross_company_paying_company_fkey;
ALTER TABLE cross_company_service_requests
  ADD CONSTRAINT cross_company_paying_company_fkey
  FOREIGN KEY(owner_id,paying_company_id) REFERENCES companies(owner_id,id) ON DELETE RESTRICT;

ALTER TABLE cross_company_service_requests
  DROP CONSTRAINT IF EXISTS cross_company_paying_assignment_fkey;
ALTER TABLE cross_company_service_requests
  ADD CONSTRAINT cross_company_paying_assignment_fkey
  FOREIGN KEY(owner_id,paying_company_id,paying_assignment_id)
  REFERENCES company_agent_assignments(owner_id,company_id,id) ON DELETE RESTRICT;

ALTER TABLE cross_company_service_requests
  DROP CONSTRAINT IF EXISTS cross_company_economy_reservation_fkey;
ALTER TABLE cross_company_service_requests
  ADD CONSTRAINT cross_company_economy_reservation_fkey
  FOREIGN KEY(owner_id,paying_company_id,economy_reservation_id)
  REFERENCES agent_economy_reservations(owner_id,company_id,id) ON DELETE RESTRICT;

ALTER TABLE durable_activity_receipts
  ADD COLUMN IF NOT EXISTS request_digest text,
  ADD COLUMN IF NOT EXISTS commit_evidence_ref text,
  ADD COLUMN IF NOT EXISTS result_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS durable_receipt_execution_step_idx
  ON durable_activity_receipts(owner_id,execution_id,idempotency_key);
