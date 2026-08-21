# Agent Evolution

Phase 10.8 adds autonomous agent evolution as an advisory layer above Agent OS
and agent cognition. It measures how agents improve over time, identifies
weaknesses, records successes and failures, benchmarks reasoning quality, and
creates owner-reviewable evolution proposals.

Evolution does not mutate agents automatically. It never changes permissions,
tools, prompts, capabilities, packages, workflows, integrations, or deployment
state without a separate owner-approved change path.

## Model

Agent evolution records:

- expertise profiles by agent, capability, confidence, success rate, recency,
  evidence, and growth trend;
- expertise history for level progression;
- proposal records for capability, prompt, reasoning, workflow, knowledge, and
  specialization improvements;
- capability, prompt, and reasoning version proposals;
- workflow and knowledge improvement recommendations;
- failure and success histories;
- benchmark results against historical baselines;
- self-evaluation reports;
- capability marketplace records; and
- a permanent evolution timeline.

All records are owner-scoped and agent-scoped.

## Proposal-only behavior

Evolution proposals always include:

- evidence;
- impact;
- confidence;
- risk;
- rollback plan;
- `requiresApproval: true`; and
- `status: proposed`.

Creating or analysing a proposal does not apply it. A rejected proposal can be
archived with no runtime impact because no agent state was changed.

## Capability marketplace

The capability marketplace is a registry of reusable capability descriptions.
It tracks popularity, reuse, quality score, version, dependencies, and evidence.
Marketplace records do not install tools or grant permissions. They are
candidate modules for future owner-approved agent package updates.

## APIs

Authenticated owner APIs:

- `GET /api/agent-evolution/dashboard`
- `GET /api/agent-evolution/expertise`
- `GET /api/agent-evolution/proposals`
- `POST /api/agent-evolution/proposals`
- `POST /api/agent-evolution/analyse`
- `GET /api/agent-evolution/timeline`
- `GET /api/agent-evolution/benchmarks`
- `GET /api/agent-evolution/self-evaluations`
- `GET /api/agent-evolution/marketplace`

Mutation routes require authentication, trusted origin, and CSRF validation.

## Security invariants

- Agents cannot modify their own permissions.
- Agents cannot grant themselves tools.
- Agents cannot rewrite prompts automatically.
- Agents cannot approve their own evolution.
- Evolution records are observability and planning data, not authorization.
- Evidence and audit records must be preserved.
- Secrets, raw source dumps, credentials, cookies, tokens, private keys, and
  recovery codes must not be stored in evolution records.
- Evolution analysis must not execute commands, modify files, call external
  integrations, deploy, or bypass governance.

## Dashboard

The Memory Center includes an Agent Evolution section showing expertise counts,
proposal counts, benchmark counts, self-mutation status, current expertise
records, and recent proposals. Owner-triggered analysis can generate new
proposal, benchmark, and self-evaluation records for review.
