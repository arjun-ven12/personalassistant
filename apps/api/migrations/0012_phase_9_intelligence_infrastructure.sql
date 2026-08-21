CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;
SELECT set_config('search_path', current_schema() || ',public', false);

ALTER TABLE memory_embeddings
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS target_type text DEFAULT 'memory' NOT NULL,
  ADD COLUMN IF NOT EXISTS target_id text DEFAULT '' NOT NULL;

CREATE INDEX IF NOT EXISTS memory_embeddings_vector_idx
  ON memory_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;

CREATE TABLE embedding_jobs (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  memory_id uuid REFERENCES memories(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  status text NOT NULL,
  attempts integer NOT NULL,
  last_error_code text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (target_type IN (
    'memory','decision','repository','agent','workflow','knowledge_node'
  )),
  CHECK (provider IN ('openai','disabled')),
  CHECK (status IN ('queued','running','succeeded','failed','cancelled','retrying')),
  CHECK (attempts >= 0)
);

CREATE INDEX embedding_jobs_owner_status_idx ON embedding_jobs(owner_id, status, created_at DESC);

CREATE TABLE cache_metrics (
  id uuid PRIMARY KEY,
  owner_id uuid REFERENCES owners(id) ON DELETE CASCADE,
  namespace text NOT NULL,
  metric_name text NOT NULL,
  metric_value double precision NOT NULL,
  recorded_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(namespace) BETWEEN 1 AND 120),
  CHECK (length(metric_name) BETWEEN 1 AND 120)
);

CREATE INDEX cache_metrics_namespace_time_idx ON cache_metrics(namespace, recorded_at DESC);

CREATE TABLE retrieval_logs (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  query text NOT NULL,
  mode text NOT NULL,
  result_count integer NOT NULL,
  latency_ms double precision NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(query) BETWEEN 1 AND 500),
  CHECK (mode IN ('keyword','vector','hybrid')),
  CHECK (result_count >= 0),
  CHECK (latency_ms >= 0)
);

CREATE INDEX retrieval_logs_owner_time_idx ON retrieval_logs(owner_id, created_at DESC);

CREATE TABLE worker_jobs (
  id uuid PRIMARY KEY,
  owner_id uuid REFERENCES owners(id) ON DELETE CASCADE,
  queue_name text NOT NULL,
  job_type text NOT NULL,
  status text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  run_after timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (status IN ('queued','running','succeeded','failed','cancelled','retrying')),
  CHECK (attempts >= 0),
  CHECK (length(queue_name) BETWEEN 1 AND 120),
  CHECK (length(job_type) BETWEEN 1 AND 120)
);

CREATE INDEX worker_jobs_queue_status_idx ON worker_jobs(queue_name, status, priority DESC, run_after ASC);

CREATE TABLE worker_history (
  id uuid PRIMARY KEY,
  worker_id text NOT NULL,
  job_id uuid,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(worker_id) BETWEEN 1 AND 120),
  CHECK (length(event_type) BETWEEN 1 AND 120)
);

CREATE INDEX worker_history_worker_time_idx ON worker_history(worker_id, created_at DESC);

CREATE TABLE semantic_queries (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  query_hash text NOT NULL,
  mode text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (mode IN ('keyword','vector','hybrid')),
  CHECK (length(query_hash) BETWEEN 16 AND 255)
);

CREATE INDEX semantic_queries_owner_time_idx ON semantic_queries(owner_id, created_at DESC);

CREATE TABLE cache_events (
  id uuid PRIMARY KEY,
  namespace text NOT NULL,
  event_type text NOT NULL,
  cache_key text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(namespace) BETWEEN 1 AND 120),
  CHECK (length(event_type) BETWEEN 1 AND 120),
  CHECK (length(cache_key) BETWEEN 1 AND 500)
);

CREATE INDEX cache_events_namespace_time_idx ON cache_events(namespace, created_at DESC);

CREATE TABLE queue_events (
  id uuid PRIMARY KEY,
  queue_name text NOT NULL,
  event_type text NOT NULL,
  job_id uuid,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(queue_name) BETWEEN 1 AND 120),
  CHECK (length(event_type) BETWEEN 1 AND 120)
);

CREATE INDEX queue_events_queue_time_idx ON queue_events(queue_name, created_at DESC);

CREATE TABLE infrastructure_metrics (
  id uuid PRIMARY KEY,
  metric_scope text NOT NULL,
  metric_name text NOT NULL,
  metric_value double precision NOT NULL,
  recorded_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (length(metric_scope) BETWEEN 1 AND 120),
  CHECK (length(metric_name) BETWEEN 1 AND 120)
);

CREATE INDEX infrastructure_metrics_scope_time_idx
  ON infrastructure_metrics(metric_scope, recorded_at DESC);
