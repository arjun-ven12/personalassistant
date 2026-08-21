CREATE TABLE IF NOT EXISTS semantic_recordings (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  recording_id uuid NOT NULL,
  stage text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, recording_id) REFERENCES intent_recordings(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_semantic_recordings_owner_updated
  ON semantic_recordings(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_recordings_owner_recording
  ON semantic_recordings(owner_id, recording_id);

CREATE TABLE IF NOT EXISTS workflow_timelines (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  recording_id uuid NOT NULL,
  generated_skill_id uuid NULL,
  generated_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, recording_id) REFERENCES intent_recordings(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workflow_timelines_owner_updated
  ON workflow_timelines(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_timelines_owner_recording
  ON workflow_timelines(owner_id, recording_id);

CREATE TABLE IF NOT EXISTS generated_skills (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  recording_id uuid NOT NULL,
  timeline_id uuid NOT NULL,
  status text NOT NULL,
  category text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, recording_id) REFERENCES intent_recordings(owner_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (owner_id, timeline_id) REFERENCES workflow_timelines(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_generated_skills_owner_updated
  ON generated_skills(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_skills_owner_status
  ON generated_skills(owner_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS skill_parameters (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL,
  name text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, skill_id) REFERENCES generated_skills(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_parameters_owner_skill
  ON skill_parameters(owner_id, skill_id);

CREATE TABLE IF NOT EXISTS skill_versions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, skill_id) REFERENCES generated_skills(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_versions_owner_skill_created
  ON skill_versions(owner_id, skill_id, created_at DESC);

CREATE TABLE IF NOT EXISTS skill_usage (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL,
  status text NOT NULL,
  executed_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, skill_id) REFERENCES generated_skills(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_usage_owner_executed
  ON skill_usage(owner_id, executed_at DESC);

CREATE TABLE IF NOT EXISTS workflow_validation (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  recording_id uuid NULL,
  skill_id uuid NULL,
  status text NOT NULL,
  validated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_validation_owner_validated
  ON workflow_validation(owner_id, validated_at DESC);

CREATE TABLE IF NOT EXISTS demonstration_workflow_conditions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL,
  condition_type text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, skill_id) REFERENCES generated_skills(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_demonstration_workflow_conditions_owner_skill
  ON demonstration_workflow_conditions(owner_id, skill_id);

CREATE TABLE IF NOT EXISTS demonstration_workflow_dependencies (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL,
  dependency_type text NOT NULL,
  dependency_id text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, skill_id) REFERENCES generated_skills(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_demonstration_workflow_dependencies_owner_skill
  ON demonstration_workflow_dependencies(owner_id, skill_id);
