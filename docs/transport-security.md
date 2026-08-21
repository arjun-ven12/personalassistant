# Transport Security

Trusted Native Execution Transport preserves the existing execution security
model:

- server-signed execution envelopes;
- device-signed lifecycle and result messages;
- trusted device requirement;
- nonce replay protection;
- timestamp and expiry checks;
- private-network verification;
- emergency-stop enforcement;
- provider registration and health checks;
- trusted application checks;
- declared capability checks;
- policy evaluation;
- bounded result validation;
- audit records.

The transport cannot execute arbitrary requests, shell text, AppleScript,
scripts, raw Accessibility calls, mouse/keyboard replay, screenshots, OCR,
coordinates, or caller-selected executable paths.
