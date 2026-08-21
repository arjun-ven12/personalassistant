# Desktop Skills Developer Guide

Desktop skills must be deterministic and reusable. When adding skills or
providers:

1. resolve applications through trusted application IDs;
2. reuse generated skills from Demonstration Learning when possible;
3. validate all external inputs with shared Zod schemas;
4. map every step to semantic capabilities;
5. validate adapter permissions and capabilities before starting execution;
6. create approval checkpoints for high-risk actions;
7. verify each step semantically;
8. audit lifecycle events;
9. fail closed when state, permissions, trust, or provider health is unknown.

Never add shell, AppleScript, generic OS automation, arbitrary filesystem,
browser automation, raw keyboard/mouse, pixel, OCR, coordinate, or hidden
execution surfaces.
