# Security, authority and selective disclosure

> Audit date: 2026-10-26 · CONFIDENTIAL INTERNAL · Review draft v0.1
> Evidence scope: current workspace, including pre-existing uncommitted changes.
> Current implementation, test evidence, and proposed institutional design are distinguished below.

## Governing rule

Deny by default. Permit only explicitly registered identities, devices, companies, applications, repositories/workspaces, tools and actions in a known valid context. Permission to reason or propose is distinct from permission to execute. Prohibited operations remain prohibited after an approval attempt. No documentation recommendation in this audit changes current policy or grants access.

## Controls found in source

| Boundary              | Evidence                                                                                          | What it establishes / does not establish                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Human identity        | `identity/service.ts::IdentityService`; `identity/crypto.ts`                                      | Password authentication, hashed opaque sessions and device records; not broad enterprise human IAM                      |
| Session mutation      | `identity/security.ts::SecurityMiddleware.requireAuthentication/requireTrustedOrigin/requireCsrf` | Guard primitives for cookie requests; individual route composition still requires review                                |
| Device requests       | `SecurityMiddleware.verifySignedRequest`; crypto/replay stores                                    | Ed25519 device binding, timestamps, expiry and nonce rejection; trust alone is not execution permission                 |
| Recent authentication | `security-state/service.ts::SecurityStateService`                                                 | Purpose/session-bound grants and supported password/biometric verification; normal login is not step-up                 |
| Policy                | `governance/policy-engine.ts::PolicyEngine.evaluate`; `RiskEngine`                                | Trusted registry/context evaluation and persisted explainable denial/allow; policy allow itself is not OS permission    |
| Approvals             | `ApprovalService`; `governance/digest.ts::digestProposedAction`                                   | Canonical digest, expiry, owner/company context and review state; capability-specific consumers must recheck            |
| Network               | `identity/network.ts`, network verifier, config parser                                            | Private deployment verifier and explicit cloud profile; RFC1918/unknown headers are not Tailscale proof                 |
| Emergency stop        | Governance security state; API stop route; router/runtime checks                                  | Existing interruption/deny paths; not proof of instantaneous reversal of already sent external actions                  |
| Signed execution      | `execution/service.ts`; Mac `execution/execution-client.ts`                                       | Pinned server verification, result signing, replay/lifecycle binding; actual Mac acceptance absent                      |
| Filesystem            | Mac `execution/path-policy.ts`; engineering runtime                                               | Registered roots, blocked patterns, symlink and expected-hash defenses; hostile-local-process race requires containment |
| Renderer              | `electron/main.ts`, `preload.ts`, contracts tests                                                 | Explicit IPC, isolation/sandbox settings; no renderer key/export or generic OS APIs                                     |
| Tenant/company        | `companies/context.ts`, `scope.ts`, stores and migrations 0078+                                   | Owner/company context and scoped storage; no claim of full enterprise RBAC or universal database RLS                    |
| Secret handling       | `LOG_REDACTION_PATHS`, sensitive-memory filters, provider-cache scoping, secret resolver          | Several bounded defenses; no exhaustive proof against novel secret formats or every diagnostic leak                     |

Source documentation includes phase-local restrictions that later reviewed phases extend. For example, early “no writes” limits do not erase the later finite engineering patch runtime, and the secure-key adapter is a narrowly scoped exception to the original broad Keychain prohibition. Each new permission must have an explicit reviewed capability, not an inferred phase-wide exemption.

## Threat model: present and proposed systems

