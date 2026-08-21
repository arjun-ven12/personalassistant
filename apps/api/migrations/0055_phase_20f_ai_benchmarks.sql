CREATE TABLE IF NOT EXISTS ai_benchmark_suites (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id),
  suite_key TEXT NOT NULL,
  version TEXT NOT NULL,
  definition JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, suite_key, version)
);

CREATE TABLE IF NOT EXISTS ai_benchmark_runs (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id),
  suite_id UUID NOT NULL REFERENCES ai_benchmark_suites(id),
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  case_count INTEGER NOT NULL CHECK (case_count >= 0),
  metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  safety_critical_failures INTEGER NOT NULL DEFAULT 0 CHECK (safety_critical_failures >= 0),
  paid_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  environment JSONB,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai_benchmark_case_results (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES ai_benchmark_runs(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL,
  status TEXT NOT NULL,
  metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, case_id)
);

CREATE TABLE IF NOT EXISTS ai_benchmark_profiles (
  id BIGSERIAL PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id),
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  sample_count INTEGER NOT NULL CHECK (sample_count >= 0),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, provider_id, model_id)
);

CREATE INDEX IF NOT EXISTS ai_benchmark_runs_owner_started_idx ON ai_benchmark_runs(owner_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ai_benchmark_case_results_run_idx ON ai_benchmark_case_results(run_id);
