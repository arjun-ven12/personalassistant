-- Phase 26.2 extends the shared reviewed integration runtime. Commercial fact
-- truth stays durable and company-scoped; providers remain external truth.
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_provider_check;
ALTER TABLE integrations ADD CONSTRAINT integrations_provider_check
  CHECK (provider IN (
    'github','jira','slack','notion','vscode','github_actions','vercel',
    'gmail','crm','support','documents','projects','analytics',
    'accounting','payments','ads','commerce'
  ));

ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_category_check;
ALTER TABLE integrations ADD CONSTRAINT integrations_category_check
  CHECK (category IN (
    'git_provider','issue_tracker','communication','documentation','ide',
    'ci_cd','deployment','crm','support','project_management','analytics',
    'accounting','payments','ads','commerce'
  ));

CREATE TABLE IF NOT EXISTS commercial_facts (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  canonical_event_id text NOT NULL,
  source_role text NOT NULL CHECK (source_role IN ('ORDER','PAYMENT_STATUS','BOOK_REVENUE','MARKETING_ATTRIBUTION')),
  occurred_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  UNIQUE(owner_id,company_id,canonical_event_id,source_role)
);
CREATE INDEX IF NOT EXISTS commercial_facts_company_time_idx ON commercial_facts(owner_id,company_id,occurred_at DESC);
