CREATE TABLE memories (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  repository_id uuid,
  agent_id text,
  workflow_id uuid,
  memory_type text NOT NULL,
  source text NOT NULL,
  importance integer NOT NULL,
  confidence double precision NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (memory_type IN ('episodic','semantic','procedural','preference','repository','agent')),
  CHECK (source IN ('owner','system','agent','workflow','repository','validation','integration','conversation')),
  CHECK (importance BETWEEN 0 AND 100),
  CHECK (confidence >= 0 AND confidence <= 1),
  CHECK (agent_id IS NULL OR length(agent_id) BETWEEN 3 AND 120)
);

CREATE INDEX memories_owner_updated_idx ON memories(owner_id, updated_at DESC);
CREATE INDEX memories_owner_type_idx ON memories(owner_id, memory_type, updated_at DESC);
CREATE INDEX memories_owner_repository_idx ON memories(owner_id, repository_id, updated_at DESC);
CREATE INDEX memories_owner_agent_idx ON memories(owner_id, agent_id, updated_at DESC);

CREATE TABLE memory_embeddings (
  memory_id uuid PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  embedding_model text NOT NULL,
  embedding_dimension integer NOT NULL,
  embedding_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (embedding_dimension > 0),
  CHECK (length(embedding_model) BETWEEN 1 AND 120),
  CHECK (length(embedding_hash) BETWEEN 16 AND 255)
);

CREATE INDEX memory_embeddings_owner_model_idx ON memory_embeddings(owner_id, embedding_model);

CREATE TABLE knowledge_nodes (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL,
  ref_id text,
  confidence double precision NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (kind IN (
    'repository','symbol','agent','workflow','task','integration','decision',
    'preference','architecture','documentation','memory'
  )),
  CHECK (length(label) BETWEEN 1 AND 255),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX knowledge_nodes_owner_kind_idx ON knowledge_nodes(owner_id, kind, updated_at DESC);
CREATE INDEX knowledge_nodes_owner_ref_idx ON knowledge_nodes(owner_id, ref_id) WHERE ref_id IS NOT NULL;

CREATE TABLE knowledge_edges (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  relation text NOT NULL,
  confidence double precision NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (source_node_id <> target_node_id),
  CHECK (relation IN (
    'mentions','depends_on','implements','decided_by','owned_by','similar_to',
    'conflicts_with','validated_by','derived_from','documents'
  )),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX knowledge_edges_owner_relation_idx ON knowledge_edges(owner_id, relation, created_at DESC);
CREATE INDEX knowledge_edges_source_idx ON knowledge_edges(source_node_id);
CREATE INDEX knowledge_edges_target_idx ON knowledge_edges(target_node_id);

CREATE TABLE engineering_decisions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  repository_id uuid,
  workflow_id uuid,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (status IN ('active','superseded','rejected'))
);

CREATE INDEX engineering_decisions_owner_status_idx ON engineering_decisions(owner_id, status, created_at DESC);
CREATE INDEX engineering_decisions_repository_idx ON engineering_decisions(owner_id, repository_id, created_at DESC);

CREATE TABLE repository_memory (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  repository_id uuid NOT NULL,
  last_consolidated_at timestamptz NOT NULL,
  confidence double precision NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, repository_id),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE TABLE agent_memory (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  last_updated_at timestamptz NOT NULL,
  success_rate double precision NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, agent_id),
  CHECK (length(agent_id) BETWEEN 3 AND 120),
  CHECK (success_rate >= 0 AND success_rate <= 1)
);

CREATE TABLE learning_events (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  repository_id uuid,
  agent_id text,
  workflow_id uuid,
  kind text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (kind IN (
    'pattern_observed','workflow_outcome','review_feedback','validation_outcome',
    'preference_observed','suggestion_feedback'
  )),
  CHECK (agent_id IS NULL OR length(agent_id) BETWEEN 3 AND 120)
);

CREATE INDEX learning_events_owner_kind_idx ON learning_events(owner_id, kind, created_at DESC);

CREATE TABLE memory_confidence (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  memory_id uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  confidence double precision NOT NULL,
  reason text NOT NULL,
  observed_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (confidence >= 0 AND confidence <= 1),
  CHECK (length(reason) BETWEEN 1 AND 1000)
);

CREATE INDEX memory_confidence_memory_idx ON memory_confidence(memory_id, observed_at DESC);

CREATE TABLE memory_clusters (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  cluster_key text NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, cluster_key),
  CHECK (length(cluster_key) BETWEEN 1 AND 255),
  CHECK (length(title) BETWEEN 1 AND 255)
);

CREATE TABLE memory_suggestions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  repository_id uuid,
  status text NOT NULL,
  risk_level text NOT NULL,
  confidence double precision NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (status IN ('open','accepted','dismissed','superseded')),
  CHECK (risk_level IN ('low','medium','high')),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX memory_suggestions_owner_status_idx ON memory_suggestions(owner_id, status, created_at DESC);

CREATE TABLE memory_timeline (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  event_type text NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(event_type) BETWEEN 1 AND 120)
);

CREATE INDEX memory_timeline_owner_time_idx ON memory_timeline(owner_id, occurred_at DESC);
