-- Phase 25.2 keeps `companies` as the canonical tenant and adds only bounded,
-- resumable bootstrap metadata. It does not create workers, model sessions,
-- provider accounts, credentials, or funded economy balances.
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_status_check;
ALTER TABLE companies ADD CONSTRAINT companies_status_check CHECK (
  status IN ('DRAFT','PROVISIONING','ACTIVE','PAUSED','SUSPENDED','ARCHIVED','FAILED_PROVISIONING')
);

CREATE TABLE IF NOT EXISTS company_provisioning (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(owner_id,idempotency_key),
  UNIQUE(owner_id,company_id)
);
CREATE INDEX IF NOT EXISTS company_provisioning_owner_status_idx
  ON company_provisioning(owner_id,status,updated_at);

CREATE TABLE IF NOT EXISTS owner_company_limits (
  owner_id uuid PRIMARY KEY REFERENCES owners(id) ON DELETE RESTRICT,
  company_limit integer NOT NULL CHECK (company_limit BETWEEN 1 AND 100),
  updated_at timestamptz NOT NULL
);

UPDATE companies
SET record = record || jsonb_build_object(
  'settings', jsonb_build_object(
    'description', NULL, 'industry', NULL, 'businessModel', NULL,
    'jurisdiction', NULL, 'defaultLanguage', 'en', 'riskTolerance', 'LOW',
    'autonomyLevel', 'SUPERVISED', 'defaultApprovalPolicy', 'SUPERVISED',
    'starterCredits', 0
  ),
  'memoryScopeId', 'company:' || id::text || ':memory',
  'economyAccountId', 'company:' || id::text || ':economy',
  'governanceProfileId', 'company:' || id::text || ':governance',
  'capabilityProfileId', 'company:' || id::text || ':capabilities',
  'credentialScopeId', 'company:' || id::text || ':credentials',
  'governorAgentId', 'company:' || id::text || ':governor:dormant',
  'activatedAt', CASE WHEN status='ACTIVE' THEN to_jsonb(updated_at) ELSE 'null'::jsonb END,
  'pausedAt', CASE WHEN status='PAUSED' THEN to_jsonb(updated_at) ELSE 'null'::jsonb END,
  'suspendedAt', 'null'::jsonb,
  'archivedAt', CASE WHEN status='ARCHIVED' THEN to_jsonb(updated_at) ELSE 'null'::jsonb END
)
WHERE NOT (record ? 'settings');

WITH seeded AS (
  SELECT c.*,
    jsonb_agg(jsonb_build_object(
      'name', step_name,
      'status', 'COMPLETED',
      'attempts', 1,
      'errorCode', NULL,
      'completedAt', c.updated_at,
      'updatedAt', c.updated_at
    ) ORDER BY ordinal) AS steps
  FROM companies c
  CROSS JOIN unnest(ARRAY[
    'COMPANY_CREATED','MEMORY_SCOPE_READY','ECONOMY_ACCOUNT_READY',
    'GOVERNANCE_PROFILE_READY','CAPABILITY_PROFILE_READY','CREDENTIAL_SCOPE_READY',
    'GOVERNOR_PLACEHOLDER_READY','VALIDATED','ACTIVATED'
  ]) WITH ORDINALITY AS s(step_name,ordinal)
  WHERE c.status IN ('ACTIVE','PAUSED','SUSPENDED','ARCHIVED')
  GROUP BY c.id
)
INSERT INTO company_provisioning(company_id,owner_id,idempotency_key,status,record,created_at,updated_at)
SELECT id,owner_id,'legacy:' || id::text,'COMPLETED',jsonb_build_object(
  'companyId',id::text,'ownerId',owner_id::text,'idempotencyKey','legacy:' || id::text,
  'status','COMPLETED','steps',steps,'lastErrorCode',NULL,
  'createdAt',created_at,'updatedAt',updated_at
),created_at,updated_at
FROM seeded
ON CONFLICT(company_id) DO NOTHING;
