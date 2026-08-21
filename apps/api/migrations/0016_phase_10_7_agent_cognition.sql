CREATE TABLE working_memory (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  workflow_id uuid,
  confidence numeric NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX working_memory_owner_agent_idx
  ON working_memory(owner_id, agent_id, updated_at DESC);

CREATE TABLE episodic_memory (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  workflow_id uuid,
  confidence numeric NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX episodic_memory_owner_agent_idx
  ON episodic_memory(owner_id, agent_id, updated_at DESC);

CREATE TABLE semantic_memory (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  workflow_id uuid,
  confidence numeric NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX semantic_memory_owner_agent_idx
  ON semantic_memory(owner_id, agent_id, updated_at DESC);

CREATE TABLE procedural_memory (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  workflow_id uuid,
  confidence numeric NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX procedural_memory_owner_agent_idx
  ON procedural_memory(owner_id, agent_id, updated_at DESC);

CREATE TABLE memory_relationships (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  source_memory_id uuid NOT NULL,
  target_memory_id uuid NOT NULL,
  relationship text NOT NULL,
  confidence numeric NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (relationship IN (
    'derived_from','related_to','supersedes','depends_on','contradicts',
    'validated_by','referenced_by','supports'
  )),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX memory_relationships_owner_agent_idx
  ON memory_relationships(owner_id, agent_id, created_at DESC);

CREATE TABLE experience_store (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  workflow_id uuid,
  outcome text NOT NULL,
  impact text NOT NULL,
  confidence numeric NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (outcome IN ('success','failure','partial','cancelled')),
  CHECK (impact IN ('low','medium','high')),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX experience_store_owner_agent_idx
  ON experience_store(owner_id, agent_id, created_at DESC);

CREATE TABLE decision_log (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  workflow_id uuid,
  confidence numeric NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX decision_log_owner_agent_idx
  ON decision_log(owner_id, agent_id, created_at DESC);

CREATE TABLE agent_specializations (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  performance_score numeric NOT NULL,
  confidence numeric NOT NULL,
  expertise_growth numeric NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, agent_id),
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (performance_score >= 0 AND performance_score <= 1),
  CHECK (confidence >= 0 AND confidence <= 1),
  CHECK (expertise_growth >= 0 AND expertise_growth <= 1)
);

CREATE TABLE reflection_reports (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  workflow_id uuid,
  confidence numeric NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX reflection_reports_owner_agent_idx
  ON reflection_reports(owner_id, agent_id, created_at DESC);

CREATE TABLE confidence_history (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  workflow_id uuid,
  target_type text NOT NULL,
  confidence numeric NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (target_type IN (
    'knowledge','reasoning','code_generation','architecture','planning',
    'testing','recommendation'
  )),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX confidence_history_owner_agent_idx
  ON confidence_history(owner_id, agent_id, created_at DESC);

CREATE TABLE goal_tracking (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  workflow_id uuid,
  status text NOT NULL,
  progress_percent numeric NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (status IN ('active','blocked','completed','archived')),
  CHECK (progress_percent >= 0 AND progress_percent <= 100)
);

CREATE INDEX goal_tracking_owner_agent_idx
  ON goal_tracking(owner_id, agent_id, updated_at DESC);

CREATE TABLE agent_cognitive_states (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  state text NOT NULL,
  active_workflow_id uuid,
  last_transition_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, agent_id),
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (state IN (
    'idle','observing','planning','reasoning','researching','implementing',
    'reviewing','reflecting','learning','waiting','completed','archived'
  ))
);

CREATE TABLE agent_learning_events (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  workflow_id uuid,
  stage text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (stage IN (
    'capture','reflect','validate','extract_lessons','update_procedural',
    'update_semantic','update_specialization','summarize','schedule_consolidation'
  ))
);

CREATE INDEX agent_learning_events_owner_agent_idx
  ON agent_learning_events(owner_id, agent_id, created_at DESC);

CREATE TABLE memory_consolidation (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  record jsonb NOT NULL,
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (status IN ('scheduled','completed','failed'))
);

CREATE INDEX memory_consolidation_owner_agent_idx
  ON memory_consolidation(owner_id, agent_id, created_at DESC);

CREATE TABLE cognitive_metrics (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  recorded_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, agent_id),
  CHECK (length(agent_id) BETWEEN 3 AND 120)
);
