ALTER TABLE executive_records DROP CONSTRAINT IF EXISTS executive_records_kind_check;
ALTER TABLE executive_records ADD CONSTRAINT executive_records_kind_check
  CHECK (kind IN ('GOAL', 'OBJECTIVE', 'KPI', 'RISK', 'PLAN', 'DECISION', 'HISTORY', 'ALERT'));
