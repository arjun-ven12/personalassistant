CREATE TABLE agents (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  role text NOT NULL,
  status text NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id),
  CHECK (length(id) BETWEEN 3 AND 120),
  CHECK (role IN (
    'engineering_manager','planning','coding','review','security','testing',
    'documentation','release'
  )),
  CHECK (status IN ('available','busy','paused','disabled','unhealthy'))
);

CREATE INDEX agents_owner_role_idx ON agents(owner_id, role, status);

CREATE TABLE agent_sessions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  record jsonb NOT NULL,
  FOREIGN KEY(owner_id, agent_id) REFERENCES agents(owner_id, id) ON DELETE CASCADE,
  CHECK (status IN ('active','paused','ended','failed'))
);

CREATE TABLE agent_tasks (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  workflow_id uuid,
  status text NOT NULL,
  priority text NOT NULL,
  assigned_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  FOREIGN KEY(owner_id, agent_id) REFERENCES agents(owner_id, id) ON DELETE CASCADE,
  CHECK (status IN (
    'queued','assigned','in_progress','waiting_consensus','blocked','completed',
    'cancelled','failed'
  )),
  CHECK (priority IN ('low','normal','high','urgent'))
);

CREATE INDEX agent_tasks_owner_status_idx ON agent_tasks(owner_id, status, priority);
CREATE INDEX agent_tasks_workflow_idx ON agent_tasks(workflow_id, status);

CREATE TABLE agent_messages (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  sender_agent_id text NOT NULL,
  recipient_agent_id text NOT NULL,
  conversation_id uuid NOT NULL,
  workflow_id uuid,
  task_id uuid,
  message_type text NOT NULL,
  priority text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  FOREIGN KEY(owner_id, sender_agent_id) REFERENCES agents(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, recipient_agent_id) REFERENCES agents(owner_id, id) ON DELETE CASCADE,
  CHECK (message_type IN (
    'assignment','status','question','finding','review','security_review',
    'test_plan','documentation','release_note','conflict','consensus_vote'
  )),
  CHECK (priority IN ('low','normal','high','urgent'))
);

CREATE INDEX agent_messages_owner_created_idx ON agent_messages(owner_id, created_at DESC);
CREATE INDEX agent_messages_conversation_idx ON agent_messages(conversation_id, created_at ASC);

CREATE TABLE agent_context (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  context_type text NOT NULL,
  version integer NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (version > 0),
  CHECK (context_type IN (
    'repository','architecture','workflow','execution','validation','conclusion'
  ))
);

CREATE INDEX agent_context_owner_type_idx ON agent_context(owner_id, context_type, created_at DESC);

CREATE TABLE agent_consensus (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  workflow_id uuid,
  task_id uuid,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (status IN ('open','passed','failed','owner_override_required'))
);

CREATE INDEX agent_consensus_owner_status_idx ON agent_consensus(owner_id, status, created_at DESC);

CREATE TABLE agent_conflicts (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  workflow_id uuid,
  task_id uuid,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (status IN ('open','owner_review','resolved','dismissed'))
);

CREATE INDEX agent_conflicts_owner_status_idx ON agent_conflicts(owner_id, status, created_at DESC);

CREATE TABLE agent_health (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  state text NOT NULL,
  checked_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, agent_id),
  FOREIGN KEY(owner_id, agent_id) REFERENCES agents(owner_id, id) ON DELETE CASCADE,
  CHECK (state IN ('healthy','degraded','unhealthy','unknown'))
);

CREATE TABLE agent_metrics (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  last_activity_at timestamptz,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, agent_id),
  FOREIGN KEY(owner_id, agent_id) REFERENCES agents(owner_id, id) ON DELETE CASCADE
);

CREATE TABLE agent_history (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  FOREIGN KEY(owner_id, agent_id) REFERENCES agents(owner_id, id) ON DELETE CASCADE
);

CREATE TABLE delegations (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  delegating_agent_id text NOT NULL,
  assigned_agent_id text NOT NULL,
  task_id uuid NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  FOREIGN KEY(owner_id, delegating_agent_id) REFERENCES agents(owner_id, id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id, assigned_agent_id) REFERENCES agents(owner_id, id) ON DELETE CASCADE
);
