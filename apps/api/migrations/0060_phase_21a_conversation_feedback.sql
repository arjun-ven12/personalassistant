CREATE TABLE IF NOT EXISTS conversation_turn_feedback (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id),
  FOREIGN KEY(owner_id, turn_id)
    REFERENCES conversation_history(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS conversation_turn_feedback_owner_turn_idx
  ON conversation_turn_feedback(owner_id, turn_id, created_at DESC);
