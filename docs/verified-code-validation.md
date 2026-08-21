# Verified code validation

Phase 5.2 turns approved code changes into auditable validation runs. It does
not add arbitrary shell access. The API plans and signs fixed validation work;
the trusted Mac agent runs immutable profiles in a temporary workspace copy.

## Lifecycle

1. Owner creates a validation plan for a registered repository.
2. The plan selects immutable profile IDs such as `pnpm_typecheck` or
   `pnpm_test`.
3. Starting the run requires authentication, CSRF, private-network verification,
   policy evaluation, explicit approval, a trusted Mac agent, and a signed
   server execution envelope.
4. The Mac agent copies the registered workspace into a temporary sandbox.
5. The agent executes fixed profile commands with `shell: false`, a scrubbed
   environment, bounded output, timeout handling, and cancellation support.
6. The agent deletes the sandbox and signs the bounded result.
7. The API verifies the signed result and persists the classification, logs,
   step results, and provenance.

## Profiles

Initial profiles are intentionally narrow:

- `pnpm_format_check`
- `pnpm_typecheck`
- `pnpm_lint`
- `pnpm_test`
- `pnpm_build`
- `pnpm_security_check`
- `pnpm_verify_production_config`

Profiles are administrator-controlled source code, not user input. A request can
select profile IDs, but it cannot choose commands, arguments, executables,
working directories, environment variables, network access, or timeouts.

## Sandbox boundary

Validation runs in a temporary copy of the registered workspace. The production
workspace is not modified during validation. Dependency directories, build
outputs, and VCS metadata are omitted from the sandbox copy where practical.

This means a validation may fail with `FAILED_ENVIRONMENT` when dependencies
are not available in the isolated workspace. That is safer than silently running
unbounded install or network operations.

## Result classifications

Validation results are classified as:

- `PASSED`
- `PASSED_WITH_WARNINGS`
- `FAILED_BUILD`
- `FAILED_TESTS`
- `FAILED_LINT`
- `FAILED_TYPECHECK`
- `FAILED_TIMEOUT`
- `FAILED_ENVIRONMENT`
- `FAILED_POLICY`
- `CANCELLED`

Stdout and stderr are bounded and stored with the validation record. Future
phases can promote selected logs, artifacts, coverage reports, and resource
metrics into the normalized tables created for Phase 5.2.

## Security guarantees

Validation does not introduce:

- unrestricted shell access
- arbitrary scripts
- caller-selected commands
- Git mutation
- file writes to the registered workspace
- background daemons
- hidden execution
- public network bypass
- automatic code rewrites

Failed validation preserves rollback information from the approved patch flow
and recommends corrective action through the owner-facing report; it never fixes
code automatically.
