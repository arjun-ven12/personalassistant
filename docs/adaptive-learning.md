# Adaptive Learning

Personality learning is statistical and evidence-based.

Every observation stores:

- observed behaviour;
- evidence count;
- confidence;
- first seen and last seen timestamps;
- decay rate;
- manual override flag;
- explanation;
- proposed change;
- applied status.

A single interaction never rewrites personality. Learned preferences activate
only after the configured evidence threshold or a guarded owner edit. Preference
confidence records explain the current value, proposed value, evidence count,
confidence, and reason.
