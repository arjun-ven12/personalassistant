# Roadmap

Every phase is independently reviewed. Later work must not weaken earlier
boundaries, and a phase is not complete merely because a UI exists.

## Phase 1 — Secure foundation

**Objective:** establish a small auditable monorepo and deny-by-default
contracts.

**Deliverables:** shared contracts, environment validation, web shell, Fastify
API shell, isolated Mac-agent shell, security/network/gesture/voice
architecture, and tests.

**Security boundary:** execution is always disabled; no authentication,
persistence, external services, device signing, file/shell/app/browser access,
AI, or OS permissions.

**Definition of done:** installation, typecheck, lint, tests, production builds,
live API status, emergency stop, and connection testing all succeed without
credentials or external infrastructure.

**Deferred capabilities:** every operational assistant capability.

## Phase 2 — Authentication and private networking

**Objective:** identify the owner and approved devices over a private network.

**Deliverables:** owner account, passkeys or secure sessions, registered
devices, device key pairs, signed requests, nonce/replay protection, Tailscale
deployment, network verification, and revocation.

**Security boundary:** identity and connectivity only; authentication does not
grant tool execution.

**Definition of done:** unregistered, revoked, expired, unsigned, replayed,
public-network, and unauthenticated requests fail closed and are tested.

**Deferred capabilities:** application/workspace tools, policy-based execution,
AI planning, sensors, and integrations.

### Phase 2.1 status

Implemented in development: Argon2id owner authentication, HttpOnly cookie
sessions, logout/revocation, one-time device pairing, local Ed25519 generation,
public-key fingerprints, trusted/revoked device states, signature and timestamp
verification, in-memory nonce replay protection, rate limiting, audit events,
and an `UNKNOWN` network-verifier placeholder.

Phase 2.3 subsequently supplied reviewed PostgreSQL persistence, durable
private-key storage, Tailscale deployment and verification, persistent
append-only audit records, recovery procedures, and production hardening.
Passkeys and real Google OAuth remain deferred.

### Phase 2.2 status

Implemented in development: separate governance storage, owner-scoped
application/workspace metadata, mandatory blocked patterns, source-controlled
tool definitions, deterministic risk and policy evaluation, network and
emergency-stop fail-closed rules, canonical action digests, expiring explicit
approvals, unavailable recent-authentication approvals, policy history,
expanded audit records, and dashboard governance pages.

Phase 2.2 remains non-executing. Every policy response contains
`executionAllowed: false`; no `allow` result is connected to the Mac agent or
an operating-system primitive.

## Phase 2.3 — Persistent trust and recent authentication

**Objective:** replace development-only trust state with reviewed persistence
and add real recent-authentication proof.

**Deliverables:** relational identity/governance adapters, migrations,
append-only audit persistence, durable nonce/session state, reviewed device-key
storage, passkeys or platform biometrics, and Tailscale-backed verification.

**Security boundary:** stronger persistence and authentication still grant no
Mac execution.

**Definition of done:** restart-safe revocation and approvals, atomic state
transitions, real recent-auth proof, private-network attestation, backup and
recovery tests, and no execution surface.

**Deferred capabilities:** actual Mac tools, Codex, browser automation, AI,
voice, gesture, and integrations.

## Phase 3.1 — Constrained read-only Mac capabilities

**Objective:** execute a minimal set of owner-approved local operations.

**Deliverables:** approved application launch by registered ID, approved
workspace read access, registered project scripts, and Git status/diff.

**Security boundary:** no arbitrary shell, unrestricted filesystem, model
paths, permanent deletion, privilege escalation, or sensitive applications.

**Definition of done:** canonical path containment, symlink defences, fixed
arguments, timeouts, cancellation, approval enforcement, and audit evidence are
tested.

**Deferred capabilities:** write access beyond reviewed scopes, Git mutation,
Codex, browser automation, AI planning, and sensors.

## Phase 5 — Codex integration

**Objective:** support reviewable coding sessions inside registered workspaces.

**Deliverables:** read-only inspection, separately approved write mode,
temporary branches, diff review, tests, validation, and explicit commit/push
approval.

**Security boundary:** Codex receives only workspace-scoped capabilities;
generated shell text is never executed outside registered tools.

**Definition of done:** mode changes require approval, diffs and checks are
visible, writes stay in the workspace, and commit/push remain distinct
approvals.

**Deferred capabilities:** browser automation, autonomous deployment, general
shell access, sensors, and broad integrations.

## Phase 6 — Engineering tool integrations

**Objective:** connect to engineering tools through governed integration
capabilities.

**Deliverables:** integration registry, connector descriptors, capability
permissions, credential-status boundaries, health checks, usage tracking,
operation requests, audit records, dashboard, PostgreSQL persistence, and
documentation.

**Security boundary:** installing an integration does not grant external access.
Every operation must name an installed integration, declared capability,
declared operation, target, reason, and approval state. Credential values remain
secret and live third-party mutations require separately reviewed connector
adapters plus explicit approval.

**Definition of done:** unknown connectors and operations deny, permissions are
owner scoped, usage and health are visible, operations are audited, and no
credential values or live external mutations are exposed by default.

**Deferred capabilities:** live OAuth/PAT exchange, Slack sends, issue updates,
documentation writes, CI dispatch, deployments, IDE control, public webhooks,
and arbitrary browser automation.

