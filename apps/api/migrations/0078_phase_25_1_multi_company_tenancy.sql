CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE','PAUSED','ARCHIVED')),
  timezone text,
  default_currency char(3),
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(owner_id, slug),
  UNIQUE(owner_id, id)
);
CREATE INDEX IF NOT EXISTS companies_owner_status_idx ON companies(owner_id,status,created_at);

CREATE TABLE IF NOT EXISTS company_memberships (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  principal_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  principal_type text NOT NULL CHECK (principal_type='OWNER'),
  role text NOT NULL CHECK (role='OWNER'),
  status text NOT NULL CHECK (status IN ('ACTIVE','REVOKED')),
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(company_id,principal_id)
);
CREATE INDEX IF NOT EXISTS company_memberships_principal_idx ON company_memberships(principal_id,status,company_id);

ALTER TABLE owners ADD COLUMN IF NOT EXISTS default_company_id uuid;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_company_id uuid;

WITH defaults AS (
  SELECT id AS owner_id,
    (substr(md5(id::text || ':alexa-default-company'),1,8) || '-' || substr(md5(id::text || ':alexa-default-company'),9,4) || '-4' || substr(md5(id::text || ':alexa-default-company'),14,3) || '-8' || substr(md5(id::text || ':alexa-default-company'),18,3) || '-' || substr(md5(id::text || ':alexa-default-company'),21,12))::uuid AS company_id,
    created_at
  FROM owners
)
INSERT INTO companies(id,owner_id,slug,name,status,timezone,default_currency,record,created_at,updated_at)
SELECT company_id,owner_id,'default-company','Default Company','ACTIVE',NULL,NULL,
  jsonb_build_object('id',company_id::text,'ownerId',owner_id::text,'slug','default-company','name','Default Company','status','ACTIVE','timezone',NULL,'defaultCurrency',NULL,'createdAt',created_at,'updatedAt',created_at),
  created_at,created_at
FROM defaults
ON CONFLICT(owner_id,slug) DO NOTHING;

INSERT INTO company_memberships(company_id,principal_id,principal_type,role,status,record,created_at,updated_at)
SELECT c.id,c.owner_id,'OWNER','OWNER','ACTIVE',
  jsonb_build_object('companyId',c.id::text,'principalId',c.owner_id::text,'principalType','OWNER','role','OWNER','status','ACTIVE','createdAt',c.created_at,'updatedAt',c.created_at),
  c.created_at,c.created_at
FROM companies c
ON CONFLICT(company_id,principal_id) DO NOTHING;

UPDATE owners o SET default_company_id=(
  SELECT c.id FROM companies c WHERE c.owner_id=o.id AND c.status='ACTIVE'
  ORDER BY (c.slug='default-company') DESC,c.created_at,c.id LIMIT 1
) WHERE o.default_company_id IS NULL;
UPDATE sessions s SET active_company_id=o.default_company_id FROM owners o
WHERE s.owner_id=o.id AND s.active_company_id IS NULL;

