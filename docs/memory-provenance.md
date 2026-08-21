# Memory Provenance

Memory Studio surfaces provenance as bounded `CognitiveProvenance` records.
Provenance describes where a cognitive item came from and why it is considered
usable context.

## Included metadata

- source system and source ID;
- evidence kind and optional bounded excerpt;
- confidence;
- observation timestamp;
- promotion and owner confirmation flags.

## Excluded metadata

Provenance must not expose secrets, raw prompts, hidden reasoning, raw vectors,
cookies, tokens, private keys, recovery codes, authentication codes, secure text,
raw audio, camera frames, screenshots, or unrestricted DOM/Accessibility dumps.

## Audit link

Studio actions write audit-linked metadata for archive, restore, pin, update,
preview, and export activity. Audit entries identify the action class without
recording sensitive action arguments.
