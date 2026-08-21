# Personality Corpus Negative Examples

Negative execution examples prevent false-positive action. They are stored,
validated, indexed as safe retrieval context, and surfaced in the Human
Understanding Inspector.

They cover:

- quoted commands;
- reported speech;
- tutorial or documentation language;
- hypothetical questions;
- capability questions;
- negated commands;
- user corrections;
- destructive ambiguity.

When matched, Human Understanding returns:

- `mustNotExecute: true`;
- selected non-execution intent;
- blocked intent candidates;
- observable explanation;
- `aiUsed: false`.

Voice Runtime respects this flag and does not submit a command plan. It responds
that the phrase was understood as discussion rather than an instruction.

Critical safety behavior remains deterministic: vector similarity can surface a
negative example, but it never authorizes execution.