ALTER TABLE owners DROP CONSTRAINT IF EXISTS owners_default_company_fk;
ALTER TABLE owners ADD CONSTRAINT owners_default_company_fk FOREIGN KEY(default_company_id) REFERENCES companies(id) ON DELETE RESTRICT;
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_active_company_fk;
ALTER TABLE sessions ADD CONSTRAINT sessions_active_company_fk FOREIGN KEY(active_company_id) REFERENCES companies(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION alexa_assign_default_company() RETURNS trigger AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.owner_id IS NOT NULL THEN
    SELECT default_company_id INTO NEW.company_id FROM owners WHERE id=NEW.owner_id;
  END IF;
  IF NEW.company_id IS NULL THEN RAISE EXCEPTION 'company context is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id=NEW.company_id AND owner_id=NEW.owner_id) THEN
    RAISE EXCEPTION 'company and owner scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  target_table text;
  scoped_tables text[] := ARRAY[
    'applications','workspaces','approval_requests','policy_evaluations','repositories','patches','validations','capability_registry',
    'workflows','workflow_tasks','workflow_events','workflow_progress','workflow_reports','workflow_metrics','workflow_history','workflow_artifacts',
    'integrations','integration_credentials','integration_permissions','integration_events','integration_usage','agents','agent_sessions','agent_tasks','agent_messages','agent_context','agent_consensus','agent_conflicts','agent_health','agent_metrics','agent_history','delegations',
    'memories','memory_embeddings','knowledge_nodes','knowledge_edges','engineering_decisions','repository_memory','agent_memory','learning_events','memory_clusters','memory_suggestions','memory_timeline',
    'agent_templates','agent_capabilities','dynamic_agents','agent_lifecycle','agent_performance','agent_usage','agent_promotions','team_compositions','dynamic_agent_memory',
    'agent_manifests','agent_packages','agent_os_sessions','agent_runtime_events','agent_configurations','agent_os_permission_profiles','agent_os_knowledge_sources','agent_os_versions','agent_os_health','agent_os_metrics','agent_os_context_packages',
    'working_memory','episodic_memory','semantic_memory','procedural_memory','memory_relationships','experience_store','decision_log','agent_specializations','reflection_reports','confidence_history','goal_tracking','agent_cognitive_states','agent_learning_events','memory_consolidation','cognitive_metrics',
    'agent_expertise','expertise_history','evolution_proposals','capability_versions','prompt_versions','reasoning_versions','workflow_improvements','knowledge_improvements','failure_history','success_history','benchmark_results','evolution_timeline','self_evaluations',
    'organizations','departments','organizational_roles','teams','team_members','agent_society_delegations','debates','debate_arguments','consensus_sessions','peer_reviews','mentorships','conflicts','meetings','meeting_minutes','communications','reputation_scores','collaboration_edges','organizational_metrics','organizational_memory',
    'tasks','task_runs','task_schedules','task_conditions','task_dependencies','task_triggers','task_notifications','goals','task_goal_progress','checklists','checklist_items','routines','routine_steps','background_monitors','task_metrics','task_suggestions',
    'conversation_history','conversation_sessions','conversation_topics','conversation_goals','conversation_summaries','conversation_personas','clarification_history','conversation_context','conversation_analytics','conversation_bookmarks','conversation_states','conversation_turn_feedback','conversation_continuity','conversation_continuity_turn_claims',
    'executive_records','ai_budget_policies','ai_budget_reservations','ai_usage_ledger','ai_budget_override_grants','ai_economic_anomalies',
    'agent_economy_accounts','agent_economy_ledger','agent_economy_reservations','agent_economy_performance','agent_workforce_events','workforce_runtime_tasks','workforce_runtime_messages','workforce_runtime_reviews',
    'business_execution_records','business_external_events','external_metric_observations','outcome_attributions','business_entity_mappings','integration_sync_checkpoints','cross_device_commands'
  ];
BEGIN
  FOREACH target_table IN ARRAY scoped_tables LOOP
    IF to_regclass(target_table) IS NULL OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema=current_schema() AND c.table_name=target_table AND c.column_name='owner_id'
    ) THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT',target_table);
    EXECUTE format('UPDATE %I t SET company_id=o.default_company_id FROM owners o WHERE t.owner_id=o.id AND t.company_id IS NULL',target_table);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(company_id,owner_id)',target_table || '_company_owner_idx',target_table);
    EXECUTE format('DROP TRIGGER IF EXISTS assign_default_company ON %I',target_table);
    EXECUTE format('CREATE TRIGGER assign_default_company BEFORE INSERT OR UPDATE OF company_id,owner_id ON %I FOR EACH ROW EXECUTE FUNCTION alexa_assign_default_company()',target_table);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN company_id SET NOT NULL',target_table);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION alexa_enforce_workflow_dependency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM workflow_tasks t WHERE t.id=NEW.task_id AND t.workflow_id=NEW.workflow_id)
     OR NOT EXISTS (SELECT 1 FROM workflow_tasks t WHERE t.id=NEW.depends_on_task_id AND t.workflow_id=NEW.workflow_id) THEN
    RAISE EXCEPTION 'workflow dependency crosses workflow/company boundary';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS enforce_workflow_dependency ON workflow_dependencies;
