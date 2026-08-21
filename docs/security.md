# Security model

Alexa Control is not perfectly secure and must never be described that way. Its
design reduces risk with layered, fail-closed controls and explicit owner
approval. Phase 2.2 adds deterministic governance, deny-by-default registries,
digest-bound approvals, emergency-stop policy integration, and expanded audit
controls to the Phase 2.1 identity layer.

## Principles

- **Deny by default:** unknown tools, devices, applications, workspaces, and
  missing context are denied.
- **Least privilege:** components receive only narrow capabilities.
- **Allowlists:** application and workspace proposals resolve registered
  IDs, never model-provided paths.
- **Registered tools only:** tools declare input, output, capabilities, risk,
  timeout, cancellation, dry-run support, and approval.
- **No arbitrary execution:** no arbitrary shell, filesystem, app-launch, or
  browser primitive; no `sudo` or privilege escalation.
- **Prohibited targets:** no password-manager, banking, authentication-code, or
  macOS Keychain access.
- **No permanent deletion:** prohibited actions cannot be approved.
- **Infrastructure integrity:** the assistant cannot change VPN, firewall, or
  endpoint-protection settings.
- **Explicit approval:** meaningful actions require risk-appropriate approval;
  high-risk actions require recent authentication.
- **Revocation:** future device and session records must support immediate
  revocation.
- **Secret redaction:** secrets do not enter logs, source, AI prompts, or audit
  bodies.
- **Auditability:** identity and governance decisions are recorded in memory
  with actor, request, reason, risk, approval requirement, and safe IDs.
- **Untrusted content:** prompt injection in webpages, email, documents, tool
  output, and retrieved memory never becomes authority.
- **Local sensors:** future camera processing stays local and raw frames are not
  stored by default.
- **Inputs are not identity:** gesture is not authentication; speaker
  recognition is not sufficient authentication.
- **Emergency stop:** local and server-side stop state must remain independently
  reachable.

## Fail-closed rules

Missing private-network verification, required device trust, tool registration,
application registration, workspace registration, policy context, or valid
input means deny. Disabled execution means deny. An unavailable policy service
means deny. High-risk actions without approval mean deny. Prohibited actions
can never be approved.

Phase 2.2 starts with emergency stop active and privileged execution
unavailable. Its enable endpoint always returns
`EXECUTION_NOT_AVAILABLE`.

Authenticated identity and trusted-device status are necessary context, not
authority to execute. The placeholder network state is `UNKNOWN`, so the
private-network middleware fails closed.

## Approval implementation

Read-only governance proposals require authentication. Low risk requires a
session, medium risk requires explicit approval, and high risk requires recent
authentication. Exact canonical proposals are hashed with SHA-256. Ordinary
sessions are never treated as recent authentication, so high-risk approvals
fail closed in this phase.

## Request security

Registered devices can sign short-lived verification-only envelopes containing a command
ID, device ID, issue and expiry times, nonce, payload, signature, algorithm, and
protocol version. Verification covers the entire canonical message, rejects
reused nonces, enforces clock bounds, and checks current device/session trust.
Nonces and audit records are in-memory only. Durable multi-instance replay
protection remains future work.

## Threat model

| Threat                             | Intended mitigation                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stolen password                    | Prefer passkeys, short sessions, recent authentication for high risk, and session revocation.                                                              |
| Stolen phone                       | System biometrics, device-bound keys, remote device revocation, and approval expiry.                                                                       |
| Compromised browser session        | Short-lived authenticated sessions, signed device requests, CSRF controls, narrow API scopes, and revocation.                                              |
| Compromised Mac agent              | Sandbox renderers, narrow IPC, tool allowlists, local stop, least privilege, and no stored server secrets.                                                 |
| Malicious webpage prompt injection | Treat page content as untrusted data, separate it from planner instructions, restrict domains/tools, and require approval before consequential submission. |
| Malicious email content            | Never promote email text to instructions; label provenance, constrain integration scopes, and require policy review.                                       |
| Voice recording or clone           | Never use voice alone for high-risk approval; require trusted context and passkey/system biometric confirmation.                                           |
| Gesture false positive             | Debounce, calibrate, show active mode, enforce inactivity timeout, forbid high-risk gesture approval, and preserve a hardware-accessible stop path.        |
| Path traversal                     | Canonicalise paths and require containment within a registered root before access.                                                                         |
| Symlink escape                     | Resolve symlinks and re-check canonical containment at operation time.                                                                                     |
| Command injection                  | Do not execute model text; invoke fixed registered tools with schema-valid structured arguments.                                                           |
| Replay attack                      | Signed expiring requests, unique nonces, replay storage, protocol versioning, and clock validation.                                                        |
| Malicious dependency               | Lockfiles, minimal dependencies, update review, vulnerability scanning, and reproducible builds.                                                           |
| Leaked API token                   | Avoid long-lived tokens, redact logs, scope credentials, rotate/revoke quickly, and keep secrets outside source.                                           |
| Accidental AI action               | Planner/executor separation, dry runs, approvals, target previews, idempotency, cancellation, and audit records.                                           |
| Tailscale account compromise       | API authentication remains mandatory; VPN membership grants connectivity, not tool permission; device keys can be revoked.                                 |
| Credential-file discovery          | Block sensitive patterns, deny home access outside registered roots, hide secrets from planner context, and audit denied attempts.                         |

