# Engineering Advisor

Phase 10 adds a strategic engineering intelligence layer. It is an advisor, not
an executor.

The advisor can track goals, generate plans, assess repository and architecture
health, record risks and technical debt, simulate scenarios, produce roadmaps,
and assess release readiness. It never approves work, starts workflows, applies
patches, runs validation, calls integrations, deploys, or changes settings.

## Data model

Shared contracts live in `packages/shared/src/advisor.ts`.

Migration `0013_phase_10_engineering_advisor.sql` adds owner-scoped records for:

- `engineering_goals`
- `goal_dependencies`
- `goal_progress`
- `strategic_plans`
- `technical_debt`
- `engineering_risks`
- `repository_health`
- `architecture_health`
- `recommendations`
- `opportunities`
- `roadmaps`
- `roadmap_items`
- `release_assessments`
- `simulation_runs`
- `engineering_metrics`

PostgreSQL persists these records in production. In-memory stores remain
available for explicit development and unit tests.

## Services

`EngineeringAdvisorService` reuses existing stores:

- repository intelligence for repository scope and indexing state
- workflows for long-term workflow context
- cognitive memory for decisions and knowledge
- agents for specialist context
- audit logging for traceability

The service writes advisor records only. It has no dependency on patch
execution, validation runners, integration operations, shell commands, Git
mutation, browser automation, or privileged Mac control.

## APIs

Authenticated owner APIs:

- `GET /api/advisor/dashboard`
- `GET /api/advisor/goals`
- `POST /api/advisor/goals`
- `POST /api/advisor/goals/:goalId/plan`
- `GET /api/advisor/recommendations`
- `GET /api/advisor/risks`
- `GET /api/advisor/repository-health`
- `GET /api/advisor/architecture-health`
- `GET /api/advisor/technical-debt`
- `GET /api/advisor/roadmaps`
- `POST /api/advisor/simulations`
- `GET /api/advisor/release-readiness`
- `GET /api/advisor/metrics`

Mutations require exact trusted origin and CSRF protection.

## Dashboard

The Advisor page appears under Engineering → Advisor. It shows:

- active goals
- open recommendations
- open risks
- average repository health
- goal creation
- strategic plan generation
- scenario simulation
- repository and architecture health
- roadmaps
- release readiness
- technical debt inventory

The page is an analysis surface. It is not an execution surface.

## Security boundary

Recommendations are not authority. A recommendation, roadmap, scenario
simulation, goal, health score, or release assessment cannot bypass:

- authentication
- device trust
- network verification
- CSRF
- policy evaluation
- owner approval
- signed execution
- validation
- audit logging
- emergency stop

All strategic intelligence remains advisory until the owner explicitly starts a
separate approved workflow.