| Threat                    | Attack route                                                                    | Required control and acceptance                                                                            |
| ------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Prompt injection          | Email, webpage, document, tool result, repository comment                       | Treat content as data; finite proposal schemas; no authority derived from text; poisoned-input tests       |
| Identity confusion        | Caller supplies agent ID, company ID, model role or department                  | Resolve identity server-side and validate assignment/scope; reject spoofed/cross-company references        |
| Approval replay/TOCTOU    | Reuse old approval after content, binding, permission or stop changes           | Canonical digest/version binding and current revalidation immediately before effect                        |
| Duplicate effects         | Timeout/retry, worker crash, webhook replay                                     | Durable scoped idempotency, atomic claims, receipt reconciliation and ambiguous-outcome state              |
| Cross-tenant leakage      | Context cache key collision, vector query before filtering, portfolio drilldown | Composite owner/company keys; authorization before retrieval/ranking; no unauthorized counts/snippets      |
| Compromised worker/device | Valid key on revoked device, stale lease or replaced provider                   | Current trust, fencing, nonce/expiry, finite capability and stop gates; revoke and cancel outstanding work |
| Secret exfiltration       | Logs, memory, audit summaries, model prompt or export                           | Secret references only; bounded schema/minimization and classification checks; no inherited environments   |
| Native overreach          | Coordinates, arbitrary AX/shell, caller-selected executable or path             | Reviewed finite dispatcher/provider; unsupported operations deny; renderer isolation                       |
| Cost exhaustion           | Cyclic objectives, repeated inference, runaway retries                          | Economic reservation, task/round/concurrency/timeout caps, cancellation and reconciliation                 |
| Insider over-disclosure   | Public documentation or external collaborator gets internal evidence            | Reviewed release bundle, document classification, clearance intersection and expiry                        |
| False success             | Model prose, fixture receipt, process existence reported as completed outcome   | Capability-specific independent verification and explicit provenance class                                 |

## Security findings versus assurance gaps

The current source contains substantial security hardening, including recent business-dispatch fixes in pre-existing uncommitted changes. This audit is not a penetration test and does not assert every control is correctly composed. Operational security state, production proxy configuration, actual migration status, secrets configuration, backup/restore, incident handling and current provider accounts remain UNKNOWN. No production logs or credentials were inspected.

`verify-production-config.ts` parses hardcoded private/cloud example profiles; passing it validates parser invariants, not deployed settings. The repository security scanner looks for selected prohibited patterns and invariant violations; it is not a complete threat analysis. Synthetic provider and signed-transport tests do not establish real external isolation or OS permission behavior.

## Proposed selective disclosure standard

| Class             | Typical material                                                                                       | Distribution rule                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| PUBLIC            | Approved mission, architecture abstraction, reproducible non-sensitive results                         | Separate reviewed publication artifact; no automatic downgrade from internal drafts          |
| INTERNAL          | Contributor process, non-sensitive handbook, reviewed component guide                                  | Authenticated organizational members with project need                                       |
| CONFIDENTIAL      | Source evidence register, unreleased plans, internal performance and client project metadata           | Explicit project/division grant and purpose; bounded export with review                      |
| RESTRICTED        | Security-sensitive designs, incident evidence, privileged governance records                           | Named clearance and short-lived purpose approval; local-only inference where policy requires |
| FORBIDDEN_CONTENT | Passwords, session/refresh tokens, private keys, recovery/authentication codes, raw sensitive captures | Never include in documentation, AI prompts, general logs or evidence exports                 |

Classification labels and clearance are proposed institutional policy; the audit files are marked CONFIDENTIAL INTERNAL pending founder/security review. A classification is not itself an implemented enforcement mechanism. Redaction must occur before material enters model context or publication. Derived summaries inherit the highest source classification unless a reviewed transformation explicitly releases them. Merely removing names or IDs does not prove anonymity.

## Emergency operation proposal

Retain the existing stop button and local disable path. Add organization-level revocation epochs and named incident authority only through a separately reviewed implementation. Stop new effects first; revoke sessions/grants/devices and invalidate caches; fence worker leases; cancel/reconcile queued/running actions; preserve audit and recoverable work; rotate affected credentials through the secret manager; restore only after authenticated review. An external email already sent cannot be recalled by deleting its task record. Permanent deletion and administrator escalation remain prohibited.
