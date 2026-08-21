# Constrained read-only execution

Phase 4.1 supports only fixed read-only handlers:
`workspace.inspect_metadata`, `workspace.read_file`, `git.status`, `git.diff`,
`git.current_branch`, and `repository.scan_metadata`. This is not general Mac
control. Application control, writes, arbitrary filesystem access, shells,
caller-selected executables or arguments, Git mutation, Codex, browser
automation, and AI remain unavailable.

An authenticated owner creates a strict request. The API requires CSRF and a
verified private connection, resolves the registered workspace and trusted Mac,
evaluates existing policy, checks emergency stop, persists the request, and
signs the exact work item. The outbound Mac client verifies the pinned server
key, atomically claims and starts the item, sends signed heartbeats while work
is active, dispatches one fixed handler, signs
the bounded result, and submits it. The API rechecks device trust, signature,
nonce, digest, state, size, expiry and emergency stop.

New pairing flows return the server execution public-key pin and fingerprint in
the pairing response, so the Mac agent can persist that public verification key
with non-secret device metadata. Existing development installs may still use
`ALEXA_SERVER_EXECUTION_PUBLIC_KEY` as a fallback pin.

States are `PENDING`, `CLAIMED`, `RUNNING`, `SUCCEEDED`, `FAILED`,
`TIMED_OUT`, `CANCELLED`, `EXPIRED`, and `REJECTED`. Only one claim and one
terminal result are accepted.

Requests default to 120 seconds and results to one-day retention. File reads
are capped at 128 KiB, Git output at 256 KiB and 1,000 entries, ordinary
execution results at 512 KiB, and repository metadata scan results at a
separate bounded limit. Frontend inputs cannot raise limits.

Cancellation is persistent. Pending work cannot start after cancellation. While
work is active, failed signed heartbeats abort local Git/file work where the
handler supports `AbortSignal`. A cancelled server request may accept only a
signed `CANCELLED` acknowledgement from the assigned trusted device; it cannot
be changed to success.

Owner-visible provenance includes request ID, device ID, workspace ID, action
digest, policy evaluation ID, server-key fingerprint, hashed workspace root,
result digest, retention expiry, and the continuing guarantee that privileged
and write execution are unavailable. Expired requests and retained results can
be cleaned explicitly through the owner dashboard/API.
