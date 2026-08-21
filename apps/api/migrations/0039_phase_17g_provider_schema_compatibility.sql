ALTER TABLE provider_health
  ADD COLUMN IF NOT EXISTS health_score double precision NOT NULL DEFAULT 0;

ALTER TABLE provider_metrics
  ADD COLUMN IF NOT EXISTS measured_at timestamptz;

UPDATE provider_metrics
SET measured_at = NOW()
WHERE measured_at IS NULL;

ALTER TABLE provider_metrics
  ALTER COLUMN measured_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_health_owner_checked
  ON provider_health(owner_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_metrics_owner_measured
  ON provider_metrics(owner_id, measured_at DESC);
