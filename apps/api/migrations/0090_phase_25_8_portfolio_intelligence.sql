-- Phase 25.8 portfolio objectives are owner-scoped coordination proposals.
-- They do not directly create company objectives, move credits, or grant authority.

CREATE TABLE IF NOT EXISTS owner_portfolio_objectives (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('PROPOSED')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id,idempotency_key)
);

CREATE INDEX IF NOT EXISTS owner_portfolio_objectives_owner_time_idx
  ON owner_portfolio_objectives(owner_id,created_at DESC);
