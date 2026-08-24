CREATE TABLE IF NOT EXISTS capability_studio_artifacts(
 id uuid NOT NULL,
 owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN('CANDIDATE','EVENT','REQUEST')),
 updated_at timestamptz NOT NULL,
 record jsonb NOT NULL,
 PRIMARY KEY(owner_id,id)
);

CREATE INDEX IF NOT EXISTS capability_studio_artifacts_owner_kind_updated_idx
  ON capability_studio_artifacts(owner_id,kind,updated_at DESC);
