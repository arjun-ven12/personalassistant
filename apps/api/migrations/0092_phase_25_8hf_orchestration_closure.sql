ALTER TABLE agent_economy_scope_funding ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE agent_economy_scope_funding ADD COLUMN IF NOT EXISTS approval_id uuid;
ALTER TABLE agent_economy_scope_funding ADD COLUMN IF NOT EXISTS record jsonb;
UPDATE agent_economy_scope_funding
SET id = COALESCE(id, gen_random_uuid())
WHERE id IS NULL;
UPDATE agent_economy_scope_funding
SET record = jsonb_build_object(
  'fundingId', id,
  'ownerId', owner_id,
  'amount', amount,
  'reason', 'Administrative reserve funding',
  'authority', 'OWNER_RESERVE_FUND',
  'authorityRef', authority_ref,
  'idempotencyKey', idempotency_key,
  'approvalId', approval_id,
  'status', 'SETTLED',
  'createdAt', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'settledAt', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
)
WHERE record IS NULL;
ALTER TABLE agent_economy_scope_funding ALTER COLUMN id SET NOT NULL;
ALTER TABLE agent_economy_scope_funding ALTER COLUMN record SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agent_economy_scope_funding_id_idx
  ON agent_economy_scope_funding(id);

ALTER TABLE owner_governor_proposals ADD COLUMN IF NOT EXISTS lease_owner text;
ALTER TABLE owner_governor_proposals ADD COLUMN IF NOT EXISTS lease_acquired_at timestamptz;
ALTER TABLE owner_governor_proposals ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
ALTER TABLE owner_governor_proposals ADD COLUMN IF NOT EXISTS lease_generation integer NOT NULL DEFAULT 0 CHECK (lease_generation >= 0);
ALTER TABLE owner_governor_proposals ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0);
CREATE INDEX IF NOT EXISTS owner_governor_proposals_runnable_idx
  ON owner_governor_proposals(status,lease_expires_at,updated_at)
  WHERE status IN ('DELIVERED','UNDER_REVIEW');
