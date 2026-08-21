# Personality Core

Phase 19A Part 2 adds a deterministic, model-independent Personality Core on
top of the Human Understanding Layer.

The Personality Core owns:

- stable identity;
- bounded behaviour traits;
- communication rules;
- social rules;
- interaction policies;
- decision preferences;
- owner working style;
- runtime behaviour state;
- evidence-based learning;
- profile versions and simulations;
- response explanations.

It does not own planning, policy, approval, memory authority, provider
execution, or AI reasoning. LLMs receive personality context only when a request
already requires model reasoning.

## Runtime placement

Input flows through:

Human Understanding → Personality Core → Behaviour Engine → Decision
Preferences → Conversation Policy → Planner → optional AI Router.

The Planner receives a `personalityCore` object with identity, active traits,
policies, decision preferences, working styles, communication rules, and current
behaviour state.

## Persistence

Part 2 records are owner-scoped JSONB records in migration
`0048_phase_19a_part2_personality_core.sql`. Bootstrap records use stable IDs so
re-running bootstrap updates defaults without duplicating them.
