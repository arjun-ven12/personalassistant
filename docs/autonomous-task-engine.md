# Autonomous Task Engine

Phase 12 adds a persistent proactive task layer. It lets the assistant manage
scheduled tasks, recurring routines, reminders, lightweight monitors,
condition-based watches, long-term goals, and reusable checklists while
preserving the existing governance model.

The task engine is proactive, but it is not privileged.

## What it stores

Tasks include:

- identity, owner, name, description, goal, type, category, priority, status,
  version, metadata, and audit trail
- schedule configuration with timezone, preview, quiet hours, and blackout
  periods
- trigger and condition summaries
- dependency references
- execution policy and approval policy
- assigned agents
- retry policy, timeout, deadline, success/failure criteria, and rollback
  strategy

Related records include task runs, triggers, conditions, dependencies,
notifications, goals, checklists, checklist items, routines, background
monitors, metrics, and suggestions.

## Scheduling

The first implementation supports persistent schedule definitions for:

- none
- once
- hourly
- daily
- weekly
- monthly
- yearly
- cron
- interval
- business days

It also stores schedule previews. Background execution remains governed and is
represented through run records rather than silent direct execution.

## Triggers and conditions

Triggers are explicit records for sources such as time, calendar, repository
changes, workflow completion, email, webhook, network state, trusted devices,
agent requests, and custom events.

Conditions use a structured form with logic, field, operator, expected value,
and optional time window. Low-confidence or unavailable state must fail closed
at provider execution time.

## Execution model

When a task is manually triggered and does not require approval, the task engine
submits the goal to the Phase 11 Intent & Execution Engine with source
`scheduled_task`. That creates the normal command, intent, plan, history, and
audit records.

If a task requires approval, triggering it creates a waiting-approval run
instead of routing the command.

The task engine does not:

- execute natural-language text
- run shell commands
- modify files
- call applications
- call integrations directly
- deploy
- approve work
- bypass emergency stop
- bypass policy or recent authentication

## Proactive intelligence

The baseline dashboard initializes:

- a lightweight workflow monitor
- task readiness metrics
- a suggestion to create a morning briefing routine

Suggestions are advisory. They do not create tasks unless the owner chooses to.

## Dashboard

The Task Center page shows:

- active and scheduled tasks
- waiting approvals
- monitors
- governance-bypass status
- task creation
- manual governed run queuing
- triggers, conditions, notifications, and runs
- goals, routines, checklists, and dependency counts
- proactive suggestions

All mutating dashboard calls use authenticated, trusted-origin, CSRF-protected
routes.

## Persistence

Phase 12 adds migration `0020_phase_12_autonomous_task_engine.sql`. PostgreSQL
remains the production source of truth. In-memory stores are retained only for
tests and explicit development mode.

## Security invariants

- Tasks are owner-scoped.
- Tasks persist across restarts through PostgreSQL in production.
- Autonomous task execution cannot bypass governance.
- Risk classification is computed server-side.
- Approval requirements can only be strengthened.
- High-risk and critical tasks require recent authentication.
- Task runs are auditable.
- Saved routines, checklists, goals, and suggestions do not grant authority.
- Future background workers must use the same task store, policy, approval,
  trusted-device, private-network, and provider execution boundaries.
