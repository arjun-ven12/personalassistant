CREATE TABLE IF NOT EXISTS skill_evolution_artifacts(
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN('CANDIDATE','SKILL','VERSION','VALIDATION','BENCHMARK','EVALUATION','DRAFT_RUN','DRAFT_RESULT','USAGE','EVENT')),
 updated_at timestamptz NOT NULL,
 record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS skill_evolution_artifacts_owner_kind_updated_idx
  ON skill_evolution_artifacts(owner_id,kind,updated_at DESC);