## Prompt-injection defence

Content and authority must remain separate. The planner can extract facts from
external content but cannot treat embedded requests, HTML comments, tool-like
syntax, or quoted system messages as permissions. Only owner intent,
authenticated approval state, registered policy, and trusted application code
can authorise an action.

## Dependency and update security

Dependencies should stay minimal, be pinned by the lockfile, and be updated in
reviewed batches. Production packaging should verify provenance and signatures
where available. An update must not silently add permissions or widen IPC/API
surfaces.

## Backups, rollback, and incident response

Future persistent registries and audit logs need encrypted, tested backups and a
documented rollback path. An incident procedure must assert the emergency stop,
revoke sessions and devices, rotate affected secrets, isolate the Mac agent,
preserve logs, assess scope, restore a known-good version, and document lessons
learned. Recovery must not re-enable execution automatically.

## Current limitations

The platform is still single-owner and private-network oriented. It does not
provide passkeys, full Google OAuth, distributed scheduling, public webhooks,
public API exposure, arbitrary shell access, Git mutation, browser automation,
application control, or autonomous code repair. Code changes are limited to
explicit owner-approved patches; validation is limited to immutable profiles
running through the signed trusted Mac-agent pipeline.

# Phase 2.3 controls

Production requires exact HTTPS origin/host values, a `__Host-` HTTP-only secure
cookie, session-bound synchronizer CSRF tokens, bounded sessions, PostgreSQL,
structured redaction, a real Tailscale verifier, and private-network
enforcement. Unknown state fails closed. Recovery codes and session tokens are
hash-only; Mac private keys remain encrypted and main-process-only.

Phase 3.1 server work is signed by a separate persistent Ed25519 identity and
device results are signed by the paired key. Workspace containment, blocked
paths, byte limits, fixed Git arguments and emergency stop are rechecked at the
agent boundary. See `read-only-execution.md`, `workspace-security.md`,
`git-inspection.md`, and `agent-protocol.md`.

Phase 5.2 validation profiles are administrator-controlled. Requests may select
profile IDs only; they cannot supply commands, shells, arguments, environment
variables, working directories, timeouts, or network policy. Validation runs in
a temporary workspace copy and reports bounded logs and classifications. See
`verified-code-validation.md`.

Phase 5.3 workflows coordinate planning, task dependency state, checkpoints,
artifact links, progress, cancellation, and reporting. They do not approve or
execute patches, start arbitrary commands, or bypass validation. See
`autonomous-development-workflows.md`.

Phase 11 commands are parsed into structured intent, safety classification,
plans, and history. Natural-language text is never executed directly. Saved
commands and macros are convenience templates only; each command must still pass
clarification, policy, approval, recent-authentication, private-network,
trusted-device, emergency-stop, and provider-specific execution checks. See
`intent-execution-engine.md`.

Phase 12 tasks are persistent proactive coordination records. Schedules,
triggers, conditions, reminders, goals, routines, monitors, and checklists do
not grant authority. Triggered tasks either wait for approval or route through
the Phase 11 command system; they never run hidden execution or bypass existing
provider controls. See `autonomous-task-engine.md`.

Phase 13 desktop capabilities are explicit contracts plus provider records.
Registration does not grant operating-system access. Provider-unavailable
capabilities deny by default, and metadata-safe capabilities report status only.
The system still has no generic executor, shell bridge, unrestricted
AppleScript, unrestricted Accessibility, raw input injection, arbitrary
filesystem access, browser automation bypass, or camera/microphone access. See
`desktop-capability-layer.md`.

Phase 14 spatial interaction treats gestures as convenience input, not
authorization. Camera permission starts `not_requested`, raw frames are not
persisted, and agents never receive raw camera feeds. Confirmed mapped gestures
route to the Intent Engine as `source: "gesture"` and must still pass policy,
approval, recent-authentication, trusted-device, private-network,
emergency-stop, Desktop Capability Layer, and audit controls. Gesture input
cannot approve high-risk actions or directly control the operating system. See
`spatial-interaction-system.md`.
