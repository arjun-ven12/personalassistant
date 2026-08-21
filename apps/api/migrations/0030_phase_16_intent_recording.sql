CREATE TABLE IF NOT EXISTS intent_recordings (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  status text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_intent_recordings_owner_updated
  ON intent_recordings(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS recorded_events (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  recording_id uuid NOT NULL,
  sequence integer NOT NULL,
  source text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, recording_id) REFERENCES intent_recordings(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recorded_events_owner_recording_sequence
  ON recorded_events(owner_id, recording_id, sequence ASC);
CREATE INDEX IF NOT EXISTS idx_recorded_events_owner_occurred
  ON recorded_events(owner_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS workflow_templates (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  recording_id uuid NOT NULL,
  category text NOT NULL,
  risk_level text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, recording_id) REFERENCES intent_recordings(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_owner_updated
  ON workflow_templates(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS generated_commands (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  recording_id uuid NOT NULL,
  template_id uuid NOT NULL,
  status text NOT NULL,
  risk_level text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, recording_id) REFERENCES intent_recordings(owner_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (owner_id, template_id) REFERENCES workflow_templates(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_generated_commands_owner_updated
  ON generated_commands(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_commands_owner_status
  ON generated_commands(owner_id, status);

CREATE TABLE IF NOT EXISTS command_parameters (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  generated_command_id uuid NOT NULL,
  name text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, generated_command_id) REFERENCES generated_commands(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_command_parameters_owner_generated
  ON command_parameters(owner_id, generated_command_id);

CREATE TABLE IF NOT EXISTS command_versions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  generated_command_id uuid NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, generated_command_id) REFERENCES generated_commands(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_command_versions_owner_generated_created
  ON command_versions(owner_id, generated_command_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_analytics (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  generated_command_id uuid NULL,
  recording_id uuid NULL,
  measured_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_analytics_owner_measured
  ON workflow_analytics(owner_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS demonstration_sessions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  recording_id uuid NOT NULL,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, recording_id) REFERENCES intent_recordings(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_demonstration_sessions_owner_updated
  ON demonstration_sessions(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS optimization_suggestions (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  generated_command_id uuid NULL,
  recording_id uuid NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id)
);

CREATE INDEX IF NOT EXISTS idx_optimization_suggestions_owner_created
  ON optimization_suggestions(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS command_dependencies (
  id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  generated_command_id uuid NOT NULL,
  dependency_type text NOT NULL,
  dependency_id text NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id, generated_command_id) REFERENCES generated_commands(owner_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_command_dependencies_owner_generated
  ON command_dependencies(owner_id, generated_command_id);
