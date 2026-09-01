CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;
SELECT set_config('search_path', current_schema() || ',public', false);

CREATE TABLE company_data_sources (
  id uuid NOT NULL, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  provider text NOT NULL, source_type text NOT NULL, status text NOT NULL,
  record jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id,company_id,id),
  FOREIGN KEY(owner_id,company_id) REFERENCES companies(owner_id,id) ON DELETE RESTRICT
);
CREATE INDEX company_data_sources_scope_status_idx ON company_data_sources(owner_id,company_id,status,updated_at DESC);

CREATE TABLE company_datasets (
  id uuid NOT NULL, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT, source_id uuid NOT NULL,
  canonical_name text NOT NULL, logical_contract text, sensitivity text NOT NULL, status text NOT NULL,
  owner_department_id uuid, record jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id,company_id,id), UNIQUE(owner_id,company_id,canonical_name),
  FOREIGN KEY(owner_id,company_id,source_id) REFERENCES company_data_sources(owner_id,company_id,id) ON DELETE RESTRICT
);
CREATE INDEX company_datasets_scope_access_idx ON company_datasets(owner_id,company_id,owner_department_id,sensitivity,status);
CREATE INDEX company_datasets_logical_contract_idx ON company_datasets(owner_id,company_id,logical_contract) WHERE logical_contract IS NOT NULL;

CREATE TABLE company_data_pipelines (
  id uuid NOT NULL, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT, source_id uuid NOT NULL, dataset_id uuid NOT NULL,
  connector_key text NOT NULL, trigger_mode text NOT NULL, status text NOT NULL,
  record jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id,company_id,id),
  FOREIGN KEY(owner_id,company_id,source_id) REFERENCES company_data_sources(owner_id,company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,company_id,dataset_id) REFERENCES company_datasets(owner_id,company_id,id) ON DELETE RESTRICT
);
CREATE INDEX company_data_pipelines_scheduler_idx ON company_data_pipelines(status,trigger_mode,updated_at);

CREATE TABLE company_pipeline_runs (
  id uuid NOT NULL, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT, source_id uuid NOT NULL,
  pipeline_id uuid NOT NULL, dataset_id uuid NOT NULL, load_package_id uuid NOT NULL,
  status text NOT NULL, started_at timestamptz NOT NULL, completed_at timestamptz,
  record jsonb NOT NULL, PRIMARY KEY(owner_id,company_id,id), UNIQUE(owner_id,company_id,load_package_id),
  FOREIGN KEY(owner_id,company_id,pipeline_id) REFERENCES company_data_pipelines(owner_id,company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,company_id,dataset_id) REFERENCES company_datasets(owner_id,company_id,id) ON DELETE RESTRICT
);
CREATE INDEX company_pipeline_runs_scope_time_idx ON company_pipeline_runs(owner_id,company_id,started_at DESC);

CREATE TABLE company_dataset_records (
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  source_id uuid NOT NULL, pipeline_id uuid NOT NULL, dataset_id uuid NOT NULL,
  record_key text NOT NULL, payload jsonb NOT NULL, ingested_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id,company_id,dataset_id,record_key),
  FOREIGN KEY(owner_id,company_id,pipeline_id) REFERENCES company_data_pipelines(owner_id,company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,company_id,dataset_id) REFERENCES company_datasets(owner_id,company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,company_id,source_id) REFERENCES company_data_sources(owner_id,company_id,id) ON DELETE RESTRICT
);
CREATE INDEX company_dataset_records_scope_ingested_idx ON company_dataset_records(owner_id,company_id,dataset_id,ingested_at DESC);

CREATE TABLE company_metadata_entities (
  id uuid NOT NULL, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  entity_type text NOT NULL, canonical_name text NOT NULL, domain text, owner_department_id uuid,
  sensitivity text NOT NULL, status text NOT NULL, record jsonb NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id,company_id,id), UNIQUE(owner_id,company_id,entity_type,canonical_name)
);
CREATE INDEX company_metadata_entities_catalog_idx ON company_metadata_entities(owner_id,company_id,domain,entity_type,status);

