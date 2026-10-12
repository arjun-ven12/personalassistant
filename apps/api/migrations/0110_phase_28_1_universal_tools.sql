CREATE TABLE universal_tool_providers (
  owner_id uuid NOT NULL,
  id text NOT NULL,
  company_id uuid,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE TABLE universal_tool_definitions (
  owner_id uuid NOT NULL,
  id text NOT NULL,
  provider_id text NOT NULL,
  company_id uuid,
  enabled boolean NOT NULL,
  schema_digest char(64) NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, provider_id)
    REFERENCES universal_tool_providers (owner_id, id)
);

CREATE INDEX universal_tool_definitions_eligible_idx
  ON universal_tool_definitions (owner_id, company_id, provider_id)
  WHERE enabled;

CREATE TABLE universal_tool_invocation_receipts (
  owner_id uuid NOT NULL,
  invocation_id uuid NOT NULL,
  company_id uuid,
  tool_id text NOT NULL,
  request_digest char(64) NOT NULL,
  status text NOT NULL CHECK (status IN ('RESERVED', 'COMPLETED', 'INDETERMINATE')),
  claimed_at timestamptz,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, invocation_id),
  FOREIGN KEY (owner_id, tool_id)
    REFERENCES universal_tool_definitions (owner_id, id)
);

CREATE INDEX universal_tool_invocation_receipts_recovery_idx
  ON universal_tool_invocation_receipts (status, claimed_at)
  WHERE status IN ('RESERVED', 'INDETERMINATE');
