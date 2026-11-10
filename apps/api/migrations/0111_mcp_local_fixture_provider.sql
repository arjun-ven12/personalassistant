-- MCP-1A reuses existing company-scoped integration metadata and permissions.
-- This expands the finite provider vocabulary only; it enables no transport,
-- permission, credentials, remote server, or production execution.
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_provider_check;
ALTER TABLE integrations ADD CONSTRAINT integrations_provider_check
  CHECK (provider IN (
    'github','jira','slack','notion','vscode','github_actions','vercel',
    'gmail','crm','support','documents','projects','analytics',
    'accounting','payments','ads','commerce','mcp_local'
  ));
