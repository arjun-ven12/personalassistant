# Demonstration Learning Developer Guide

When adding a demonstrated skill source:

1. Submit only `RecordIntentEventRequest` semantic events.
2. Use registered capability IDs and semantic targets.
3. Include bounded arguments only.
4. Never include coordinates, pixels, screenshots, raw keyboard data, raw audio,
   camera frames, OCR, vision, passwords, tokens, cookies, or secure text.
5. Add deterministic tests for recording, parameter inference, workflow
   generation, validation, saving, simulation, editor operations, and security
   rejection.

Generated skills should remain review-required and inert until saved by the
owner.
