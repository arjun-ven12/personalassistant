# Confidence Engine

The Phase 19A Confidence Engine combines deterministic stage scores into an
overall confidence band:

- `95–100%`: execute immediately
- `90–95%`: execute
- `80–90%`: minor clarification if needed
- `60–80%`: ask clarification
- `<60%`: AI router candidate

Only contributing signals are weighted. This avoids penalizing a strong command
match for unrelated empty stages such as behaviour rules or memory retrieval.

Confidence informs Planner context only. It never authorizes actions, bypasses
approval, or replaces policy.