CREATE TRIGGER enforce_workflow_dependency BEFORE INSERT OR UPDATE ON workflow_dependencies
  FOR EACH ROW EXECUTE FUNCTION alexa_enforce_workflow_dependency();

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS audit_events_company_time_idx ON audit_events(company_id,occurred_at DESC);
DO $$
BEGIN
  IF to_regclass('notification_deliveries') IS NOT NULL THEN
    ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT;
    CREATE INDEX IF NOT EXISTS notification_deliveries_company_time_idx ON notification_deliveries(company_id,created_at DESC);
  END IF;
END $$;

DROP INDEX IF EXISTS approvals_one_pending_digest_idx;
CREATE UNIQUE INDEX IF NOT EXISTS approvals_one_pending_digest_idx
  ON approval_requests(owner_id,company_id,action_digest) WHERE status='PENDING';

DO $$
DECLARE constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  WHERE c.conrelid='cross_device_commands'::regclass AND c.contype='u'
    AND pg_get_constraintdef(c.oid) LIKE '%owner_id, source_client_instance_id, idempotency_key%'
  LIMIT 1;
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE cross_device_commands DROP CONSTRAINT %I',constraint_name);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS cross_device_commands_company_idempotency_idx
  ON cross_device_commands(owner_id,company_id,source_client_instance_id,idempotency_key);

DO $$
DECLARE constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name FROM pg_constraint c
  WHERE c.conrelid='repositories'::regclass AND c.contype='u'
    AND pg_get_constraintdef(c.oid) LIKE '%owner_id, workspace_id%' LIMIT 1;
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE repositories DROP CONSTRAINT %I',constraint_name);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS repositories_company_workspace_idx
  ON repositories(owner_id,company_id,workspace_id);

DO $$
DECLARE table_name text; constraint_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['agent_economy_ledger','agent_economy_reservations'] LOOP
    SELECT c.conname INTO constraint_name FROM pg_constraint c
    WHERE c.conrelid=table_name::regclass AND c.contype='u'
      AND pg_get_constraintdef(c.oid) LIKE '%owner_id, idempotency_key%' LIMIT 1;
    IF constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',table_name,constraint_name);
    END IF;
    constraint_name := NULL;
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I(owner_id,company_id,idempotency_key)',table_name || '_company_idempotency_idx',table_name);
  END LOOP;
END $$;

DO $$
DECLARE constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name FROM pg_constraint c
  WHERE c.conrelid='conversation_continuity'::regclass AND c.contype='u'
    AND pg_get_constraintdef(c.oid) LIKE '%owner_id, conversation_id%' LIMIT 1;
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE conversation_continuity DROP CONSTRAINT %I',constraint_name);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS conversation_continuity_company_conversation_idx
  ON conversation_continuity(owner_id,company_id,conversation_id);

ALTER TABLE conversation_continuity_turn_claims DROP CONSTRAINT IF EXISTS conversation_continuity_turn_claims_pkey;
ALTER TABLE conversation_continuity_turn_claims
  ADD CONSTRAINT conversation_continuity_turn_claims_pkey
  PRIMARY KEY(owner_id,company_id,conversation_id,turn_id);

