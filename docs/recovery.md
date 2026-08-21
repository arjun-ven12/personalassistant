# Recovery and restore

Define recovery-point and recovery-time objectives before production. Use
encrypted PostgreSQL backups with documented retention and periodic isolated
restore tests. Preserve device and session revocations, nonce history within
its validity window, approvals, audit records, recovery-code hashes, and the
default-active emergency stop.

Mac signing keys are not database backup material. They remain encrypted by
macOS secure storage on that Mac. To rebuild an agent, revoke the old server
device, explicitly reset the assistant-owned local identity, generate a new
key, and complete owner-approved pairing. Never copy private-key plaintext.

After restoration verify migrations, `/ready`, authenticated security
readiness, session/device revocation, replay rejection, CSRF, recent
authentication, recovery-code counts, emergency stop, tailnet-only reachability,
and that privileged execution remains unavailable.

Phase 3.1 recovery also verifies migration `0002`, server-key permissions and
pin, cancellation of stale device work, result-signature rejection, workspace
containment tests and fixed Git behavior before read-only polling resumes.
