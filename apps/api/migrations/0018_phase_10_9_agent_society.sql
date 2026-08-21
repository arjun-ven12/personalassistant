CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (status IN ('active','archived'))
);

CREATE INDEX organizations_owner_idx ON organizations(owner_id, updated_at DESC);

CREATE TABLE departments (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  lead_agent_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX departments_owner_org_idx ON departments(owner_id, organization_id);

CREATE TABLE organizational_roles (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE UNIQUE INDEX organizational_roles_owner_role_idx
  ON organizational_roles(owner_id, role);

CREATE TABLE teams (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  department_id uuid,
  workflow_id uuid,
  complexity text NOT NULL,
  risk text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (complexity IN ('low','medium','high')),
  CHECK (risk IN ('low','medium','high')),
  CHECK (status IN ('forming','active','blocked','completed','archived'))
);

CREATE INDEX teams_owner_status_idx ON teams(owner_id, status, updated_at DESC);

CREATE TABLE team_members (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  team_id uuid NOT NULL,
  agent_id text NOT NULL,
  role_id uuid NOT NULL,
  leadership boolean NOT NULL,
  joined_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120)
);

CREATE INDEX team_members_owner_team_idx ON team_members(owner_id, team_id);

CREATE TABLE agent_society_delegations (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  team_id uuid NOT NULL,
  from_agent_id text NOT NULL,
  to_agent_id text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX agent_society_delegations_owner_team_idx ON agent_society_delegations(owner_id, team_id, created_at DESC);

CREATE TABLE debates (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  team_id uuid,
  status text NOT NULL,
  confidence numeric NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (status IN ('open','resolved','escalated')),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE TABLE debate_arguments (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  debate_id uuid NOT NULL,
  agent_id text NOT NULL,
  stance text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX debate_arguments_owner_debate_idx ON debate_arguments(owner_id, debate_id);

CREATE TABLE consensus_sessions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  team_id uuid,
  rule text NOT NULL,
  confidence numeric NOT NULL,
  human_escalation_required boolean NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX consensus_sessions_owner_idx ON consensus_sessions(owner_id, created_at DESC);

CREATE TABLE peer_reviews (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  team_id uuid,
  reviewer_agent_id text NOT NULL,
  subject_agent_id text NOT NULL,
  review_type text NOT NULL,
  confidence numeric NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE mentorships (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  mentor_agent_id text NOT NULL,
  mentee_agent_id text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE conflicts (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  team_id uuid,
  conflict_type text NOT NULL,
  escalation_required boolean NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE meetings (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  team_id uuid,
  meeting_type text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE meeting_minutes (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE communications (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  team_id uuid,
  sender_agent_id text NOT NULL,
  recipient_agent_id text,
  message_type text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX communications_owner_team_idx ON communications(owner_id, team_id, created_at DESC);

CREATE TABLE reputation_scores (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  overall numeric NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (overall >= 0 AND overall <= 1)
);

CREATE UNIQUE INDEX reputation_scores_owner_agent_idx
  ON reputation_scores(owner_id, agent_id);

CREATE TABLE collaboration_edges (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  source_agent_id text NOT NULL,
  target_agent_id text NOT NULL,
  relationship text NOT NULL,
  weight numeric NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (weight >= 0 AND weight <= 1)
);

CREATE TABLE organizational_metrics (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  value numeric NOT NULL,
  trend numeric NOT NULL,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (trend >= -1 AND trend <= 1)
);

CREATE TABLE organizational_memory (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  memory_type text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);
