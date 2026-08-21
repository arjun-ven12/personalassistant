CREATE TABLE agent_templates (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  version text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id),
  CHECK (length(id) BETWEEN 3 AND 120),
  CHECK (length(version) BETWEEN 1 AND 40)
);

CREATE INDEX agent_templates_owner_updated_idx
  ON agent_templates(owner_id, updated_at DESC);

CREATE TABLE capability_registry (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name text NOT NULL,
  version text NOT NULL,
  confidence double precision NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id),
  CHECK (length(id) BETWEEN 3 AND 120),
  CHECK (length(name) BETWEEN 1 AND 120),
  CHECK (confidence BETWEEN 0 AND 1)
);

CREATE INDEX capability_registry_owner_name_idx
  ON capability_registry(owner_id, name);

CREATE TABLE agent_capabilities (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  capability_id text NOT NULL,
  confidence double precision NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, agent_id, capability_id),
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (length(capability_id) BETWEEN 3 AND 120),
  CHECK (confidence BETWEEN 0 AND 1),
  CHECK (source IN ('built_in','template','synthesised','observed'))
);

CREATE INDEX agent_capabilities_capability_idx
  ON agent_capabilities(owner_id, capability_id, confidence DESC);

CREATE TABLE dynamic_agents (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  workflow_id uuid,
  template_id text,
  origin text NOT NULL,
  lifecycle_status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  archived_at timestamptz,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id),
  CHECK (length(id) BETWEEN 3 AND 120),
  CHECK (origin IN ('template','synthesised','promoted_candidate')),
  CHECK (lifecycle_status IN (
    'created','initialising','active','collaborating','completed','archived'
  ))
);

CREATE INDEX dynamic_agents_owner_status_idx
  ON dynamic_agents(owner_id, lifecycle_status, updated_at DESC);
CREATE INDEX dynamic_agents_workflow_idx
  ON dynamic_agents(workflow_id, lifecycle_status);

CREATE TABLE agent_lifecycle (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  workflow_id uuid,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (status IN (
    'created','initialising','active','collaborating','completed','archived'
  ))
);

CREATE INDEX agent_lifecycle_owner_agent_idx
  ON agent_lifecycle(owner_id, agent_id, created_at DESC);

CREATE TABLE agent_performance (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  workflow_id uuid,
  success_rate double precision NOT NULL,
  confidence double precision NOT NULL,
  recorded_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (success_rate BETWEEN 0 AND 1),
  CHECK (confidence BETWEEN 0 AND 1)
);

CREATE INDEX agent_performance_owner_agent_idx
  ON agent_performance(owner_id, agent_id, recorded_at DESC);

CREATE TABLE agent_usage (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  workflow_id uuid,
  usage_type text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (length(usage_type) BETWEEN 1 AND 120)
);

CREATE INDEX agent_usage_owner_agent_idx
  ON agent_usage(owner_id, agent_id, created_at DESC);

CREATE TABLE agent_promotions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  status text NOT NULL,
  usage_count integer NOT NULL,
  success_rate double precision NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (status IN ('pending_owner_review','accepted','dismissed')),
  CHECK (usage_count >= 0),
  CHECK (success_rate BETWEEN 0 AND 1)
);

CREATE INDEX agent_promotions_owner_status_idx
  ON agent_promotions(owner_id, status, updated_at DESC);

CREATE TABLE capability_history (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  capability_id text NOT NULL,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(capability_id) BETWEEN 3 AND 120),
  CHECK (length(event_type) BETWEEN 1 AND 120)
);

CREATE INDEX capability_history_owner_capability_idx
  ON capability_history(owner_id, capability_id, created_at DESC);

CREATE TABLE team_compositions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  workflow_id uuid,
  risk_level text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (risk_level IN ('low','medium','high'))
);

CREATE INDEX team_compositions_owner_time_idx
  ON team_compositions(owner_id, created_at DESC);
CREATE INDEX team_compositions_workflow_idx ON team_compositions(workflow_id);

CREATE TABLE dynamic_agent_memory (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  workflow_id uuid,
  summary text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (length(summary) BETWEEN 1 AND 2000)
);

CREATE INDEX dynamic_agent_memory_owner_agent_idx
  ON dynamic_agent_memory(owner_id, agent_id, created_at DESC);
