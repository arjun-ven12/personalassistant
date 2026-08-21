CREATE TABLE IF NOT EXISTS conversation_continuity (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id),
  UNIQUE(owner_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS conversation_continuity_owner_updated_idx
  ON conversation_continuity(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS conversation_continuity_turn_claims (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  turn_id uuid NOT NULL,
  claimed_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id, conversation_id, turn_id)
);

CREATE INDEX IF NOT EXISTS conversation_continuity_turn_claims_owner_claimed_idx
  ON conversation_continuity_turn_claims(owner_id, claimed_at DESC);
