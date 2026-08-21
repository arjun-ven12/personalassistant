CREATE TABLE agent_manifests (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_type text NOT NULL,
  status text NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id),
  CHECK (length(id) BETWEEN 3 AND 120),
  CHECK (agent_type IN ('permanent','dynamic')),
  CHECK (status IN (
    'registered','idle','preparing','running','waiting','collaborating',
    'reviewing','completed','failed','archived'
  ))
);

CREATE INDEX agent_manifests_owner_status_idx
  ON agent_manifests(owner_id, status, updated_at DESC);

CREATE TABLE agent_packages (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  package_version text NOT NULL,
  integrity_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (length(package_version) BETWEEN 1 AND 40),
  CHECK (length(integrity_hash) = 64)
);

CREATE INDEX agent_packages_owner_agent_idx
  ON agent_packages(owner_id, agent_id, created_at DESC);

CREATE TABLE agent_os_sessions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  workflow_id uuid,
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (status IN ('preparing','running','completed','failed','cancelled'))
);

CREATE INDEX agent_os_sessions_owner_agent_idx
  ON agent_os_sessions(owner_id, agent_id, started_at DESC);
CREATE INDEX agent_os_sessions_workflow_idx ON agent_os_sessions(workflow_id, status);

CREATE TABLE agent_runtime_events (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  session_id uuid,
  workflow_id uuid,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (event_type IN (
    'AgentCreated','AgentStarted','AgentPaused','AgentResumed','AgentCompleted',
    'AgentFailed','CapabilityLoaded','ToolInvoked','MemoryUpdated',
    'KnowledgeRetrieved','WorkflowJoined','WorkflowLeft','ContextPackaged',
    'ConfigurationChanged','PackageValidated'
  ))
);

CREATE INDEX agent_runtime_events_owner_agent_idx
  ON agent_runtime_events(owner_id, agent_id, created_at DESC);

CREATE TABLE agent_configurations (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120)
);

CREATE INDEX agent_configurations_owner_agent_idx
  ON agent_configurations(owner_id, agent_id, updated_at DESC);

CREATE TABLE agent_os_tool_registry (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  execution_policy text NOT NULL,
  availability text NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id),
  CHECK (length(id) BETWEEN 3 AND 120),
  CHECK (execution_policy IN ('advisory_only','approval_required','unavailable')),
  CHECK (availability IN ('available','disabled','unavailable'))
);

CREATE INDEX agent_os_tool_registry_owner_availability_idx
  ON agent_os_tool_registry(owner_id, availability, updated_at DESC);

CREATE TABLE agent_os_permission_profiles (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  deployment_permissions text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id),
  CHECK (length(id) BETWEEN 3 AND 120),
  CHECK (deployment_permissions = 'none')
);

CREATE TABLE agent_os_knowledge_sources (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  mount_policy text NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id),
  CHECK (length(id) BETWEEN 3 AND 120),
  CHECK (source_type IN (
    'repository','architecture','knowledge_graph','documentation','memory',
    'user_preferences','project_history','design_decisions','previous_workflows'
  )),
  CHECK (mount_policy IN ('always','on_demand','disabled'))
);

CREATE INDEX agent_os_knowledge_sources_owner_type_idx
  ON agent_os_knowledge_sources(owner_id, source_type);

CREATE TABLE agent_os_versions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  version text NOT NULL,
  change_type text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (change_type IN (
    'manifest','capability','configuration','prompt','tool','permission','memory_schema'
  ))
);

CREATE INDEX agent_os_versions_owner_agent_idx
  ON agent_os_versions(owner_id, agent_id, created_at DESC);

CREATE TABLE agent_os_health (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  availability text NOT NULL,
  checked_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, agent_id),
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (availability IN ('available','degraded','unavailable','archived'))
);

CREATE TABLE agent_os_metrics (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  recorded_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, agent_id),
  CHECK (length(agent_id) BETWEEN 3 AND 120)
);

CREATE TABLE agent_os_context_packages (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  workflow_id uuid,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120)
);

CREATE INDEX agent_os_context_packages_owner_agent_idx
  ON agent_os_context_packages(owner_id, agent_id, created_at DESC);
