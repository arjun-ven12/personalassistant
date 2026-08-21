# Behaviour Engine

The Behaviour Engine applies deterministic interaction behaviour before
planning. It handles bounded situations such as greetings, thanks, stopping,
clarification, failure acknowledgement, and low-risk conversational responses.

Traits are bounded `0–100` records. Defaults include directness, detail level,
curiosity, initiative, patience, precision, verification level, risk tolerance,
learning speed, and question frequency.

Behaviour rules may shape responses. They must not execute desktop
capabilities, approve work, bypass Planner, mutate application state, or treat
AI output as authority.
