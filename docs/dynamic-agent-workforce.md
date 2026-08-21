# Dynamic Agent Workforce

Phase 10.5 adds dynamic agent generation on top of the existing multi-agent
system. It does not replace the built-in agents.

The Agent Factory can analyse a workflow goal, infer required capabilities,
reuse existing agents, create temporary specialists from templates, synthesize a
new specialist when a capability gap remains, and archive temporary agents when
work is complete.

## Security boundary

Dynamic agents do not gain new permissions.

They cannot:

- create other agents
- modify permissions
- approve workflows
- execute commands
- apply patches
- run validation profiles
- deploy
- call integrations
- access repositories outside assigned scope
- bypass audit, policy, approval, CSRF, signatures, or emergency stop

Dynamic agents are coordination records and specialist reasoning participants.
Any code change, validation, integration operation, or release still flows
through the existing human approval and trusted execution systems.

## Data model

Migration `0014_phase_10_5_dynamic_agent_workforce.sql` adds:

- `agent_templates`
- `agent_capabilities`
- `dynamic_agents`
- `agent_lifecycle`
- `agent_performance`
- `agent_usage`
- `agent_promotions`
- `capability_registry`
- `capability_history`
- `team_compositions`
- `dynamic_agent_memory`

The existing `agents`, `agent_tasks`, `agent_messages`, `agent_consensus`,
`agent_health`, and `agent_metrics` tables remain the collaboration substrate.

## Agent templates

The first template set includes:

- Backend Engineer
- Frontend Engineer
- Database Engineer
- DevOps Engineer
- Performance Engineer
- Security Engineer

Templates define capabilities, prompt boundaries, allowed advisory actions,
memory sources, and evaluation criteria. They do not define execution tools.

## Capability gap analysis

`AgentFactoryService` deterministically infers capabilities from workflow goals,
then compares them against currently registered agents. Missing capabilities are
covered by:

1. template-based temporary agents, when a template matches; or
2. synthesized specialists, when no template matches.

The resulting `team_compositions` record stores required capabilities, reused
agent IDs, dynamic agent IDs, missing capabilities, risk level, and rationale.

## APIs

Authenticated owner APIs:

- `GET /api/agents/dynamic/workforce`
- `GET /api/agents/templates`
- `GET /api/agents/capabilities`
- `GET /api/agents/capabilities/search`
- `POST /api/agents/team-compositions`
- `GET /api/agents/team-compositions`
- `GET /api/agents/dynamic`
- `POST /api/agents/dynamic/:agentId/retire`
- `GET /api/agents/lifecycle`
- `GET /api/agents/performance`
- `GET /api/agents/promotions`

Mutations require trusted origin and CSRF.

## Dashboard

The existing Agents page now includes an Adaptive Workforce section. It shows
dynamic agents, capability records, and a team-composition form while preserving
the existing dashboard layout.

## Promotion

Promotion candidates are stored for owner review. No dynamic agent becomes
permanent automatically.
