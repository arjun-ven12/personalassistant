CREATE TABLE semantic_symbols (
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  symbol_id char(64) NOT NULL,
  name varchar(255) NOT NULL,
  kind varchar(40) NOT NULL,
  relative_path varchar(1024) NOT NULL,
  line integer NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(repository_id, generation, symbol_id)
);
CREATE INDEX semantic_symbols_lookup_idx
  ON semantic_symbols(repository_id, generation, name, kind);
CREATE INDEX semantic_symbols_file_idx
  ON semantic_symbols(repository_id, generation, relative_path);

CREATE TABLE semantic_imports (
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  source_file varchar(1024) NOT NULL,
  imported_module varchar(512) NOT NULL,
  record jsonb NOT NULL
);
CREATE INDEX semantic_imports_source_idx
  ON semantic_imports(repository_id, generation, source_file);

CREATE TABLE semantic_exports (
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  source_file varchar(1024) NOT NULL,
  exported_name varchar(255) NOT NULL,
  record jsonb NOT NULL
);
CREATE INDEX semantic_exports_name_idx
  ON semantic_exports(repository_id, generation, exported_name);

CREATE TABLE semantic_dependencies (
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  source_file varchar(1024) NOT NULL,
  target_module varchar(512) NOT NULL,
  target_file varchar(1024),
  record jsonb NOT NULL
);
CREATE INDEX semantic_dependencies_source_idx
  ON semantic_dependencies(repository_id, generation, source_file);
CREATE INDEX semantic_dependencies_target_idx
  ON semantic_dependencies(repository_id, generation, target_file);

CREATE TABLE semantic_references (
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  reference_id char(64) NOT NULL,
  name varchar(255) NOT NULL,
  kind varchar(40) NOT NULL,
  target_symbol_id char(64),
  record jsonb NOT NULL,
  PRIMARY KEY(repository_id, generation, reference_id)
);
CREATE INDEX semantic_references_target_idx
  ON semantic_references(repository_id, generation, target_symbol_id, name);

CREATE TABLE semantic_relations (
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  source_symbol_id char(64) NOT NULL,
  relation_kind varchar(40) NOT NULL,
  target_name varchar(255) NOT NULL,
  target_symbol_id char(64),
  record jsonb NOT NULL
);
CREATE INDEX semantic_relations_source_idx
  ON semantic_relations(repository_id, generation, source_symbol_id, relation_kind);

CREATE TABLE api_routes (
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  relative_path varchar(1024) NOT NULL,
  http_method varchar(10) NOT NULL,
  route_path varchar(512) NOT NULL,
  record jsonb NOT NULL
);
CREATE INDEX api_routes_lookup_idx
  ON api_routes(repository_id, generation, http_method, route_path);

CREATE TABLE database_models (
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  model_name varchar(255) NOT NULL,
  model_kind varchar(40) NOT NULL,
  relative_path varchar(1024) NOT NULL,
  record jsonb NOT NULL
);
CREATE INDEX database_models_name_idx
  ON database_models(repository_id, generation, model_name);

CREATE TABLE architecture_nodes (
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  node_id char(64) NOT NULL,
  kind varchar(40) NOT NULL,
  label varchar(255) NOT NULL,
  relative_path varchar(1024),
  record jsonb NOT NULL,
  PRIMARY KEY(repository_id, generation, node_id)
);
CREATE INDEX architecture_nodes_kind_idx
  ON architecture_nodes(repository_id, generation, kind);

CREATE TABLE architecture_edges (
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  source_node_id char(64) NOT NULL,
  target_node_id char(64) NOT NULL,
  relation varchar(40) NOT NULL,
  record jsonb NOT NULL
);
CREATE INDEX architecture_edges_source_idx
  ON architecture_edges(repository_id, generation, source_node_id);

CREATE TABLE repository_insights (
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  workspace_id varchar(100) NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  insight_type varchar(80) NOT NULL,
  severity varchar(20) NOT NULL,
  record jsonb NOT NULL
);
CREATE INDEX repository_insights_type_idx
  ON repository_insights(repository_id, generation, insight_type);
