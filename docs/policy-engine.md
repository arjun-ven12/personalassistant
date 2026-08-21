# Policy engine

## Trusted and untrusted inputs

The client may submit an action UUID, registered tool name, optional registered
target ID, bounded JSON arguments, and an optional capability subset. It cannot
submit identity, device trust, signature status, network state, emergency state,
risk, approval requirement, or a final decision.

The API derives the owner/session from authentication, obtains network state
from `NetworkVerifier`, resolves all registries server-side, and reads the
emergency stop from `GovernanceStore`. The browser simulation endpoint does not
claim device or signed-envelope verification.

## Deterministic order

The engine resolves the tool and validates target shape and ownership, then
applies capability/prohibition rules, disabled-record rules, registry
permissions, emergency stop, required device/signature checks, network state,
effective risk, approval requirements, and exact matching approval. Unknown or
internally inconsistent state denies.

Risk precedence is:

```text
prohibited > high > medium > low > read_only
```

Approval precedence is:

```text
prohibited > recent_authentication > explicit > session > none
```

Application overrides are combined with maximum precedence and cannot lower a
tool baseline. High risk requires recent authentication; medium requires
explicit approval; low requires an authenticated session. Permanent deletion,
arbitrary shell/filesystem access, `sudo`, credentials, Keychain, banking,
authentication codes, and disabling controls are prohibited.

## Fail-closed context

`UNKNOWN`, `PUBLIC_NETWORK`, and `UNAVAILABLE` produce
`NETWORK_NOT_VERIFIED`. The development default never fakes
`PRIVATE_NETWORK`. Emergency stop starts active and immediately produces
`EMERGENCY_STOP_ACTIVE`. Tests can inject deterministic state to cover the rest
of the rule graph.

Unknown/disabled tools and targets, owner mismatch, missing permissions,
untrusted required devices, unverified required signatures, invalid capability
subsets, missing/expired/mismatched approvals, and unavailable recent
authentication never allow.

Each result includes stable evaluation/action/owner IDs, decision, reason code,
human explanation, matched rules, risk, approval requirement, optional approval
ID, timestamp, and literal `executionAllowed: false`. The result is stored and a
bounded `POLICY_EVALUATED` audit event records safe IDs and classifications, not
arguments.

## Example outcomes

- `security.view` with injected private-network state and inactive emergency
  stop: `allow`, but no execution.
- `governance.update_registry`: `require_approval`; a matching approved digest
  can later return `allow`, still without execution.
- `security.modify`: `require_approval` with recent authentication; approval
  completion fails in Phase 2.2.
- `shell.execute_arbitrary`: `prohibited` under every context.

# Phase 2.3 network and recent-auth inputs

Policy receives only server-derived network state. `UNKNOWN`, `PUBLIC_NETWORK`,
and `UNAVAILABLE` deny private behavior. A high-risk approval can now be
decided only after the approval route consumes a session- and purpose-bound
recent-auth grant. Every result continues to set `executionAllowed: false`.

`executionAllowed: false` remains the broad privileged-execution invariant.
Phase 3.1 separately reports `readOnlyCapabilityExecution` and permits request
creation only for its five compiled-in tools after a fresh policy evaluation.
