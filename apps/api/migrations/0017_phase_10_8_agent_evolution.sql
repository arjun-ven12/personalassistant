CREATE TABLE agent_expertise (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  category text NOT NULL,
  name text NOT NULL,
  level text NOT NULL,
  confidence numeric NOT NULL,
  success_rate numeric NOT NULL,
  growth_trend numeric NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (level IN ('beginner','intermediate','advanced','expert','specialist','master')),
  CHECK (confidence >= 0 AND confidence <= 1),
  CHECK (success_rate >= 0 AND success_rate <= 1),
  CHECK (growth_trend >= -1 AND growth_trend <= 1)
);

CREATE INDEX agent_expertise_owner_agent_idx
  ON agent_expertise(owner_id, agent_id, updated_at DESC);

CREATE TABLE expertise_history (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  expertise_id uuid NOT NULL,
  new_level text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (new_level IN ('beginner','intermediate','advanced','expert','specialist','master'))
);

CREATE INDEX expertise_history_owner_agent_idx
  ON expertise_history(owner_id, agent_id, created_at DESC);

CREATE TABLE evolution_proposals (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  type text NOT NULL,
  status text NOT NULL,
  confidence numeric NOT NULL,
  risk text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (status IN ('proposed','approved','rejected','superseded','archived')),
  CHECK (risk IN ('low','medium','high')),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX evolution_proposals_owner_agent_idx
  ON evolution_proposals(owner_id, agent_id, created_at DESC);

CREATE TABLE capability_versions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  subject_id text NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120)
);

CREATE TABLE prompt_versions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  subject_id text NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120)
);

CREATE TABLE reasoning_versions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  subject_id text NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120)
);

CREATE TABLE workflow_improvements (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  status text NOT NULL,
  confidence numeric NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (status IN ('proposed','approved','rejected','superseded','archived')),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE TABLE knowledge_improvements (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  status text NOT NULL,
  confidence numeric NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (status IN ('proposed','approved','rejected','superseded','archived')),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE TABLE failure_history (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120)
);

CREATE TABLE success_history (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120)
);

CREATE TABLE benchmark_results (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  score numeric NOT NULL,
  trend numeric NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (score >= 0 AND score <= 1),
  CHECK (trend >= -1 AND trend <= 1)
);

CREATE TABLE evolution_timeline (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120)
);

CREATE TABLE self_evaluations (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120)
);

CREATE TABLE capability_marketplace (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  quality_score numeric NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id),
  CHECK (length(id) BETWEEN 3 AND 120),
  CHECK (quality_score >= 0 AND quality_score <= 1)
);
