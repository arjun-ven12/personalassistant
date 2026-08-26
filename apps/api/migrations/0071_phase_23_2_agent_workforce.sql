CREATE TABLE IF NOT EXISTS agent_workforce_events(
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL,
  FOREIGN KEY(owner_id, agent_id) REFERENCES agents(owner_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agent_workforce_events_agent_created_idx
  ON agent_workforce_events(owner_id, agent_id, created_at DESC);