CREATE TABLE company_metadata_lineage (
  id uuid NOT NULL, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  from_entity_id uuid NOT NULL, to_entity_id uuid NOT NULL, relation text NOT NULL,
  record jsonb NOT NULL, created_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id,company_id,id), UNIQUE(owner_id,company_id,from_entity_id,to_entity_id,relation),
  FOREIGN KEY(owner_id,company_id,from_entity_id) REFERENCES company_metadata_entities(owner_id,company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_id,company_id,to_entity_id) REFERENCES company_metadata_entities(owner_id,company_id,id) ON DELETE RESTRICT
);
CREATE INDEX company_metadata_lineage_from_idx ON company_metadata_lineage(owner_id,company_id,from_entity_id);
CREATE INDEX company_metadata_lineage_to_idx ON company_metadata_lineage(owner_id,company_id,to_entity_id);

CREATE TABLE company_glossary_terms (
  id uuid NOT NULL, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  canonical_key text NOT NULL, status text NOT NULL, version integer NOT NULL,
  record jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id,company_id,id), UNIQUE(owner_id,company_id,canonical_key,version)
);
CREATE INDEX company_glossary_terms_lookup_idx ON company_glossary_terms(owner_id,company_id,status,canonical_key);

CREATE TABLE company_semantic_metrics (
  id uuid NOT NULL, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  canonical_key text NOT NULL, version integer NOT NULL, status text NOT NULL, owner_department_id uuid,
  record jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id,company_id,id), UNIQUE(owner_id,company_id,canonical_key,version)
);
CREATE UNIQUE INDEX company_semantic_metrics_one_active_idx ON company_semantic_metrics(owner_id,company_id,canonical_key) WHERE status='ACTIVE';

CREATE TABLE company_metric_observations (
  id uuid NOT NULL, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT, metric_id uuid NOT NULL,
  metric_version integer NOT NULL, observed_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  quality_state text NOT NULL, record jsonb NOT NULL,
  PRIMARY KEY(owner_id,company_id,id),
  FOREIGN KEY(owner_id,company_id,metric_id) REFERENCES company_semantic_metrics(owner_id,company_id,id) ON DELETE RESTRICT
);
CREATE INDEX company_metric_observations_current_idx ON company_metric_observations(owner_id,company_id,metric_id,observed_at DESC);

CREATE TABLE company_credential_references (
  id uuid NOT NULL, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  provider text NOT NULL, status text NOT NULL, record jsonb NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id,company_id,id)
);

CREATE TABLE company_integration_bindings (
  id uuid NOT NULL, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  provider text NOT NULL, integration_id text NOT NULL, credential_ref uuid NOT NULL, status text NOT NULL,
  record jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id,company_id,id), UNIQUE(owner_id,company_id,integration_id),
  FOREIGN KEY(owner_id,company_id,credential_ref) REFERENCES company_credential_references(owner_id,company_id,id) ON DELETE RESTRICT
);

CREATE TABLE company_data_policies (
  id uuid NOT NULL, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  version integer NOT NULL, status text NOT NULL, record jsonb NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id,company_id,id,version)
);
CREATE UNIQUE INDEX company_data_policies_one_active_idx ON company_data_policies(owner_id,company_id) WHERE status='ACTIVE';

CREATE TABLE company_semantic_documents (
  id uuid NOT NULL, owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  entity_type text NOT NULL, scope_type text NOT NULL, scope_id text NOT NULL,
  sensitivity text NOT NULL, embedding vector(1536), record jsonb NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id,company_id,id)
);
CREATE INDEX company_semantic_documents_scope_filter_idx ON company_semantic_documents(owner_id,company_id,scope_id,entity_type,sensitivity);
CREATE INDEX company_semantic_documents_vector_idx ON company_semantic_documents USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION alexa_enforce_company_data_scope() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id=NEW.company_id AND owner_id=NEW.owner_id) THEN
    RAISE EXCEPTION 'company data owner scope mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'company_data_sources','company_datasets','company_data_pipelines','company_pipeline_runs',
    'company_dataset_records','company_metadata_entities','company_metadata_lineage','company_glossary_terms',
    'company_semantic_metrics','company_metric_observations','company_credential_references',
    'company_integration_bindings','company_data_policies','company_semantic_documents'
  ] LOOP
    EXECUTE format('CREATE TRIGGER enforce_company_data_scope BEFORE INSERT OR UPDATE OF owner_id,company_id ON %I FOR EACH ROW EXECUTE FUNCTION alexa_enforce_company_data_scope()',target_table);
  END LOOP;
END $$;
