# Engineering integrations

Phase 6 adds a governed integration framework for external engineering tools.
The implementation starts with built-in connector descriptors for GitHub, Jira,
Slack, Notion, VS Code, GitHub Actions, and Vercel.

## What exists

- owner-scoped integration registry
- capability descriptors with risk and approval metadata
- explicit permission grants and revocation
- connector health/status snapshots
- usage counters
- audited operation request records
- authenticated dashboard APIs
- Integration Manager dashboard page
- PostgreSQL persistence through migration `0009_phase_6_engineering_integrations`

## Security boundary

Installing a connector descriptor does not grant access to the external service.
A connector operation is accepted only when:

1. the owner is authenticated,
2. CSRF and trusted-origin checks pass for mutations,
3. the integration is installed and not disabled,
4. the exact capability is explicitly granted,
5. the requested operation is declared by that capability,
6. the operation is audited,
7. approval-gated operations remain waiting for the existing approval engine.

Live third-party execution is intentionally not enabled by default. Credential
storage is represented as status metadata only in this phase; secret values must
not be returned to the browser, logs, audit metadata, or AI context.

## Built-in connectors

- GitHub: repository discovery and pull request operations.
- Jira: issue read/update operations.
- Slack: workflow notifications and approval prompts.
- Notion: documentation search and approved documentation drafts.
- VS Code: local navigation status and diagnostics surface.
- GitHub Actions: CI status and approved workflow dispatch descriptors.
- Vercel: deployment status and approved deployment-control descriptors.

## Current limitations

The first Phase 6 implementation does not perform OAuth, PAT exchange, live API
calls, message sends, issue updates, deployments, or IDE control. It provides the
governed registry, capability model, permission boundary, dashboard, audit trail,
and persistence foundation needed before adding live connector adapters safely.
