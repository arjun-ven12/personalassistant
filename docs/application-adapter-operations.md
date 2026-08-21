# Application Adapter Operations Guide

Operational checks for Phase 17E:

- verify database migration `0036_phase_17e_universal_application_adapters.sql`
  has run before enabling persistent adapter records;
- monitor adapter health, synchronization metrics, capability refresh latency,
  and revoked/unavailable applications;
- review governance audit events for trust, permission updates, refreshes,
  synchronization, and revocation;
- keep native provider health disabled or degraded when macOS permissions are
  unavailable;
- revoke individual applications when ownership, code signature, version, or
  trust state changes unexpectedly.

Background jobs may discover applications, refresh capabilities, validate
permissions, monitor health, detect updates, synchronize registry metadata, and
archive lifecycle history. They must remain bounded, owner scoped, auditable,
and non-executing unless routed through existing governed systems.
