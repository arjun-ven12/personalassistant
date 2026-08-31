-- Older dynamic-agent records may have been persisted before the current
-- 50-capability runtime profile limit was enforced. Normalize only those invalid
-- records so their dashboards and workflow composition can be read again.
-- The retained order is the original declared order; overflow capabilities are
-- deliberately not silently granted through a malformed specialist profile.

UPDATE dynamic_agents
SET record = jsonb_set(
  record,
  '{capabilities}',
  (
    SELECT jsonb_agg(item.capability ORDER BY item.ordinality)
    FROM jsonb_array_elements(record->'capabilities') WITH ORDINALITY AS item(capability, ordinality)
    WHERE item.ordinality <= 50
  ),
  false
)
WHERE jsonb_typeof(record->'capabilities') = 'array'
  AND jsonb_array_length(record->'capabilities') > 50;

UPDATE agent_templates
SET record = jsonb_set(
  record,
  '{capabilities}',
  (
    SELECT jsonb_agg(item.capability ORDER BY item.ordinality)
    FROM jsonb_array_elements(record->'capabilities') WITH ORDINALITY AS item(capability, ordinality)
    WHERE item.ordinality <= 50
  ),
  false
)
WHERE jsonb_typeof(record->'capabilities') = 'array'
  AND jsonb_array_length(record->'capabilities') > 50;
