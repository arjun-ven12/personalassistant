-- Phase 25.3: retain `agents` as the legacy physical name for canonical,
-- owner-scoped definitions and move company-private workforce state to assignments.

CREATE TABLE IF NOT EXISTS agent_catalog_migration_audit (
  owner_id uuid PRIMARY KEY REFERENCES owners(id) ON DELETE RESTRICT,
  existing_agent_records integer NOT NULL,
  unique_semantic_definitions integer NOT NULL,
  company_scoped_records integer NOT NULL,
  duplicate_candidates integer NOT NULL,
  history_bearing_records integer NOT NULL,
  imported_records integer NOT NULL,
  captured_at timestamptz NOT NULL
);

INSERT INTO agent_catalog_migration_audit(
  owner_id,existing_agent_records,unique_semantic_definitions,
  company_scoped_records,duplicate_candidates,history_bearing_records,
  imported_records,captured_at
)
SELECT o.id,
  count(a.id)::integer,
  count(DISTINCT lower(COALESCE(a.record->>'displayName',a.id)))::integer,
  count(a.id) FILTER (WHERE a.company_id IS NOT NULL)::integer,
  (count(a.id)-count(DISTINCT lower(COALESCE(a.record->>'displayName',a.id))))::integer,
  count(a.id) FILTER (WHERE EXISTS (
    SELECT 1 FROM agent_tasks t WHERE t.owner_id=a.owner_id AND t.agent_id=a.id
  ) OR EXISTS (
    SELECT 1 FROM agent_performance p WHERE p.owner_id=a.owner_id AND p.agent_id=a.id
  ))::integer,
  count(a.id) FILTER (WHERE a.record#>>'{workforce,source}'='EVERYTHING_CLAUDE_CODE')::integer,
  NOW()
FROM owners o LEFT JOIN agents a ON a.owner_id=o.id
GROUP BY o.id
ON CONFLICT(owner_id) DO NOTHING;

DROP TRIGGER IF EXISTS assign_default_company ON agents;
ALTER TABLE agents ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS canonical_key text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS definition_record jsonb;

UPDATE agents
SET canonical_key = trim(both '-' FROM regexp_replace(
      lower(COALESCE(record->>'displayName', id)), '[^a-z0-9]+', '-', 'g'
    ))
WHERE canonical_key IS NULL;

UPDATE agents
SET canonical_key = id
WHERE canonical_key IS NULL OR length(canonical_key) < 3;

-- Resolve pre-existing display-name collisions deterministically before enforcing
-- canonical-key uniqueness. Runtime semantic duplicate checks add a second layer.
WITH ranked AS (
  SELECT owner_id,id,canonical_key,
    row_number() OVER (PARTITION BY owner_id,canonical_key ORDER BY id) AS ordinal
  FROM agents
)
UPDATE agents a
SET canonical_key = left(r.canonical_key,140) || '-' || substr(md5(a.id),1,8)
FROM ranked r
WHERE a.owner_id=r.owner_id AND a.id=r.id AND r.ordinal > 1;

UPDATE agents
SET definition_record = jsonb_build_object(
  'id', id,
  'ownerId', owner_id::text,
  'canonicalKey', canonical_key,
  'name', COALESCE(record->>'displayName', id),
  'role', role,
  'description', COALESCE(record#>>'{workforce,description}', record->>'healthSummary', 'Reusable Alexa specialist.'),
  'skills', COALESCE(record#>'{workforce,skills}', record->'supportedTasks', '["domain-analysis"]'::jsonb),
  'capabilityRequirements', COALESCE(record->'capabilities', '["goal.analysis"]'::jsonb),
  'supportedTasks', COALESCE(record->'supportedTasks', '["bounded.work"]'::jsonb),
  'defaultModelPolicy', COALESCE(record#>>'{workforce,modelPolicyId}', 'BALANCED'),
  'defaultSafetyPolicy', 'deny_by_default_v1',
  'defaultOperatingPolicy', COALESCE(record#>>'{workforce,activationPolicyId}', 'lazy_shared_ai_v1'),
  'executionPlacement', COALESCE(record#>>'{workforce,executionPlacement}', 'REMOTE_ALLOWED'),
  'evaluationProfile', COALESCE(record#>'{workforce,evaluationProfile}', '["verified_outcome"]'::jsonb),
  'generalizedReputationPrior', 50,
  'generalizedCalibrationPrior', 0.5,
  'provenance', CASE
    WHEN record#>>'{workforce,source}'='EVERYTHING_CLAUDE_CODE' THEN 'IMPORTED'
    WHEN id LIKE 'native_%' OR id='alexa_governor' THEN 'SYSTEM'
    ELSE 'ALEXA_CREATED'
  END,
  'sourcePath', record#>'{workforce,sourcePath}',
  'sourceVersion', record#>'{workforce,sourceVersion}',
  'license', record#>'{workforce,license}',
  'version', version,
  'status', CASE WHEN status='disabled' THEN 'RETIRED' ELSE 'ACTIVE' END,
  'createdAt', to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'updatedAt', to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
)
WHERE definition_record IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agents_owner_canonical_key_idx
  ON agents(owner_id,canonical_key);

CREATE TABLE IF NOT EXISTS company_agent_assignments (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  agent_definition_id text NOT NULL,
  status text NOT NULL CHECK(status IN ('DORMANT','ACTIVE','PAUSED','REVOKED')),
  department_id uuid,
  manager_assignment_id uuid,
  is_governor boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id,company_id,agent_definition_id),
  UNIQUE(owner_id,company_id,id),
  FOREIGN KEY(owner_id,agent_definition_id)
    REFERENCES agents(owner_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,owner_id)
    REFERENCES companies(id,owner_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS company_agent_assignments_company_status_idx
  ON company_agent_assignments(owner_id,company_id,status,agent_definition_id);
CREATE INDEX IF NOT EXISTS company_agent_assignments_definition_idx
  ON company_agent_assignments(owner_id,agent_definition_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS company_agent_assignments_one_governor_idx
  ON company_agent_assignments(owner_id,company_id) WHERE is_governor AND status<>'REVOKED';

-- Add one reusable Governor definition per owner. Company-specific Governor
-- strategy and memory are represented only by the assignments seeded below.
INSERT INTO agents(
  id,owner_id,role,status,version,created_at,updated_at,record,company_id,
  canonical_key,definition_record
)
SELECT 'alexa_governor',o.id,'engineering_manager','available','1.0.0',NOW(),NOW(),
  jsonb_build_object(
    'schemaVersion','1','id','alexa_governor','ownerId',o.id::text,
    'role','engineering_manager','displayName','Alexa Company Governor','version','1.0.0',
    'status','available','capabilities',jsonb_build_array('goal.analysis','delegation','progress.reporting'),
    'supportedTasks',jsonb_build_array('objective.coordination','workforce.planning'),
    'configuration',jsonb_build_object('runtimeMode','LAZY_SHARED_AI'),
    'createdAt',to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt',to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'healthSummary','Reusable company Governor; runtime activates only for bounded work.'
  ),NULL,'alexa-company-governor',
  jsonb_build_object(
    'id','alexa_governor','ownerId',o.id::text,'canonicalKey','alexa-company-governor',
    'name','Alexa Company Governor','role','engineering_manager',
    'description','Coordinates company objectives and bounded workforce planning without cross-company authority.',
    'skills',jsonb_build_array('strategy','workforce-planning','delegation'),
    'capabilityRequirements',jsonb_build_array('goal.analysis','delegation','progress.reporting'),
    'supportedTasks',jsonb_build_array('objective.coordination','workforce.planning'),
    'defaultModelPolicy','BALANCED','defaultSafetyPolicy','deny_by_default_v1',
    'defaultOperatingPolicy','lazy_owner_or_task_activation_v1','executionPlacement','REMOTE_ALLOWED',
    'evaluationProfile',jsonb_build_array('verified_outcome','policy_compliance'),
    'generalizedReputationPrior',50,'generalizedCalibrationPrior',0.5,
    'provenance','SYSTEM','sourcePath',NULL,'sourceVersion','25.3.0','license',NULL,
    'version','1.0.0','status','ACTIVE',
    'createdAt',to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt',to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
FROM owners o
ON CONFLICT(owner_id,id) DO NOTHING;

WITH governor_assignments AS (
  SELECT c.owner_id,c.id AS company_id,
    (substr(md5(c.owner_id::text || ':' || c.id::text || ':alexa_governor:assignment'),1,8) || '-' ||
     substr(md5(c.owner_id::text || ':' || c.id::text || ':alexa_governor:assignment'),9,4) || '-4' ||
     substr(md5(c.owner_id::text || ':' || c.id::text || ':alexa_governor:assignment'),14,3) || '-8' ||
     substr(md5(c.owner_id::text || ':' || c.id::text || ':alexa_governor:assignment'),18,3) || '-' ||
     substr(md5(c.owner_id::text || ':' || c.id::text || ':alexa_governor:assignment'),21,12))::uuid AS assignment_id,
    COALESCE((SELECT (org.record->>'id')::uuid FROM organizations org
      WHERE org.owner_id=c.owner_id AND org.company_id=c.id ORDER BY org.created_at LIMIT 1),c.id) AS organization_id,
    (SELECT (department.record->>'id')::uuid FROM departments department
      WHERE department.owner_id=c.owner_id AND department.company_id=c.id
      ORDER BY (department.record->>'name'='Executive') DESC,department.created_at LIMIT 1) AS department_id
  FROM companies c
  WHERE c.status IN ('ACTIVE','PAUSED','SUSPENDED')
)
INSERT INTO company_agent_assignments(
  id,owner_id,company_id,agent_definition_id,status,department_id,
  manager_assignment_id,is_governor,created_at,updated_at,record
)
SELECT assignment_id,owner_id,company_id,'alexa_governor','DORMANT',department_id,
  NULL,true,NOW(),NOW(),jsonb_build_object(
    'id',assignment_id::text,'ownerId',owner_id::text,'companyId',company_id::text,
    'agentDefinitionId','alexa_governor','organizationId',organization_id::text,
    'departmentId',CASE WHEN department_id IS NULL THEN NULL ELSE to_jsonb(department_id::text) END,
    'managerAssignmentId',NULL,'managerAgentDefinitionId',NULL,'governorAssignmentId',NULL,
    'status','DORMANT','memoryScopeId','company:' || company_id::text || ':governor',
    'departmentMemoryScopeId',NULL,'organizationMemoryScopeId','company:' || company_id::text || ':organization',
    'capabilityGrantProfileId','company:' || company_id::text || ':governor-capabilities',
    'economyPolicyId','company:' || company_id::text || ':governor-economy',
    'modelPolicyOverride',NULL,'localReputation',NULL,'localCalibration',NULL,
    'companyInstructions',NULL,'isGovernor',true,
    'createdAt',to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt',to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'revokedAt',NULL
  )
FROM governor_assignments
ON CONFLICT(owner_id,company_id,agent_definition_id) DO NOTHING;

WITH source AS (
  SELECT a.*,
    COALESCE(a.company_id,o.default_company_id) AS assignment_company_id,
    (substr(md5(a.owner_id::text || ':' || COALESCE(a.company_id,o.default_company_id)::text || ':' || a.id || ':assignment'),1,8) || '-' ||
     substr(md5(a.owner_id::text || ':' || COALESCE(a.company_id,o.default_company_id)::text || ':' || a.id || ':assignment'),9,4) || '-4' ||
     substr(md5(a.owner_id::text || ':' || COALESCE(a.company_id,o.default_company_id)::text || ':' || a.id || ':assignment'),14,3) || '-8' ||
     substr(md5(a.owner_id::text || ':' || COALESCE(a.company_id,o.default_company_id)::text || ':' || a.id || ':assignment'),18,3) || '-' ||
     substr(md5(a.owner_id::text || ':' || COALESCE(a.company_id,o.default_company_id)::text || ':' || a.id || ':assignment'),21,12))::uuid AS assignment_id
  FROM agents a JOIN owners o ON o.id=a.owner_id
  WHERE COALESCE(a.company_id,o.default_company_id) IS NOT NULL
    AND a.record ? 'workforce'
)
INSERT INTO company_agent_assignments(
  id,owner_id,company_id,agent_definition_id,status,department_id,
  manager_assignment_id,is_governor,created_at,updated_at,record
)
SELECT assignment_id,owner_id,assignment_company_id,id,
  CASE WHEN status='busy' THEN 'ACTIVE' WHEN status='paused' THEN 'PAUSED' ELSE 'DORMANT' END,
  NULLIF(record#>>'{workforce,departmentId}','')::uuid,
  CASE WHEN NULLIF(record#>>'{workforce,managerAgentId}','') IS NULL THEN NULL ELSE
    (substr(md5(owner_id::text || ':' || assignment_company_id::text || ':' || (record#>>'{workforce,managerAgentId}') || ':assignment'),1,8) || '-' ||
     substr(md5(owner_id::text || ':' || assignment_company_id::text || ':' || (record#>>'{workforce,managerAgentId}') || ':assignment'),9,4) || '-4' ||
     substr(md5(owner_id::text || ':' || assignment_company_id::text || ':' || (record#>>'{workforce,managerAgentId}') || ':assignment'),14,3) || '-8' ||
     substr(md5(owner_id::text || ':' || assignment_company_id::text || ':' || (record#>>'{workforce,managerAgentId}') || ':assignment'),18,3) || '-' ||
     substr(md5(owner_id::text || ':' || assignment_company_id::text || ':' || (record#>>'{workforce,managerAgentId}') || ':assignment'),21,12))::uuid END,
  id='alexa_governor',created_at,updated_at,
  jsonb_build_object(
    'id',assignment_id::text,'ownerId',owner_id::text,'companyId',assignment_company_id::text,
    'agentDefinitionId',id,
    'organizationId',COALESCE(record#>>'{workforce,organizationId}',assignment_company_id::text),
    'departmentId',record#>'{workforce,departmentId}',
    'managerAssignmentId',NULL,
    'managerAgentDefinitionId',record#>'{workforce,managerAgentId}',
    'governorAssignmentId',NULL,
    'status',CASE WHEN status='busy' THEN 'ACTIVE' WHEN status='paused' THEN 'PAUSED' ELSE 'DORMANT' END,
    'memoryScopeId','company:' || assignment_company_id::text || ':' || COALESCE(record#>>'{workforce,memoryScopeId}','agent:' || id),
    'departmentMemoryScopeId',CASE WHEN record#>>'{workforce,departmentMemoryScopeId}' IS NULL THEN NULL ELSE to_jsonb('company:' || assignment_company_id::text || ':' || (record#>>'{workforce,departmentMemoryScopeId}')) END,
    'organizationMemoryScopeId','company:' || assignment_company_id::text || ':' || COALESCE(record#>>'{workforce,organizationMemoryScopeId}','organization:' || assignment_company_id::text),
    'capabilityGrantProfileId','company:' || assignment_company_id::text || ':' || COALESCE(record#>>'{workforce,capabilityProfileId}','profile:default'),
    'economyPolicyId','company:' || assignment_company_id::text || ':agent-economy-default',
    'modelPolicyOverride',NULL,'localReputation',NULL,'localCalibration',NULL,
    'companyInstructions',NULL,'isGovernor',id='alexa_governor',
    'createdAt',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt',to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'revokedAt',NULL
  )
FROM source
ON CONFLICT(owner_id,company_id,agent_definition_id) DO NOTHING;

-- The legacy company_id on `agents` no longer carries execution scope. It stays
-- nullable only for rollback compatibility with earlier binaries.
UPDATE agents SET company_id=NULL;

CREATE OR REPLACE FUNCTION alexa_enforce_company_agent_assignment() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM companies c
    WHERE c.id=NEW.company_id AND c.owner_id=NEW.owner_id
  ) THEN RAISE EXCEPTION 'company assignment owner mismatch'; END IF;
  IF NEW.manager_assignment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM company_agent_assignments m
    WHERE m.id=NEW.manager_assignment_id AND m.owner_id=NEW.owner_id
      AND m.company_id=NEW.company_id AND m.status<>'REVOKED'
  ) THEN RAISE EXCEPTION 'manager assignment crosses company boundary'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_company_agent_assignment ON company_agent_assignments;
CREATE CONSTRAINT TRIGGER enforce_company_agent_assignment
  AFTER INSERT OR UPDATE ON company_agent_assignments DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION alexa_enforce_company_agent_assignment();
