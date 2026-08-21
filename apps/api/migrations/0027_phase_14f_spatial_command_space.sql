CREATE TABLE IF NOT EXISTS spatial_scenes (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  mode text NOT NULL,
  active boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS spatial_scenes_owner_mode_idx
  ON spatial_scenes(owner_id, mode, active);

CREATE TABLE IF NOT EXISTS scene_preferences (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  spatial_mode_enabled boolean NOT NULL,
  selected_scene_id text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS theme_profiles (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  theme text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS visualization_layers (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  scene_id text NOT NULL,
  layer_type text NOT NULL,
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE INDEX IF NOT EXISTS visualization_layers_owner_scene_idx
  ON visualization_layers(owner_id, scene_id, layer_type);

CREATE TABLE IF NOT EXISTS particle_profiles (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  scene_id text NOT NULL,
  density numeric NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS agent_visual_positions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  scene_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, id)
);

CREATE INDEX IF NOT EXISTS agent_visual_positions_owner_entity_idx
  ON agent_visual_positions(owner_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS workflow_visualizations (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  scene_id text NOT NULL,
  visualization_type text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, id)
);

CREATE TABLE IF NOT EXISTS memory_visualizations (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  scene_id text NOT NULL,
  visualization_type text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, id)
);

CREATE TABLE IF NOT EXISTS scene_layouts (
  id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  scene_id text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(owner_id, id)
);

CREATE TABLE IF NOT EXISTS spatial_mode_sessions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  scene_id text NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id, id)
);

CREATE INDEX IF NOT EXISTS spatial_mode_sessions_owner_status_idx
  ON spatial_mode_sessions(owner_id, status, updated_at DESC);
