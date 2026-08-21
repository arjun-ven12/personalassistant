CREATE TABLE engineering_goals (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  priority text NOT NULL,
  status text NOT NULL,
  completion_percent integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (priority IN ('low','medium','high','critical')),
  CHECK (status IN ('proposed','planned','active','blocked','completed','cancelled')),
  CHECK (completion_percent BETWEEN 0 AND 100)
);

CREATE INDEX engineering_goals_owner_status_idx
  ON engineering_goals(owner_id, status, priority, updated_at DESC);

CREATE TABLE goal_dependencies (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES engineering_goals(id) ON DELETE CASCADE,
  dependency_goal_id uuid NOT NULL REFERENCES engineering_goals(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (goal_id, dependency_goal_id),
  CHECK (goal_id <> dependency_goal_id)
);

CREATE INDEX goal_dependencies_owner_idx ON goal_dependencies(owner_id, goal_id);

CREATE TABLE goal_progress (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES engineering_goals(id) ON DELETE CASCADE,
  progress_percent integer NOT NULL,
  note text NOT NULL,
  recorded_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (progress_percent BETWEEN 0 AND 100),
  CHECK (length(note) BETWEEN 1 AND 1000)
);

CREATE INDEX goal_progress_goal_time_idx ON goal_progress(goal_id, recorded_at DESC);

CREATE TABLE strategic_plans (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES engineering_goals(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX strategic_plans_goal_time_idx ON strategic_plans(goal_id, updated_at DESC);

CREATE TABLE technical_debt (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  repository_id uuid REFERENCES repositories(id) ON DELETE SET NULL,
  severity text NOT NULL,
  priority text NOT NULL,
  trend text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (severity IN ('low','medium','high','critical')),
  CHECK (priority IN ('low','medium','high','critical')),
  CHECK (trend IN ('improving','stable','worsening','unknown'))
);

CREATE INDEX technical_debt_owner_priority_idx
  ON technical_debt(owner_id, priority, severity, updated_at DESC);

CREATE TABLE engineering_risks (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  repository_id uuid REFERENCES repositories(id) ON DELETE SET NULL,
  category text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL,
  likelihood double precision NOT NULL,
  impact double precision NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (category IN (
    'security','performance','maintainability','scalability','availability',
    'compliance','testing','deployment','technical_debt','business_impact'
  )),
  CHECK (severity IN ('low','medium','high','critical')),
  CHECK (status IN ('open','mitigated','accepted','monitoring')),
  CHECK (likelihood BETWEEN 0 AND 1),
  CHECK (impact BETWEEN 0 AND 1)
);

CREATE INDEX engineering_risks_owner_status_idx
  ON engineering_risks(owner_id, status, severity, updated_at DESC);

CREATE TABLE repository_health (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  overall integer NOT NULL,
  trend text NOT NULL,
  assessed_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (overall BETWEEN 0 AND 100),
  CHECK (trend IN ('improving','stable','worsening','unknown'))
);

CREATE INDEX repository_health_owner_time_idx
  ON repository_health(owner_id, assessed_at DESC);
CREATE INDEX repository_health_repository_time_idx
  ON repository_health(repository_id, assessed_at DESC);

CREATE TABLE architecture_health (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  repository_id uuid REFERENCES repositories(id) ON DELETE CASCADE,
  score integer NOT NULL,
  drift text NOT NULL,
  coupling_risk text NOT NULL,
  assessed_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (score BETWEEN 0 AND 100),
  CHECK (drift IN ('none','low','medium','high','unknown')),
  CHECK (coupling_risk IN ('low','medium','high','critical'))
);

CREATE INDEX architecture_health_owner_time_idx
  ON architecture_health(owner_id, assessed_at DESC);

CREATE TABLE recommendations (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  repository_id uuid REFERENCES repositories(id) ON DELETE SET NULL,
  category text NOT NULL,
  priority text NOT NULL,
  status text NOT NULL,
  confidence double precision NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (category IN (
    'architecture','performance','security','infrastructure','testing',
    'documentation','refactoring','developer_experience','reliability','cost_optimisation'
  )),
  CHECK (priority IN ('low','medium','high','critical')),
  CHECK (status IN ('open','accepted','dismissed','superseded')),
  CHECK (confidence BETWEEN 0 AND 1)
);

CREATE INDEX recommendations_owner_status_idx
  ON recommendations(owner_id, status, priority, updated_at DESC);

CREATE TABLE opportunities (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  repository_id uuid REFERENCES repositories(id) ON DELETE SET NULL,
  category text NOT NULL,
  priority text NOT NULL,
  detected_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (category IN (
    'architecture','performance','security','infrastructure','testing',
    'documentation','refactoring','developer_experience','reliability','cost_optimisation'
  )),
  CHECK (priority IN ('low','medium','high','critical'))
);

CREATE INDEX opportunities_owner_time_idx ON opportunities(owner_id, detected_at DESC);

CREATE TABLE roadmaps (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  horizon text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (horizon IN ('30_days','90_days','180_days','1_year'))
);

CREATE INDEX roadmaps_owner_time_idx ON roadmaps(owner_id, updated_at DESC);

CREATE TABLE roadmap_items (
  id uuid PRIMARY KEY,
  roadmap_id uuid NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  priority text NOT NULL,
  status text NOT NULL,
  item_order integer NOT NULL,
  record jsonb NOT NULL,
  CHECK (priority IN ('low','medium','high','critical')),
  CHECK (status IN ('not_started','in_progress','blocked','done')),
  CHECK (item_order >= 0)
);

CREATE INDEX roadmap_items_roadmap_order_idx
  ON roadmap_items(roadmap_id, item_order ASC);

CREATE TABLE release_assessments (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  repository_id uuid REFERENCES repositories(id) ON DELETE SET NULL,
  status text NOT NULL,
  score integer NOT NULL,
  assessed_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (status IN ('ready','needs_work','blocked')),
  CHECK (score BETWEEN 0 AND 100)
);

CREATE INDEX release_assessments_owner_time_idx
  ON release_assessments(owner_id, assessed_at DESC);

CREATE TABLE simulation_runs (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  risk text NOT NULL,
  rollback_complexity text NOT NULL,
  confidence double precision NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (risk IN ('low','medium','high','critical')),
  CHECK (rollback_complexity IN ('low','medium','high','critical')),
  CHECK (confidence BETWEEN 0 AND 1)
);

CREATE INDEX simulation_runs_owner_time_idx
  ON simulation_runs(owner_id, created_at DESC);

CREATE TABLE engineering_metrics (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  average_repository_health integer NOT NULL,
  release_readiness text NOT NULL,
  recorded_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CHECK (average_repository_health BETWEEN 0 AND 100),
  CHECK (release_readiness IN ('ready','needs_work','blocked'))
);

CREATE INDEX engineering_metrics_owner_time_idx
  ON engineering_metrics(owner_id, recorded_at DESC);
