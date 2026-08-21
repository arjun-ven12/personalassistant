# Native Bridge

Phase 17H did not add a Swift native bridge.

Before adding one, the project must prove that Electron, Node.js, Launch
Services, and safe macOS permission-status APIs cannot implement the reviewed
semantic capability. A bridge may be introduced only for a specific finite
capability, and only inside the existing Mac Agent.

Allowed bridge shape:

- internal to the Mac Agent;
- schema-validated IPC only;
- finite semantic operations only;
- provider-owned bundle identifiers and registered IDs only;
- structured result and verification output.

Prohibited bridge shape:

- generic `execute`, `run`, `invoke`, or `dispatchRaw`;
- arbitrary AppleScript;
- arbitrary shell;
- caller-selected executable paths;
- raw Accessibility access;
- coordinate clicking;
- mouse or keyboard replay;
- OCR or screenshot automation;
- user-supplied scripts.

The current provider host exposes `nativeBridgeUsed: false` for every result.
