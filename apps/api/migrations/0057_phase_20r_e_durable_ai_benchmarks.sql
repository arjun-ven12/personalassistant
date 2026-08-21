ALTER TABLE ai_benchmark_runs
  ADD COLUMN IF NOT EXISTS suite_key TEXT,
  ADD COLUMN IF NOT EXISTS suite_version TEXT,
  ADD COLUMN IF NOT EXISTS baseline BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS routing_policy_version TEXT,
  ADD COLUMN IF NOT EXISTS context_profile_version TEXT,
  ADD COLUMN IF NOT EXISTS runtime_version TEXT;

UPDATE ai_benchmark_runs AS run
SET suite_key = suite.suite_key,
    suite_version = suite.version
FROM ai_benchmark_suites AS suite
WHERE run.suite_id = suite.id
  AND (run.suite_key IS NULL OR run.suite_version IS NULL);

ALTER TABLE ai_benchmark_runs
  ALTER COLUMN suite_key SET NOT NULL,
  ALTER COLUMN suite_version SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_benchmark_runs_owner_baseline_uidx
  ON ai_benchmark_runs(owner_id, suite_key)
  WHERE baseline = TRUE;

CREATE TABLE IF NOT EXISTS ai_benchmark_regressions (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  baseline_run_id UUID NOT NULL REFERENCES ai_benchmark_runs(id) ON DELETE CASCADE,
  current_run_id UUID NOT NULL REFERENCES ai_benchmark_runs(id) ON DELETE CASCADE,
  regressions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id, baseline_run_id, current_run_id)
);

CREATE INDEX IF NOT EXISTS ai_benchmark_regressions_owner_created_idx
  ON ai_benchmark_regressions(owner_id, created_at DESC);
