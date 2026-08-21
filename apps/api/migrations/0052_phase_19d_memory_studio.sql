CREATE TABLE IF NOT EXISTS cognitive_item_controls (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  archived BOOLEAN NOT NULL,
  pinned BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL,
  CONSTRAINT cognitive_item_controls_owner_item_unique UNIQUE (owner_id, item_id)
);

CREATE INDEX IF NOT EXISTS cognitive_item_controls_owner_updated_idx
  ON cognitive_item_controls(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS cognitive_item_usage (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  use_type TEXT NOT NULL,
  source TEXT NOT NULL,
  used_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS cognitive_item_usage_owner_item_idx
  ON cognitive_item_usage(owner_id, item_id, used_at DESC);

CREATE TABLE IF NOT EXISTS cognitive_item_versions (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  change_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS cognitive_item_versions_owner_item_idx
  ON cognitive_item_versions(owner_id, item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cognitive_item_audit_links (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS cognitive_item_audit_links_owner_item_idx
  ON cognitive_item_audit_links(owner_id, item_id, created_at DESC);
