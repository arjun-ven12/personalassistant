-- Private document metadata only; binary assets remain in the private asset adapter.
CREATE TABLE athena_documents (
 owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
 company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
 id uuid NOT NULL, idempotency_key uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 record jsonb NOT NULL,
 PRIMARY KEY(owner_id,company_id,id), UNIQUE(owner_id,company_id,idempotency_key),
 CHECK ((record->>'id'=id::text AND record->>'ownerId'=owner_id::text
 AND record->>'companyId'=company_id::text AND (record->>'version')::integer=version) IS TRUE)
);
CREATE INDEX athena_documents_recent ON athena_documents(owner_id,company_id,((record->>'updatedAt')) DESC);
CREATE TABLE athena_document_settings (
 owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
 company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
 record jsonb NOT NULL, PRIMARY KEY(owner_id,company_id)
);
CREATE TABLE athena_document_upload_grants (
 owner_id uuid NOT NULL, company_id uuid NOT NULL, document_id uuid NOT NULL,
 page integer NOT NULL CHECK(page BETWEEN 1 AND 5), token_hash char(64) NOT NULL,
 expires_at timestamptz NOT NULL, PRIMARY KEY(owner_id,company_id,document_id,page),
 FOREIGN KEY(owner_id,company_id,document_id) REFERENCES athena_documents(owner_id,company_id,id)
);
CREATE TABLE athena_document_ocr_runs (
 owner_id uuid NOT NULL, company_id uuid NOT NULL, document_id uuid NOT NULL,
 page integer NOT NULL CHECK(page BETWEEN 1 AND 5), attempt integer NOT NULL CHECK(attempt BETWEEN 1 AND 10),
 record jsonb NOT NULL, PRIMARY KEY(owner_id,company_id,document_id,page,attempt),
 FOREIGN KEY(owner_id,company_id,document_id) REFERENCES athena_documents(owner_id,company_id,id)
);
