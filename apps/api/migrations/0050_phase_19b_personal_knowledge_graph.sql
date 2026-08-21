CREATE TABLE IF NOT EXISTS knowledge_entities (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  canonical_name text NOT NULL,
  normalized_name text NOT NULL,
  source_type text NOT NULL,
  source_id text,
  confidence double precision NOT NULL,
  status text NOT NULL,
  first_observed_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  is_archived boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  data jsonb NOT NULL,
  UNIQUE(owner_id, entity_type, normalized_name)
);

CREATE INDEX IF NOT EXISTS knowledge_entities_owner_type_idx
  ON knowledge_entities(owner_id, entity_type, is_archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_entities_owner_name_idx
  ON knowledge_entities(owner_id, normalized_name);
CREATE INDEX IF NOT EXISTS knowledge_entities_source_idx
  ON knowledge_entities(owner_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS knowledge_entities_confidence_idx
  ON knowledge_entities(owner_id, confidence DESC);

CREATE TABLE IF NOT EXISTS knowledge_entity_aliases (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  normalized_alias text NOT NULL,
  confidence double precision NOT NULL,
  source_type text NOT NULL,
  source_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  data jsonb NOT NULL,
  UNIQUE(owner_id, normalized_alias, entity_id)
);

CREATE INDEX IF NOT EXISTS knowledge_entity_aliases_lookup_idx
  ON knowledge_entity_aliases(owner_id, normalized_alias);
CREATE INDEX IF NOT EXISTS knowledge_entity_aliases_entity_idx
  ON knowledge_entity_aliases(owner_id, entity_id);

CREATE TABLE IF NOT EXISTS knowledge_relationships (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  source_entity_id uuid NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  target_entity_id uuid NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  source_type text NOT NULL,
  source_id text,
  confidence double precision NOT NULL,
  strength double precision NOT NULL,
  evidence_count integer NOT NULL,
  first_observed_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  valid_from timestamptz,
  valid_until timestamptz,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  data jsonb NOT NULL,
  UNIQUE(owner_id, source_entity_id, target_entity_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS knowledge_relationships_source_idx
  ON knowledge_relationships(owner_id, source_entity_id, relationship_type, is_archived);
CREATE INDEX IF NOT EXISTS knowledge_relationships_target_idx
  ON knowledge_relationships(owner_id, target_entity_id, relationship_type, is_archived);
CREATE INDEX IF NOT EXISTS knowledge_relationships_type_idx
  ON knowledge_relationships(owner_id, relationship_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_relationships_confidence_idx
  ON knowledge_relationships(owner_id, confidence DESC);

CREATE TABLE IF NOT EXISTS knowledge_facts (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  subject_entity_id uuid NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  predicate text NOT NULL,
  value_type text NOT NULL,
  source_type text NOT NULL,
  source_id text,
  confidence double precision NOT NULL,
  valid_from timestamptz,
  valid_until timestamptz,
  first_observed_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS knowledge_facts_subject_idx
  ON knowledge_facts(owner_id, subject_entity_id, predicate, is_archived);
CREATE INDEX IF NOT EXISTS knowledge_facts_predicate_idx
  ON knowledge_facts(owner_id, predicate, updated_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_evidence (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  relationship_id uuid REFERENCES knowledge_relationships(id) ON DELETE CASCADE,
  fact_id uuid REFERENCES knowledge_facts(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id text,
  confidence double precision NOT NULL,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS knowledge_evidence_entity_idx
  ON knowledge_evidence(owner_id, entity_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_evidence_relationship_idx
  ON knowledge_evidence(owner_id, relationship_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_evidence_fact_idx
  ON knowledge_evidence(owner_id, fact_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_evidence_source_idx
  ON knowledge_evidence(owner_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS knowledge_conflicts (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES knowledge_entities(id) ON DELETE SET NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  resolved_at timestamptz,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS knowledge_conflicts_owner_status_idx
  ON knowledge_conflicts(owner_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_entity_versions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  version integer NOT NULL,
  created_at timestamptz NOT NULL,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS knowledge_entity_versions_entity_idx
  ON knowledge_entity_versions(owner_id, entity_id, version DESC);

CREATE TABLE IF NOT EXISTS knowledge_relationship_versions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  relationship_id uuid NOT NULL REFERENCES knowledge_relationships(id) ON DELETE CASCADE,
  version integer NOT NULL,
  created_at timestamptz NOT NULL,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS knowledge_relationship_versions_relationship_idx
  ON knowledge_relationship_versions(owner_id, relationship_id, version DESC);

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id text,
  title text NOT NULL,
  confidence double precision NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  data jsonb NOT NULL,
  UNIQUE(owner_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS knowledge_sources_owner_type_idx
  ON knowledge_sources(owner_id, source_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_promotions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  memory_id uuid NOT NULL,
  status text NOT NULL,
  confidence double precision NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  data jsonb NOT NULL,
  UNIQUE(owner_id, memory_id)
);

CREATE INDEX IF NOT EXISTS knowledge_promotions_owner_status_idx
  ON knowledge_promotions(owner_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_graph_events (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_id uuid,
  relationship_id uuid,
  fact_id uuid,
  created_at timestamptz NOT NULL,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS knowledge_graph_events_owner_time_idx
  ON knowledge_graph_events(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_entity_embeddings (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  memory_id uuid,
  embedding_reference text,
  created_at timestamptz NOT NULL,
  data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS knowledge_entity_embeddings_entity_idx
  ON knowledge_entity_embeddings(owner_id, entity_id, created_at DESC);