## Phase 7 — Multi-agent engineering

**Objective:** coordinate specialist engineering agents through the existing
workflow, policy, approval, audit, and execution model.

**Deliverables:** agent registry, built-in engineering manager/planning/coding/
review/security/testing/documentation/release agents, task assignments,
immutable structured messages, shared context, consensus records, conflict
records, health, metrics, APIs, dashboard, and persistence.

**Security boundary:** agents coordinate and review; they do not receive
independent execution authority, cannot approve their own work, cannot bypass
Phase 5 patches or validation, and cannot call integrations outside Phase 6
permissions.

**Definition of done:** all agent communication is owner-scoped, authenticated,
timestamped, immutable, visible, and audited; unknown agents deny; consensus
records surface conflicts to the owner.

**Deferred capabilities:** independent LLM worker execution, hidden
communication, autonomous patch application, automatic deployments, and
cross-owner agent pools.

## Phase 8 — Gesture engine

**Objective:** provide local, visible, low-risk gesture input.

**Deliverables:** MediaPipe, local hand landmarks, pinch, point, open palm,
fist, swipes, calibration, smoothing, debouncing, assistant mode, cursor
sandbox, and emergency disable.

**Security boundary:** frames remain local and unpersisted by default; gestures
cannot authenticate or approve high-risk actions.

**Definition of done:** permissions are explicit, the camera indicator is
visible, false positives are bounded, inactivity disables control, and the
emergency shortcut works without network access.

**Deferred capabilities:** biometric gesture identity, hidden camera use,
unbounded OS cursor control, and high-risk approval.

## Phase 9 — Voice and speaker verification

**Objective:** add push-to-talk convenience while keeping authorisation
separate.

**Deliverables:** speech-to-text, optional wake word, speaker enrolment and
verification, anti-replay analysis, and risk-limited voice commands.

**Security boundary:** voice and speaker match never independently approve
high-risk actions; passkey or system biometric confirmation remains required.

**Definition of done:** recording/clone scenarios are tested, consent and
indicators are clear, low confidence fails closed, and sensitive actions always
escalate.

**Deferred capabilities:** voice-only security changes, credential access,
banking, deployment, email sending, Git push, and permanent deletion.

## Phase 10 — Integrations and Android

**Objective:** provide a reliable remote owner experience and narrowly scoped
service adapters.

**Deliverables:** Gmail, Calendar, GitHub, and Figma adapters; Android app;
system biometrics; push notifications; remote approvals; backups; updates; and
monitoring.

**Security boundary:** each adapter uses least-privilege scopes and registered
tools; Android keys are device-bound; remote approval binds to the exact action.

**Definition of done:** revocation, scope review, audit records, failure
recovery, backup restoration, update rollback, and end-to-end approval tests
pass.

**Deferred capabilities:** general remote access, unrestricted integrations,
custom fingerprint recognition, and autonomous consequential actions.

## Next milestone

The recommended next milestone is **Phase 3.1 — constrained read-only Mac
capabilities**. It must preserve Phase 2.3's identity, private-network, policy,
approval, emergency-stop, and audit boundaries; expose only individually
registered read-only capabilities; and keep arbitrary shell, filesystem,
browser, Git mutation, Codex, and application control unavailable.

# Phase status

Phase 3.1 adds a signed, outbound, persisted pipeline for bounded reads from
registered workspaces plus fixed Git status/diff/branch inspection. It has no
file writes, Git mutation, application control, shell, generic executor, Codex,
browser, AI, camera or microphone capability. The recommended Phase 3.2 scope
is hardening and owner-reviewed read-only result workflows—not write access.

Phase 11 adds the universal command surface above the completed intelligence,
agent, workflow, integration, validation, memory, and organizational layers.
Its purpose is intent understanding, planning, safety classification,
clarification, command history, reusable command templates, macros, and
governed routing. It does not add unrestricted execution; all future action
continues to require the existing policy, approval, network, device, audit, and
provider-specific controls.

Phase 12 adds the proactive task surface above Phase 11. It persists schedules,
triggers, conditions, task runs, reminders, monitors, goals, routines,
checklists, metrics, and suggestions so the assistant can plan and queue work
over time. It remains a governed coordinator: scheduled or event-driven work
cannot silently execute, and consequential tasks must still pass approval and
provider-specific controls.

Phase 13 adds the desktop capability layer as the common boundary for future OS
integration. It persists capability contracts, providers, metadata-only desktop
context, application metadata, action history, metrics, and preferences. The
current provider set is intentionally conservative: only metadata-safe status
capabilities are available, while OS-affecting capabilities remain unavailable
until a separately reviewed provider exists. No generic executor, shell,
unrestricted AppleScript, unrestricted Accessibility, raw input injection, or
arbitrary filesystem control is introduced.

Phase 14 adds the spatial interaction surface above the Intent Engine. It
persists camera inventory contracts, vision sessions, pipeline stages, gesture
profiles, mappings, macros, calibration, custom gestures, history, versions,
and metrics. The current state is a safe framework: no camera permission is
requested, raw frames are not stored, gestures are not authentication, and
confirmed mapped gestures become governed commands rather than direct desktop
actions.
