# GitHub integration record

2026-10-26. The user explicitly requested this push after the implementation report.

The implementation and historical acceptance logs were produced in the dirty workspace at `7ee28be9de093a0446dfbe95b7145278b9087ea9`. They describe that exact baseline; their recorded hashes and results are historical evidence, not a claim that every file in the later GitHub tree is identical.

For publication, only the MCP/program changes were applied in an isolated worktree atop GitHub `main` at `7e7c4627b8d38a7a5747ba0cbd5f655ac31887c1`. Existing remote functionality and unrelated local work were preserved. Overlapping composition changes were applied as finite additions, not whole-file replacements. The dependency lockfile was regenerated against the remote manifests with pnpm 11.17.0 and scripts disabled.

GitHub includes newer universal gateway, engineering-dataset, AthenaCoder-control, document, and cloud-worker modules than the original implementation baseline. The program plans remain proposals against their recorded baseline and require a renewed capability review before implementing later slices; they must not be used to infer that these newer remote components are absent. No existing remote subsystem was replaced.

The fixture remains disabled by default and prohibited in production. Publication does not constitute deployment or model promotion. PostgreSQL acceptance and dependency-hardening gates remain outstanding. See `github-integration-checks.json` for checks on this combined source tree.

Migration `0111_mcp_local_fixture_provider.sql` was renamed to `0118_mcp_local_fixture_provider.sql` because GitHub already contains migration 0111 and subsequent migrations through 0117. SQL content is unchanged; historical logs retain the original name. No migration was executed.

Combined-tree validation: typecheck, lint, API build (including bundled fixture), security checks, and production-config validation pass. MCP tests: 47 passed. Full suite: 1,499 passed, six failed, 89 skipped; all six failures were reproduced on unchanged GitHub main using the same dependency installation. Root build is blocked by the existing Mac native build requiring unavailable Swift/macOS frameworks. These limitations are not represented as passing gates. Release recommendation remains **REQUIRES_ADDITIONAL_VALIDATION**.
