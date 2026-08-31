-- Reusable workforce specialists remain dormant until the scheduler assigns work.
-- Keep database lifecycle constraints aligned with the shared runtime schema.
ALTER TABLE dynamic_agents
  DROP CONSTRAINT IF EXISTS dynamic_agents_lifecycle_status_check;

ALTER TABLE dynamic_agents
  ADD CONSTRAINT dynamic_agents_lifecycle_status_check
  CHECK (lifecycle_status IN (
    'created','initialising','dormant','active','collaborating','completed','retired','archived'
  ));

ALTER TABLE agent_lifecycle
  DROP CONSTRAINT IF EXISTS agent_lifecycle_status_check;

ALTER TABLE agent_lifecycle
  ADD CONSTRAINT agent_lifecycle_status_check
  CHECK (status IN (
    'created','initialising','dormant','active','collaborating','completed','retired','archived'
  ));
