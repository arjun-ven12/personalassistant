CREATE INDEX IF NOT EXISTS engineering_deliveries_stalled_preview_idx
  ON engineering_deliveries(updated_at ASC)
  WHERE status = 'PREVIEWING';
