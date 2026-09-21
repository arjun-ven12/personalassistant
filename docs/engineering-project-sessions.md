# Existing project engineering sessions

An Engineering project session is an owner-facing conversation bound to one
registered repository in one company. It is not an Agent OS execution session.
Each project instruction goes through the existing Engineering Delivery service,
which creates or updates a governed Engineering Manager objective and retains its
task, workspace, validation, integration, and review boundaries.

The authenticated API at `/api/engineering-project-sessions` lists sessions and
creates one for an active repository. A session has a stable `conversationId`,
bounded transcript, and ordered delivery IDs. `POST /:sessionId/messages` accepts
a bounded instruction and idempotency key. If a delivery is active, the instruction
uses the existing bounded mid-run instruction path. After a terminal delivery, it
creates a new delivery against the same registered repository. `GET /:sessionId`
returns the transcript and concise run history, resolving message states against
current delivery records.

While a run is active, instructions are classified deterministically as a
requirement change, added requirement, question, control action, or independent
request. Requirement changes reuse the Engineering Manager's bounded replan
path. Independent requests persist in the session queue and the delivery
terminal event starts the next request sequentially. Owners may safely reorder
or cancel requests that have not started.

Undo resolves only a recent, session-scoped delivery with a recorded merged
integration commit. The native runtime reverts that exact commit in an isolated
worktree only when it is still the registered head; ambiguous targets, later
dependent work, conflicts, or moved history fail closed. Dependency requests
use the registered project package manager and finite dependency capabilities.
Preview start, restart, and stop reuse the registered development-server
profile and return a URL only after the bounded health check passes.

Company and owner scope are enforced on every session lookup and repository
selection. Mutations retain trusted-origin, CSRF, and verified private transport
checks. Session records are persisted in PostgreSQL migration `0103`; the
development configuration uses the matching in-memory store. The selected
repository's registered ID is the only repository identifier accepted from the
client. The service does not accept paths or shell commands.

The session endpoint does not expose shell, Git, filesystem, package-manager, or
IDE automation. Those operations use existing governed capabilities and
integration policy. A real implementation run requires
an online trusted Mac Agent, configured model provider, approved repository
capability and command profiles, and passing validation.
