DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM workspaces
    WHERE jsonb_typeof(record->'blockedPatterns') IS DISTINCT FROM 'array'
  ) THEN
    RAISE EXCEPTION 'Workspace blockedPatterns must be a JSON array before backfill';
  END IF;
END
$$;

UPDATE workspaces
SET record = jsonb_set(
      record,
      '{blockedPatterns}',
      (record->'blockedPatterns') || jsonb_build_array('external-research/'::text),
      false
    ),
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1
WHERE NOT (record->'blockedPatterns' @> '["external-research/"]'::jsonb);