-- Integration IDs are stable provider IDs and therefore repeat across companies.
-- Replace owner-only relational keys with company-aware keys before runtime uses
-- company_id in ON CONFLICT and foreign-key checks.
DO $$
DECLARE table_name text; constraint_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'integration_credentials','integration_permissions','integration_usage','integration_events','integration_health',
    'business_execution_records','business_external_events','business_entity_mappings','integration_sync_checkpoints'
  ] LOOP
    FOR constraint_name IN
      SELECT c.conname FROM pg_constraint c
      WHERE c.conrelid=table_name::regclass AND c.contype='f' AND c.confrelid='integrations'::regclass
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',table_name,constraint_name);
    END LOOP;
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
    'integrations','integration_permissions','integration_usage','business_execution_records',
    'business_external_events','business_entity_mappings','integration_sync_checkpoints'
  ] LOOP
    FOR constraint_name IN
      SELECT c.conname FROM pg_constraint c
      WHERE c.conrelid=table_name::regclass AND c.contype IN ('p','u')
      AND NOT (c.contype='p' AND table_name IN ('integration_permissions','business_execution_records','business_external_events','business_entity_mappings'))
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',table_name,constraint_name);
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_pkey;
ALTER TABLE integrations ADD CONSTRAINT integrations_pkey PRIMARY KEY(owner_id,company_id,id);
ALTER TABLE integration_usage DROP CONSTRAINT IF EXISTS integration_usage_pkey;
ALTER TABLE integration_usage ADD CONSTRAINT integration_usage_pkey PRIMARY KEY(owner_id,company_id,integration_id);
ALTER TABLE integration_sync_checkpoints DROP CONSTRAINT IF EXISTS integration_sync_checkpoints_pkey;
ALTER TABLE integration_sync_checkpoints ADD CONSTRAINT integration_sync_checkpoints_pkey PRIMARY KEY(owner_id,company_id,integration_id,stream);
CREATE UNIQUE INDEX IF NOT EXISTS integration_permissions_company_capability_idx
  ON integration_permissions(owner_id,company_id,integration_id,capability_id);
