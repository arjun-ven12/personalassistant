# Agent Society

Phase 10.9 adds an organizational-intelligence layer above Agent OS, agent
cognition, and agent evolution. The platform can now represent agents as a
governed engineering organization with departments, teams, roles, leadership,
debates, consensus sessions, peer review, mentorship, communications,
reputation, collaboration graphs, organizational memory, and health metrics.

Agent Society is organizational only. It does not grant permissions, approve
work, execute tools, apply patches, run validations, call integrations, deploy,
or alter governance.

## Organizational model

The baseline organization includes:

- organization record;
- departments for planning, engineering, and governance;
- configurable organizational roles;
- reputation scores for registered agents;
- health metrics for organization health, knowledge sharing, and workload
  balance.

Workflow-specific task forces can be formed from existing specialists. The
service records team membership, leadership flags, workload scores, assignment
communications, initial consensus, organizational memory, and health metrics.

## Collective reasoning

Debates are structured records with topics, arguments, stance, evidence,
confidence, and visible status. Consensus records capture the selected rule,
final decision, evidence, dissenting opinions, confidence, and whether human
escalation is required.

These records support explainability. They are not authority to perform work.

## Meetings

Virtual meetings capture agenda, summary, decisions, and action items. Meeting
records are also promoted to organizational memory so future agents can retrieve
collective decisions and milestones.

## APIs

Authenticated owner APIs:

- `GET /api/agent-society/dashboard`
- `POST /api/agent-society/teams`
- `POST /api/agent-society/debates`
- `POST /api/agent-society/meetings`
- `GET /api/agent-society/teams`
- `GET /api/agent-society/debates`
- `GET /api/agent-society/meetings`
- `GET /api/agent-society/reputation`
- `GET /api/agent-society/collaboration`
- `GET /api/agent-society/analytics`
- `GET /api/agent-society/communications`
- `GET /api/agent-society/delegations`
- `GET /api/agent-society/peer-reviews`
- `GET /api/agent-society/mentorships`

Mutation routes require authentication, trusted origin, and CSRF validation.

## Security invariants

- Leadership is organizational only and never privileged.
- Team formation does not grant repository, filesystem, workflow, tool,
  integration, patch, validation, deployment, or approval permissions.
- Consensus is advisory and cannot override human approval or policy.
- Debates and peer reviews are visible records, not hidden instructions.
- Reputation influences recommendations only; it is not authorization.
- Organizational memory must preserve evidence and must not rewrite audit logs.
- Agent Society must not store secrets, credentials, cookies, tokens, private
  keys, recovery codes, raw source dumps, or unbounded logs.
- All organizational mutations remain audited and owner-scoped.
