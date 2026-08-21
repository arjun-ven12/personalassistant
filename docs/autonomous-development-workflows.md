# Autonomous development workflows

Phase 5.3 adds a workflow coordinator for long-running engineering tasks. It is
an orchestrator, not a new executor. It decomposes high-level goals into tasks,
tracks dependencies, creates checkpoints, records events, and reports progress
while keeping all code changes and validation behind the existing Phase 5.1 and
Phase 5.2 gates.

## Lifecycle

1. Owner creates a workflow with a goal and one or more registered repositories.
2. The workflow engine creates a deterministic implementation plan and task
   graph.
3. The owner approves the workflow planning checkpoint.
4. The scheduler marks dependency-ready tasks as ready.
5. Advancing a ready task opens an approval checkpoint.
6. Patch generation, patch approval, patch execution, and rollback remain
   ordinary Phase 5.1 operations.
7. Validation remains ordinary Phase 5.2 fixed-profile validation.
8. Task artifacts such as patch IDs and validation run IDs can be linked to the
   workflow task.
9. Completed tasks unlock dependent tasks.
10. A final report summarizes task status, risks, validation state, and
    remaining work.

## State model

Workflow states include:

- `PLANNED`
- `READY`
- `WAITING_APPROVAL`
- `BLOCKED`
- `CANCELLED`
- `COMPLETED`

The shared contract also reserves additional states for richer later
orchestration, including analysis, patch generation, execution, validation,
failure, and rollback states.

Task states include:

- `PENDING`
- `READY`
- `WAITING_APPROVAL`
- `IN_PROGRESS`
- `BLOCKED`
- `FAILED`
- `COMPLETED`
- `CANCELLED`

Failed, blocked, or approval-waiting tasks prevent dependent work from
advancing.

## Approval strategy

The workflow record stores an approval strategy:

- `approve_every_patch`
- `approve_every_task`
- `approve_every_stage`
- `approve_high_risk_only`

This strategy controls workflow checkpoint planning only. It does not override
the patch approval engine, recent authentication, policy evaluation, trusted Mac
assignment, signed execution envelopes, private-network checks, CSRF, replay
protection, or emergency stop.

## Persistence

Phase 5.3 persists:

- workflows
- workflow tasks
- task dependencies
- checkpoints
- events
- progress records
- reports
- metrics
- history
- artifacts

The API returns bounded owner-scoped workflow views for dashboard inspection.

## Security guarantees

Workflows do not introduce:

- silent approvals
- hidden execution
- arbitrary shell access
- arbitrary file writes
- Git mutation
- browser automation
- app control
- policy bypass
- approval bypass
- public network bypass

All code modifications remain explicit approved patches. All execution remains
trusted signed work. All validation remains fixed profile validation. Workflows
are observable, interruptible, auditable, and rollback-aware.

## Current limitations

The first workflow engine uses deterministic task decomposition rather than an
LLM-backed planner. It tracks patch and validation artifact IDs, but it does not
automatically generate patches or start validation runs. Those steps remain
separate owner-controlled operations that can be linked back to workflow tasks.
