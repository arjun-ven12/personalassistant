-- Derivative accepted Engineering experience; canonical Engineering records remain authoritative.
CREATE TABLE engineering_dataset_records (
  owner_id uuid NOT NULL,
  company_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('POLICY','EXPERIENCE','DIFF','EXAMPLE','EXCLUSION','SNAPSHOT','OWNER_BENCHMARK')),
  record_key text NOT NULL CHECK (length(record_key) BETWEEN 1 AND 80),
  record jsonb NOT NULL CHECK (octet_length(record::text) <= 8388608),
  PRIMARY KEY (owner_id, company_id, kind, record_key),
  CHECK (record->>'ownerId' = owner_id::text AND record->>'companyId' = company_id::text
    AND record->>'kind' = kind AND record->>'key' = record_key)
);
CREATE TABLE athena_coder_controls (
  owner_id uuid PRIMARY KEY,
  record jsonb NOT NULL,
  CHECK (record->>'ownerId' = owner_id::text)
);
