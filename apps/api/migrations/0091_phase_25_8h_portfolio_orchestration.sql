-- Phase 25.8H extends Agent Economy with owner/company scope accounts. These are
-- not agents and do not weaken the existing agent-account foreign keys.

CREATE TABLE IF NOT EXISTS agent_economy_scope_accounts (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  account_type text NOT NULL CHECK (account_type IN ('OWNER_RESERVE','COMPANY')),
  company_id uuid,
  available_credits bigint NOT NULL DEFAULT 0 CHECK (available_credits >= 0),
  reserved_credits bigint NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
  lifetime_allocated bigint NOT NULL DEFAULT 0 CHECK (lifetime_allocated >= 0),
  lifetime_spent bigint NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK ((account_type='OWNER_RESERVE' AND company_id IS NULL) OR (account_type='COMPANY' AND company_id IS NOT NULL)),
  FOREIGN KEY(owner_id,company_id) REFERENCES companies(owner_id,id) ON DELETE RESTRICT,
  UNIQUE(owner_id,id),
  UNIQUE(owner_id,account_type,company_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_economy_one_owner_reserve_idx
  ON agent_economy_scope_accounts(owner_id) WHERE account_type='OWNER_RESERVE';
CREATE INDEX IF NOT EXISTS agent_economy_scope_company_idx
  ON agent_economy_scope_accounts(owner_id,company_id);

CREATE TABLE IF NOT EXISTS agent_economy_scope_transfers (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  source_account_id uuid NOT NULL,
  destination_account_id uuid NOT NULL,
  company_id uuid NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status='SETTLED'),
  created_at timestamptz NOT NULL,
  settled_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id,idempotency_key),
  FOREIGN KEY(owner_id,source_account_id) REFERENCES agent_economy_scope_accounts(owner_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,destination_account_id) REFERENCES agent_economy_scope_accounts(owner_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,company_id) REFERENCES companies(owner_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS agent_economy_scope_transfer_company_idx
  ON agent_economy_scope_transfers(owner_id,company_id,created_at DESC);

CREATE TABLE IF NOT EXISTS agent_economy_scope_funding (
  id uuid NOT NULL UNIQUE,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  authority_ref text NOT NULL,
  approval_id uuid,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id,idempotency_key)
);

ALTER TABLE owner_portfolio_objectives DROP CONSTRAINT IF EXISTS owner_portfolio_objectives_status_check;
ALTER TABLE owner_portfolio_objectives ADD CONSTRAINT owner_portfolio_objectives_status_check
  CHECK (status IN ('PROPOSED','NEGOTIATING','PARTIALLY_ACCEPTED','ACCEPTED','BLOCKED','ACTIVE','COMPLETED','CANCELLED'));
ALTER TABLE owner_portfolio_objectives ADD CONSTRAINT owner_portfolio_objectives_owner_id_unique UNIQUE(owner_id,id);

CREATE TABLE IF NOT EXISTS owner_governor_proposals (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL,
  portfolio_objective_id uuid,
  status text NOT NULL CHECK (status IN ('CREATED','DELIVERED','UNDER_REVIEW','ACCEPTED','REJECTED','COUNTERPROPOSED','ESCALATED_TO_OWNER','EXPIRED','CANCELLED')),
  idempotency_key text NOT NULL,
  expires_at timestamptz NOT NULL,
  lease_owner text,
  lease_acquired_at timestamptz,
  lease_expires_at timestamptz,
  lease_generation integer NOT NULL DEFAULT 0 CHECK (lease_generation >= 0),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id,idempotency_key),
  FOREIGN KEY(owner_id,company_id) REFERENCES companies(owner_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,portfolio_objective_id) REFERENCES owner_portfolio_objectives(owner_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS owner_governor_proposals_objective_idx
  ON owner_governor_proposals(owner_id,portfolio_objective_id,created_at DESC);
CREATE INDEX IF NOT EXISTS owner_governor_proposals_company_status_idx
  ON owner_governor_proposals(owner_id,company_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS owner_governor_proposals_runnable_idx
  ON owner_governor_proposals(status,lease_expires_at,updated_at)
  WHERE status IN ('DELIVERED','UNDER_REVIEW');
