ALTER TABLE ai_budget_override_grants
  ADD COLUMN IF NOT EXISTS digest TEXT,
  ADD COLUMN IF NOT EXISTS descriptor_json JSONB,
  ADD COLUMN IF NOT EXISTS agent_id UUID,
  ADD COLUMN IF NOT EXISTS workflow_id UUID,
  ADD COLUMN IF NOT EXISTS task_id UUID,
  ADD COLUMN IF NOT EXISTS cost_center TEXT,
  ADD COLUMN IF NOT EXISTS provider_key TEXT,
  ADD COLUMN IF NOT EXISTS model_key TEXT,
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reservation_id UUID;

UPDATE ai_budget_override_grants
SET digest = COALESCE(digest, md5('legacy-override-' || id::text) || md5('legacy-override-' || id::text))
WHERE digest IS NULL;

ALTER TABLE ai_budget_override_grants
  ALTER COLUMN digest SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_budget_override_owner_digest_uidx
  ON ai_budget_override_grants(owner_id, digest);

CREATE INDEX IF NOT EXISTS ai_budget_override_approval_idx
  ON ai_budget_override_grants(owner_id, approval_id);
