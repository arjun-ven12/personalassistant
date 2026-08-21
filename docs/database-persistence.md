# Database persistence

The API uses a single PostgreSQL pool with three adapters:

- `PostgresIdentityStore`: owners, hashed sessions, devices, pairing intents,
  replay nonces, and append-only audit records.
- `PostgresGovernanceStore`: registries, policy evaluations, approvals,
  built-in tool metadata, and emergency-stop state.
- `PostgresSecurityStateStore`: CSRF tokens, recent-auth challenges/grants, and
  recovery-code hashes.

Services depend on interfaces, not SQL. In-memory implementations remain for
unit tests and explicit development only. Production rejects memory.

Migration `0001_phase_2_3_security.sql` uses UUID keys, UTC `timestamptz`,
foreign keys, uniqueness, bounded columns, indexes, status checks, and
transactions for one-time pairing and security state. Run `pnpm db:status`,
`pnpm db:migrate`, or `pnpm db:migrate:deploy`. There is no production reset
command.

Back up the database with provider-managed encrypted backups, define retention,
and test restores into an isolated database. A backup is not validated until a
restore test confirms owner, device revocation, nonce, approval, audit, and
emergency-stop state. Never export plaintext session, recovery, or device-key
material.
