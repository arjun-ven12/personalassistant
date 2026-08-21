# Universal Application Adapter Framework

Phase 17E introduces a common semantic adapter contract for trusted macOS and
browser applications. Planner, Voice, Gesture, Demonstration Learning, and
Agents interact with applications through adapter records rather than direct
operating-system APIs.

The framework is intentionally deny-by-default:

- applications are unavailable until explicitly trusted by the owner;
- executable paths are not accepted from clients, models, or callers;
- pixel automation, OCR, computer vision, coordinates, shell, AppleScript, code
  injection, and unrestricted Accessibility are not exposed;
- adapter changes are authenticated, CSRF protected, owner scoped, audited, and
  revocable.

The current implementation registers semantic adapter metadata, capability
discovery results, profiles, permissions, lifecycle events, context snapshots,
diagnostics, metrics, versions, health, and optional plugin placeholders. Native
Accessibility execution remains unavailable until a reviewed provider is
installed behind the Desktop Capability Layer.

## Pipeline

Trusted application registration flows through:

1. authenticated owner request;
2. trusted-origin and CSRF checks for mutations;
3. strict Zod validation;
4. explicit trust record creation;
5. generic or browser adapter surface registration;
6. capability and permission records;
7. health, version, plugin, and profile records;
8. governance audit.

Every later navigation or interaction phase must reference the trusted
application ID and adapter capabilities instead of direct OS handles.
