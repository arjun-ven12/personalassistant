# Approval lifecycle

## Binding

An approval is created only after deterministic policy reaches an approval
rule. The complete validated proposal is recursively canonicalised with sorted
object keys and hashed using SHA-256. The record binds owner, optional device,
action ID, digest, tool, target, risk, and approval requirement.

List responses contain a bounded human summary and digest, not complete
arguments. Summaries use only tool and registered target IDs, so argument
secrets do not enter the approval list or audit log.

## States

```text
PENDING ── approve ──> APPROVED
   ├──── reject ─────> REJECTED
   ├──── cancel ─────> CANCELLED
   └──── expiry ─────> EXPIRED

APPROVED ── future atomic execution boundary ──> CONSUMED
```

Terminal records are immutable. Lazy reads convert overdue pending records to
`EXPIRED`. Duplicate pending requests for the same owner and digest reuse the
existing record. Re-evaluation recognises an exact approved explicit approval
but does not consume it in Phase 2.2 because no execution transaction exists.

## Approval controls

Approval, rejection, and cancellation require the current authenticated owner
session and trusted browser origin. Cross-owner access returns not found.
Explicit approvals may transition to `APPROVED`. High-risk records require
`recent_authentication`; ordinary password sessions do not satisfy it, and the
approval endpoint returns `RECENT_AUTHENTICATION_NOT_AVAILABLE`.

No passkey, biometric, or timestamp shortcut is simulated. Approval never calls
an executor. A future phase must atomically verify and consume an approval
immediately before a separately reviewed executor acts.

# Phase 2.3 recent authentication

`recent_authentication` approvals use a dedicated password challenge and
short-lived server grant. The approval remains tied to the canonical action
digest and grants are consumed for `approve_high_risk_action`. The password is
never submitted to the approval endpoint. Approved records do not themselves
execute; a separate Phase 3.1 service must revalidate and create a bound
read-only request.
