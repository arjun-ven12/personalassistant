CREATE TABLE IF NOT EXISTS personality_corpora (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS personality_corpus_versions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS personality_corpus_entries (
  id text NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS personality_corpus_imports (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS personality_corpus_validation_results (
  id uuid NOT NULL,
  owner_id uuid NOT NULL,
  sort_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_personality_corpora_owner_sort ON personality_corpora(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_personality_corpus_versions_owner_sort ON personality_corpus_versions(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_personality_corpus_entries_owner_sort ON personality_corpus_entries(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_personality_corpus_imports_owner_sort ON personality_corpus_imports(owner_id, sort_at DESC);
CREATE INDEX IF NOT EXISTS idx_personality_corpus_validation_results_owner_sort ON personality_corpus_validation_results(owner_id, sort_at DESC);
