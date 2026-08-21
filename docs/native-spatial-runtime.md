# Native Spatial Runtime

Phase 14B extends spatial interaction from the browser dashboard into the Mac
agent. The native runtime is still governed input, not direct operating-system
automation.

## Gesture path

```text
Camera
  ↓
Electron renderer vision runtime
  ↓
Bounded gesture metadata
  ↓
Main-process Ed25519 signing
  ↓
Signed device route
  ↓
Spatial service
  ↓
Intent Engine
  ↓
Planner / Agent Society
  ↓
Desktop Capability Layer
```

The runtime never directly moves the mouse, presses keys, opens applications,
runs AppleScript, invokes Accessibility APIs, or executes shell commands.

## What is implemented

- Electron renderer camera runtime using local MediaPipe Tasks Vision.
- Local landmark/HUD rendering in the Mac agent.
- Narrow IPC methods for native spatial status, start, stop, and signed gesture
  submission.
- Main-process signed-device gesture submission to
  `/api/agent/spatial/gestures`.
- API verification for trusted device, private network, Ed25519 signature, and
  nonce replay protection.
- Owner-visible native runtime metadata through `/api/spatial/native`.
- PostgreSQL tables for native sessions, providers, runtime profiles, monitor
  layouts, runtime sync, overlays, desktop-context history, and metrics.

## Privacy and security

- Raw camera frames stay local to the Mac agent renderer.
- Camera frames, images, video, and full landmark streams are not sent to the API.
- Only compact gesture metadata is signed and submitted.
- Gesture input is not authentication.
- High-risk approval cannot be granted by gesture alone.
- Desktop interaction must use registered Desktop Capability Layer operations.

## Using it

1. Pair and trust the Mac agent.
2. Open the Mac agent window.
3. Use **Start native tracking**.
4. Grant camera permission when macOS prompts.
5. Perform a mapped gesture such as pinch.
6. The Mac agent signs the confirmed gesture and submits it to the API.

If the API rejects a gesture, check:

- the Mac agent is paired and trusted;
- the API is reachable over the private network;
- migrations include `0023_phase_14b_native_spatial_runtime`;
- the gesture has an enabled mapping in Gesture Lab;
- emergency stop and policy state permit the resulting intent.
