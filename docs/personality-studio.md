# Personality Studio

The Personality page now exposes:

- identity;
- active profile;
- bounded traits;
- interaction policies;
- decision preferences;
- learning progress;
- no-AI profile simulation;
- “Why did I respond this way?” response explanations;
- Human Understanding pipeline inspection;
- Personality Seed Corpus manifest, entry counts, validation history, imports,
  negative examples, vector seed previews, and utterance simulation.

Mutation endpoints remain authenticated, CSRF-protected, and trusted-origin
guarded. Dashboard controls edit personality metadata only; they do not grant
execution authority.

The corpus import control accepts the canonical local Markdown path and routes
through authenticated, CSRF-protected APIs. Validation failures prevent
activation when critical safety issues are present.
