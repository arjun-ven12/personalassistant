CREATE TABLE IF NOT EXISTS agent_economy_accounts(
  owner_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  economy_status TEXT NOT NULL,
  available_credits BIGINT NOT NULL DEFAULT 0 CHECK (available_credits >= 0),
  reserved_credits BIGINT NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
  lifetime_earned BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
  lifetime_spent BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
  reputation DOUBLE PRECISION NOT NULL DEFAULT 50 CHECK (reputation >= 0 AND reputation <= 100),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL,
  PRIMARY KEY(owner_id, agent_id),
  FOREIGN KEY(owner_id, agent_id) REFERENCES agents(owner_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agent_economy_accounts_owner_status_idx
  ON agent_economy_accounts(owner_id, economy_status);

CREATE TABLE IF NOT EXISTS agent_economy_ledger(
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL,
  UNIQUE(owner_id, idempotency_key),
  FOREIGN KEY(owner_id, agent_id) REFERENCES agent_economy_accounts(owner_id, agent_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agent_economy_ledger_owner_created_idx
  ON agent_economy_ledger(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_economy_reservations(
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_reserved BIGINT NOT NULL CHECK (amount_reserved > 0),
  amount_settled BIGINT NOT NULL DEFAULT 0 CHECK (amount_settled >= 0),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL,
  UNIQUE(owner_id, idempotency_key),
  FOREIGN KEY(owner_id, agent_id) REFERENCES agent_economy_accounts(owner_id, agent_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agent_economy_reservations_active_idx
  ON agent_economy_reservations(owner_id, agent_id, status);

CREATE TABLE IF NOT EXISTS agent_economy_performance(
  owner_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL,
  PRIMARY KEY(owner_id, agent_id),
  FOREIGN KEY(owner_id, agent_id) REFERENCES agent_economy_accounts(owner_id, agent_id) ON DELETE CASCADE
);
