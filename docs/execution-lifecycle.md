# Native Execution Lifecycle

Native provider execution reuses the existing execution lifecycle:

1. `PENDING`
2. `CLAIMED`
3. `RUNNING`
4. `SUCCEEDED`, `FAILED`, `TIMED_OUT`, `CANCELLED`, `EXPIRED`, or `REJECTED`

The Mac Agent already submits signed `claim`, `start`, `heartbeat`, and `result`
messages. Native provider requests use the same lifecycle and result retention
controls as read-only workspace execution.

Provider verification must succeed before the Mac Agent reports `SUCCEEDED`.
Unverified provider results are reported as failed capability execution.
