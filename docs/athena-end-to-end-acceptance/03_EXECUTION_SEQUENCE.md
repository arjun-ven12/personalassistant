# Acceptance execution sequence

This is the intended acceptance sequence through existing services. The signed inert draft backend is verified; Android submission wiring and reviewed activation are subsequent dependencies. The alternate general-objective signed route is implemented separately.

```mermaid
sequenceDiagram
  actor Owner
  participant Android
  participant API as Existing authenticated API
  participant Delivery as Engineering Delivery
  participant Manager as Engineering Manager
  participant OS as Agent OS / assignments
  participant Policy as Policy / approvals / stop
  participant Queue as Signed execution channel
  participant Mac as Trusted Mac runtime
  participant Review as Integration / independent review
  participant DB as PostgreSQL / audit
  Owner->>Android: Brief, registered repository, explicit criteria
  Note over Android,API: Backend draft accepted; actual Android wiring remains gated
  Android->>API: Authenticated company-bound intent
  API->>Policy: Owner/session/device/signature/replay/scope checks
  Policy-->>API: Allow finite request or deny
  API->>DB: Transactionally persist inert objective/delivery and digest
  DB-->>Android: NOT_STARTED with stable draft IDs
  Note over Android,Delivery: Separate future activation of exact draft/version required
  Owner->>Android: Future reviewed activation (not implemented here)
  Android->>API: Future bounded activation request
  API->>Delivery: Existing execution services after accepted activation
  Delivery->>Manager: Existing bounded planning
  Manager->>DB: Persist objective, task DAG and events
  Manager->>OS: Resolve active authorized assignment / start isolated delegation
  loop Dependency-ready bounded tasks
    Manager->>DB: Claim fenced task/workspace lease
    Manager->>Policy: Exact finite proposal, current authority and approvals
    alt Approval required
      Policy-->>Android: Pending exact approval and recent-auth requirement
      Owner->>Android: Approve / reject with required authentication
      Android->>API: Existing owner decision
    end
    Policy->>Queue: Existing server-signed finite execution
    Mac->>Queue: Trusted signed poll
    Queue-->>Mac: Verified envelope or cancellation
    Mac->>Mac: Registered worktree / finite operation / registered checks
    Mac->>Queue: Signed result / bounded lifecycle
    Queue->>DB: Verified receipts and outcome
    DB-->>Manager: Current task result, never assumed success
  end
  Manager->>Review: Eligible completed task evidence
  Review->>Mac: Governed integration worktree + combined checks
  Review->>Review: Separate authorized reviewer on exact candidate head
  Review->>DB: Candidate, findings, validation and review IDs
  DB-->>Android: Current canonical readiness / blockers
  Owner->>Android: Request local merge / reject / revise / cancel
  Android->>API: Existing explicit owner control
  API->>Policy: Exact candidate/head approval and current revalidation
  Policy->>Queue: Finite local merge only if authorized
  Queue-->>Delivery: Verified outcome or unresolved failure
  Delivery->>DB: Persist terminal state and audit
  Delivery-->>Android: Canonical evidence + bounded notification
```

Every wait is bounded; timeout is not success. Cancellation/revocation must be tested before dispatch, after queueing, after poll, during effect, before accepting result, during integration and before local merge. A control returning “cancelled” cannot alone prove the Mac stopped. Retain cancellation acknowledgment/terminal execution evidence and inspect the disposable worktree afterward.

Model reasoning cannot alter repository permissions, enable profiles, approve its own change or mark its own unsupported receipt valid. Database state and signed result verification remain authoritative. Existing operation-level unknown-outcome handling must be used after interruption rather than inventing a replay policy.
