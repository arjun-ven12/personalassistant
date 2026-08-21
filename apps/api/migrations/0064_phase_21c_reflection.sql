CREATE TABLE IF NOT EXISTS reflection_artifacts(
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN('REFLECTION','PATTERN','CALIBRATION')),
 updated_at timestamptz NOT NULL,
 record jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS reflection_artifacts_owner_kind_updated_idx ON reflection_artifacts(owner_id,kind,updated_at DESC);
