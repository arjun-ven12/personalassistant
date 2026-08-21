# Memory Security

Memory Studio preserves the repository’s fail-closed security model.

## Guarantees

- Authentication is required for all routes.
- Trusted origin and CSRF are required for mutations.
- Owner scope is enforced at every service boundary.
- Permanent deletion is prohibited.
- Merge is preview-only in Phase 19D.
- Export omits raw vectors, secrets, hidden reasoning, and sensitive arguments.
- Cognitive context never grants execution authority.

## Prohibited data

Memory Studio must not store or expose passwords, tokens, cookies, private keys,
recovery codes, authentication codes, secure text, raw microphone audio, raw
camera frames, screenshots, unrestricted DOM/Accessibility dumps, raw prompts,
hidden reasoning, raw vectors, or sensitive action arguments.
