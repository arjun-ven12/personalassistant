# Governance domain

## Boundary

Governance determines whether a structured proposal is allowable, denied,
prohibited, or requires approval. It never performs the proposal.
`IdentityService` remains responsible only for owners, sessions, pairing,
devices, signatures, and replay protection. `GovernanceStore` independently
owns registry metadata, approval records, policy evaluations, and security
state.

`buildApi` accepts optional `identityStore`, `governanceStore`, and
`networkVerifier` adapters. The defaults are development-only in-memory
implementations.

## Registries

Applications are owner-scoped records identified by a stable ID and macOS
bundle ID. Public inputs cannot contain executable paths. All permissions
default false, and application risk overrides may only raise risk.

Workspaces are owner-scoped metadata paths. Paths receive lexical checks only:
they must be absolute and normalised and cannot represent `/`, an entire home
directory, or known sensitive system roots. The API does not check existence,
resolve symlinks, or read files. Mandatory credential-related blocked patterns
are always merged into each record. `deleteFile` is a literal false.

Tools are trusted source-code definitions in `governance/defaults.ts`. There is
no creation or update API. Definitions contain schema IDs, capabilities, risk,
approval, target type, timeout metadata, cancellation/dry-run flags, version,
and enabled state. Execution-oriented tools are visible for simulation but
disabled unless they represent governance-only operations.

## Ownership and persistence

Application, workspace, approval, and evaluation records contain `ownerId`.
Reads filter by the authenticated owner; cross-owner lookups use safe not-found
responses. API bodies never choose an owner.

A future relational adapter can replace `InMemoryGovernanceStore` without
changing routes or services. Expected tables are `applications`, `workspaces`,
`tool_definitions`, `approval_requests`, `policy_evaluations`, and
`security_state`. Identity remains behind its separate adapter. Transactions,
uniqueness constraints, append-only audit controls, retention, encryption,
backup, and recovery require a later reviewed migration.

## Non-execution guarantee

Registry records contain metadata, not function pointers. No governance route
calls Electron, the filesystem, Git, a shell, an application API, a browser,
an integration, or an AI provider. Policy `allow` is an authorization result
only and every response reports `executionAllowed: false`.

# Phase 2.3 persistence

Applications, workspaces, approvals, policy evaluations, built-in tool
metadata, and emergency-stop state use `GovernanceStore` as before. Production
injects `PostgresGovernanceStore`; tests retain `InMemoryGovernanceStore`.
Approval never directly invokes an operating-system capability. Phase 3.1
execution-request creation consumes an `allow` decision only for its hard-coded
read-only allowlist and persists a separate policy/action/device binding.
