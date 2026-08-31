-- Adapter SDK contracts are configuration snapshots. Earlier application
-- registrations could accumulate duplicate capability records, causing a
-- snapshot to exceed its bounded capability array on read. Keep the first
-- declared value of each capability and preserve the existing contract limit.

UPDATE adapter_sdk_contracts
SET record = jsonb_set(
  record,
  '{capabilities}',
  (
    SELECT jsonb_agg(item.capability ORDER BY item.first_ordinality)
    FROM (
      SELECT capability, MIN(ordinality) AS first_ordinality
      FROM jsonb_array_elements(record->'capabilities') WITH ORDINALITY AS values(capability, ordinality)
      GROUP BY capability
      ORDER BY MIN(ordinality)
      LIMIT 80
    ) AS item
  ),
  false
)
WHERE jsonb_typeof(record->'capabilities') = 'array'
  AND jsonb_array_length(record->'capabilities') > 80;

UPDATE adapter_sandboxes
SET record = jsonb_set(
  record,
  '{allowedCapabilities}',
  (
    SELECT jsonb_agg(item.capability ORDER BY item.first_ordinality)
    FROM (
      SELECT capability, MIN(ordinality) AS first_ordinality
      FROM jsonb_array_elements(record->'allowedCapabilities') WITH ORDINALITY AS values(capability, ordinality)
      GROUP BY capability
      ORDER BY MIN(ordinality)
      LIMIT 80
    ) AS item
  ),
  false
)
WHERE jsonb_typeof(record->'allowedCapabilities') = 'array'
  AND jsonb_array_length(record->'allowedCapabilities') > 80;