CREATE UNIQUE INDEX IF NOT EXISTS business_execution_company_idempotency_idx
  ON business_execution_records(owner_id,company_id,integration_id,idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS business_external_event_company_idx
  ON business_external_events(owner_id,company_id,integration_id,external_event_id);
CREATE UNIQUE INDEX IF NOT EXISTS business_entity_mapping_company_external_idx
  ON business_entity_mappings(owner_id,company_id,integration_id,entity_type,external_id);
CREATE UNIQUE INDEX IF NOT EXISTS business_entity_mapping_company_internal_idx
  ON business_entity_mappings(owner_id,company_id,integration_id,entity_type,internal_entity_id);

ALTER TABLE integration_credentials DROP CONSTRAINT IF EXISTS integration_credentials_company_fkey;
ALTER TABLE integration_credentials ADD CONSTRAINT integration_credentials_company_fkey
  FOREIGN KEY(owner_id,company_id,integration_id) REFERENCES integrations(owner_id,company_id,id) ON DELETE CASCADE;
ALTER TABLE integration_permissions DROP CONSTRAINT IF EXISTS integration_permissions_company_fkey;
ALTER TABLE integration_permissions ADD CONSTRAINT integration_permissions_company_fkey
  FOREIGN KEY(owner_id,company_id,integration_id) REFERENCES integrations(owner_id,company_id,id) ON DELETE CASCADE;
ALTER TABLE integration_usage DROP CONSTRAINT IF EXISTS integration_usage_company_fkey;
ALTER TABLE integration_usage ADD CONSTRAINT integration_usage_company_fkey
  FOREIGN KEY(owner_id,company_id,integration_id) REFERENCES integrations(owner_id,company_id,id) ON DELETE CASCADE;
ALTER TABLE integration_events DROP CONSTRAINT IF EXISTS integration_events_company_fkey;
ALTER TABLE integration_events ADD CONSTRAINT integration_events_company_fkey
  FOREIGN KEY(owner_id,company_id,integration_id) REFERENCES integrations(owner_id,company_id,id) ON DELETE CASCADE;
ALTER TABLE business_execution_records DROP CONSTRAINT IF EXISTS business_execution_company_fkey;
ALTER TABLE business_execution_records ADD CONSTRAINT business_execution_company_fkey
  FOREIGN KEY(owner_id,company_id,integration_id) REFERENCES integrations(owner_id,company_id,id) ON DELETE CASCADE;
ALTER TABLE business_external_events DROP CONSTRAINT IF EXISTS business_external_event_company_fkey;
ALTER TABLE business_external_events ADD CONSTRAINT business_external_event_company_fkey
  FOREIGN KEY(owner_id,company_id,integration_id) REFERENCES integrations(owner_id,company_id,id) ON DELETE CASCADE;
ALTER TABLE business_entity_mappings DROP CONSTRAINT IF EXISTS business_entity_mapping_company_fkey;
ALTER TABLE business_entity_mappings ADD CONSTRAINT business_entity_mapping_company_fkey
  FOREIGN KEY(owner_id,company_id,integration_id) REFERENCES integrations(owner_id,company_id,id) ON DELETE CASCADE;
ALTER TABLE integration_sync_checkpoints DROP CONSTRAINT IF EXISTS integration_sync_checkpoint_company_fkey;
ALTER TABLE integration_sync_checkpoints ADD CONSTRAINT integration_sync_checkpoint_company_fkey
  FOREIGN KEY(owner_id,company_id,integration_id) REFERENCES integrations(owner_id,company_id,id) ON DELETE CASCADE;

DROP INDEX IF EXISTS ai_budget_reservations_owner_request_attempt_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS ai_budget_reservations_company_request_attempt_uidx
  ON ai_budget_reservations(owner_id,company_id,request_id,attempt_id)
  WHERE attempt_id IS NOT NULL;
DROP INDEX IF EXISTS ai_usage_ledger_owner_request_attempt_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_ledger_company_request_attempt_uidx
  ON ai_usage_ledger(owner_id,company_id,request_id,attempt_id)
  WHERE attempt_id IS NOT NULL;
DO $$
DECLARE constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name FROM pg_constraint c
  WHERE c.conrelid='ai_budget_override_grants'::regclass AND c.contype='u'
    AND pg_get_constraintdef(c.oid) LIKE '%owner_id, approval_id%' LIMIT 1;
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ai_budget_override_grants DROP CONSTRAINT %I',constraint_name);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ai_budget_override_company_approval_idx
  ON ai_budget_override_grants(owner_id,company_id,approval_id);

-- Provider health is transient and the legacy key could not distinguish owners
-- or companies. Recompute it from providers after migration under the new key.
TRUNCATE integration_health;
ALTER TABLE integration_health DROP CONSTRAINT IF EXISTS integration_health_pkey;
ALTER TABLE integration_health ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES owners(id) ON DELETE CASCADE;
ALTER TABLE integration_health ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE integration_health ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE integration_health ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE integration_health DROP CONSTRAINT IF EXISTS integration_health_pkey;
ALTER TABLE integration_health ADD CONSTRAINT integration_health_pkey PRIMARY KEY(owner_id,company_id,integration_id);
ALTER TABLE integration_health DROP CONSTRAINT IF EXISTS integration_health_company_fkey;
ALTER TABLE integration_health ADD CONSTRAINT integration_health_company_fkey
  FOREIGN KEY(owner_id,company_id,integration_id) REFERENCES integrations(owner_id,company_id,id) ON DELETE CASCADE;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['workflow_tasks','workflow_checkpoints','workflow_events','workflow_reports'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT',table_name);
    EXECUTE format('UPDATE %I child SET company_id=parent.company_id FROM workflows parent WHERE child.workflow_id=parent.id AND child.company_id IS NULL',table_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN company_id SET NOT NULL',table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(company_id,workflow_id)',table_name || '_company_workflow_idx',table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION alexa_enforce_workflow_company() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workflows w WHERE w.id=NEW.workflow_id AND w.company_id=NEW.company_id
  ) THEN
    RAISE EXCEPTION 'workflow child company mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['workflow_tasks','workflow_checkpoints','workflow_events','workflow_reports'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS enforce_workflow_company ON %I',table_name);
    EXECUTE format('CREATE TRIGGER enforce_workflow_company BEFORE INSERT OR UPDATE OF company_id,workflow_id ON %I FOR EACH ROW EXECUTE FUNCTION alexa_enforce_workflow_company()',table_name);
  END LOOP;
END $$;
