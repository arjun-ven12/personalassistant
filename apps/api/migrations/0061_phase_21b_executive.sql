CREATE TABLE IF NOT EXISTS executive_records (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('GOAL', 'KPI', 'PLAN', 'DECISION')),
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS executive_records_owner_kind_updated_idx
  ON executive_records(owner_id, kind, updated_at DESC);
