# Application Adapter Developer Guide

Use shared Zod schemas from `@alexa-control/shared` when adding adapter-facing
records or APIs. Do not duplicate schema shapes locally.

Adapter development rules:

1. accept registered application IDs, never executable paths;
2. use the Trusted Application Registry before exposing capabilities;
3. map capabilities to fine-grained adapter permissions;
4. compute risk server-side;
5. route effects through the Desktop Capability Layer;
6. keep browser pages on the same adapter interface;
7. store bounded semantic metadata only;
8. audit trust, permission, refresh, synchronization, revocation, and failures;
9. fail closed when provider health, permissions, or trust state is unknown.

Native Accessibility providers may be added only as reviewed providers behind
the adapter interface. They must not dump raw Accessibility trees into logs,
audit events, prompts, or renderer IPC.
