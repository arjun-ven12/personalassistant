CREATE INDEX IF NOT EXISTS engineering_deliveries_stalled_integration_idx
  ON engineering_deliveries(updated_at ASC)
  WHERE status = 'INTEGRATING';
