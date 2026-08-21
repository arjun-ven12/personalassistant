# Multi-agent engineering system

Phase 7 adds a secure multi-agent coordination layer. It models specialist
agents as owner-scoped, auditable participants in engineering workflows. It does
not give agents new execution permissions.

## Built-in agents

- Engineering Manager
- Planning Agent
- Coding Agent
- Review Agent
- Security Agent
- Testing Agent
- Documentation Agent
- Release Agent

Each agent has a stable ID, role, version, capabilities, supported task types,
health, metrics, and owner-scoped configuration.

## Communication protocol

Agent messages are immutable structured records containing:

- sender
- recipient
- conversation ID
- workflow ID
- task ID
- message type
- bounded payload
- evidence references
- priority
- timestamp

Messages are coordination records, not authority to execute.

## Context and consensus

Agents share repository, architecture, workflow, validation, execution, and
conclusion context through versioned context records. Security-sensitive or
high-impact work can open consensus records using rules such as majority,
unanimous, required specialist approval, or owner override.

## Security boundary

No agent can:

- approve its own work,
- bypass policy,
- bypass recent authentication,
- bypass patch approval,
- bypass validation profiles,
- execute arbitrary commands,
- mutate files directly,
- access external integrations directly,
- communicate outside immutable audited records.

Code changes remain Phase 5.1 approved patches. Validation remains Phase 5.2
fixed-profile execution. External systems remain Phase 6 governed integrations.

## Current limitations

The first Phase 7 implementation is a deterministic coordination/control-plane
foundation. It registers specialist agents, assigns tasks, records immutable
messages, opens consensus records, tracks health and metrics, persists state,
and exposes a dashboard. It does not run independent LLM workers, perform live
parallel reasoning, generate hidden patches, or execute tasks automatically.
