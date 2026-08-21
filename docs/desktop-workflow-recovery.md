# Desktop Workflow Recovery

Failure recovery is deterministic and conservative. Supported recovery actions
are retry, rollback, resume, skip with approval, abort, and alternative skill
selection.

Recovery must never invent new actions, modify skills automatically, bypass
permissions, or continue through an unverified semantic state. High-risk
recovery paths require approval.

The initial Phase 17F implementation records recovery suggestions and metrics;
native rollback effects remain unavailable until reviewed capability providers
exist for the specific application and action.
