-- Phase 26.1 extends the shared integration registry; it does not create a
-- vendor-specific or per-company integration subsystem.
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_provider_check;
ALTER TABLE integrations ADD CONSTRAINT integrations_provider_check
  CHECK (provider IN (
    'github','jira','slack','notion','vscode','github_actions','vercel',
    'gmail','crm','support','documents','projects','analytics'
  ));

ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_category_check;
ALTER TABLE integrations ADD CONSTRAINT integrations_category_check
  CHECK (category IN (
    'git_provider','issue_tracker','communication','documentation','ide',
    'ci_cd','deployment','crm','support','project_management','analytics'
  ));
