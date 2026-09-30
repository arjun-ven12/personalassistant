-- Older terminal execution requests stored PostgreSQL's timestamp rendering in
-- JSON instead of the ISO string required by the shared execution schema.
-- Preserve all request identities, statuses, arguments, and other evidence.
UPDATE execution_requests
SET record = jsonb_set(
  record,
  '{completedAt}',
  to_jsonb(to_char(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
)
WHERE completed_at IS NOT NULL
  AND record->>'completedAt' IS NOT NULL
  AND record->>'completedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$';
