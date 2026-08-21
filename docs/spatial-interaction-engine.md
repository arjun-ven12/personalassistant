# Spatial Interaction Engine

Phase 14D adds a dashboard-only spatial interaction engine on top of the
Browser Spatial Runtime, Native Spatial Runtime, and Spatial UI Framework.

It does not add operating-system automation.

## What it provides

- A custom spatial cursor inside the dashboard, separate from the operating
  system pointer.
- Cursor smoothing, velocity, acceleration, simulated depth, inertia, and
  confidence.
- Hand ray projection from local landmark metadata.
- Target prediction based on hit testing, hover persistence, and motion.
- Dwell progress for future hands-free activation.
- Gesture sequence tracking such as `point → pinch`.
- Backend metadata for cursor metrics, ray sessions, predictions, physics
  profiles, gesture sequences, and spatial navigation history.
- Gesture Lab diagnostics for cursor, ray, prediction, physics, and sequence
  state.

## Runtime flow

```text
Local hand tracking
  ↓
Raw normalized hand cursor and landmarks
  ↓
Spatial Interaction Engine
  ↓
Smoothing / prediction / ray / dwell / sequence state
  ↓
Spatial UI Framework focus and activation
  ↓
Spatial API / Intent Engine for command-producing gestures
```

## Security boundary

- The spatial cursor never replaces the macOS pointer.
- Hand rays are dashboard targeting metadata only.
- The engine never invokes the Desktop Capability Layer directly.
- No keyboard, mouse, shell, AppleScript, Accessibility, application, browser,
  or filesystem control is introduced.
- Backend telemetry is bounded metadata only and excludes raw frames,
  screenshots, full landmark streams, secrets, private keys, and command output.
- Mouse and keyboard interaction remain available.

## APIs

- `GET /api/spatial/ui` exposes engine availability and recent metadata.
- `POST /api/spatial/ui/engine-metrics` records bounded cursor, prediction, ray,
  or navigation metadata.

## Developer notes

Dashboard components should participate through the Spatial UI Framework. Do not
write page-specific gesture handlers for individual buttons or cards when a
spatial primitive can be used instead.
