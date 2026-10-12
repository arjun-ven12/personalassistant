CREATE TABLE universal_tool_reviews (
  owner_id uuid NOT NULL,
  tool_id text NOT NULL,
  company_id uuid NOT NULL,
  provider_id text NOT NULL,
  schema_digest char(64) NOT NULL,
  status text NOT NULL CHECK (status IN ('REVIEWED', 'ENABLED', 'DISABLED', 'REVOKED')),
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, tool_id),
  FOREIGN KEY (owner_id, tool_id)
    REFERENCES universal_tool_definitions (owner_id, id)
);
