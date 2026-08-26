CREATE TABLE IF NOT EXISTS workforce_runtime_tasks(
  id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  status TEXT NOT NULL, assigned_agent_id TEXT, root_task_id UUID NOT NULL, parent_task_id UUID,
  created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, record JSONB NOT NULL,
  FOREIGN KEY(owner_id, assigned_agent_id) REFERENCES agents(owner_id, id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS workforce_runtime_tasks_queue_idx ON workforce_runtime_tasks(owner_id,status,created_at);
CREATE INDEX IF NOT EXISTS workforce_runtime_tasks_root_idx ON workforce_runtime_tasks(owner_id,root_task_id);

CREATE TABLE IF NOT EXISTS workforce_runtime_messages(
  id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES workforce_runtime_tasks(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, record JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS workforce_runtime_messages_task_idx ON workforce_runtime_messages(owner_id,task_id,created_at DESC);

CREATE TABLE IF NOT EXISTS workforce_runtime_reviews(
  id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES workforce_runtime_tasks(id) ON DELETE CASCADE,
  reviewer_agent_id TEXT NOT NULL, verdict TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, record JSONB NOT NULL,
  FOREIGN KEY(owner_id, reviewer_agent_id) REFERENCES agents(owner_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS workforce_runtime_reviews_task_idx ON workforce_runtime_reviews(owner_id,task_id,created_at DESC);
