-- Derivative training/model provenance; canonical Engineering remains the execution authority.
ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS content_sha256 char(64);
CREATE TABLE athena_distillation_runs (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 80),
  version integer NOT NULL CHECK (version >= 0),
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL CHECK (octet_length(record::text) <= 1048576),
  PRIMARY KEY (owner_id, company_id, id),
  UNIQUE (owner_id, company_id, idempotency_key),
  CHECK (jsonb_typeof(record) = 'object'),
  CHECK ((jsonb_typeof(record->'ownerId') = 'string' AND jsonb_typeof(record->'companyId') = 'string'
    AND jsonb_typeof(record->'id') = 'string' AND jsonb_typeof(record->'version') = 'number'
    AND jsonb_typeof(record->'request') = 'object' AND jsonb_typeof(record->'request'->'idempotencyKey') = 'string') IS TRUE),
  CHECK ((record->>'ownerId' = owner_id::text AND record->>'companyId' = company_id::text
    AND record->>'id' = id::text AND record->>'version' = version::text
    AND record->'request'->>'idempotencyKey' = idempotency_key) IS TRUE)
);
CREATE INDEX athena_distillation_recent ON athena_distillation_runs(owner_id,company_id,created_at DESC);
-- Current AthenaCoder controls are owner-wide: only one active trained version per owner.
CREATE UNIQUE INDEX athena_distillation_active_owner ON athena_distillation_runs(owner_id)
  WHERE record->>'activation' = 'ACTIVE';

-- Forward hardening: do not edit applied Phase 28.5 SQL. Invalid legacy rows fail the release.
ALTER TABLE engineering_dataset_records ADD CONSTRAINT engineering_dataset_identity_known
  CHECK (jsonb_typeof(record) = 'object' AND
    (jsonb_typeof(record->'ownerId') = 'string' AND jsonb_typeof(record->'companyId') = 'string'
     AND jsonb_typeof(record->'kind') = 'string' AND jsonb_typeof(record->'key') = 'string') IS TRUE AND
    (record->>'ownerId' = owner_id::text AND record->>'companyId' = company_id::text
     AND record->>'kind' = kind AND record->>'key' = record_key) IS TRUE);
ALTER TABLE athena_coder_controls ADD CONSTRAINT athena_coder_identity_known
  CHECK (jsonb_typeof(record) = 'object' AND (jsonb_typeof(record->'ownerId') = 'string') IS TRUE AND (record->>'ownerId' = owner_id::text) IS TRUE);
