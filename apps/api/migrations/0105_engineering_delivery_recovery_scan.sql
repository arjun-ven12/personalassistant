CREATE INDEX IF NOT EXISTS engineering_deliveries_stalled_implementation_idx
  ON engineering_deliveries(updated_at ASC)
  WHERE status = 'IMPLEMENTING';
