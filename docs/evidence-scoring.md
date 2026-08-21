# Evidence Scoring

Scoring is deterministic and uses:

- positive and negative evidence counts;
- correction ratio;
- source diversity;
- repetition frequency;
- category policy thresholds;
- recency decay.

One observation remains `OBSERVING`. Repeated observations become `CANDIDATE`,
then `SUGGESTED` when evidence and confidence pass the category policy.
Low-risk auto-apply requires stronger evidence and is blocked for high-impact
or approval-required categories.
