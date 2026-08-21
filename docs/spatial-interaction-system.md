# Spatial Interaction System

Phase 14 turns the old Gesture Lab placeholder into a governed spatial input
layer. The system models camera inventory, vision sessions, gesture profiles,
gesture mappings, macros, calibration, history, custom gestures, versions,
tracking metrics, and performance metrics.

It does not directly control the operating system.

## Architecture

The spatial pipeline is modular:

1. Camera Manager
2. Frame Acquisition
3. Preprocessing
4. Hand Detection
5. Landmark Detection
6. Tracking
7. Gesture Recognition
8. Intent Mapping
9. Command Routing
10. Visualization
11. Metrics

Each stage is represented as a replaceable contract. Phase 14 registered the
pipeline and metadata. Phase 14A adds a browser-only runtime that requests camera
permission from the web app, runs MediaPipe locally in the browser, and submits
only compact gesture metadata back to this spatial layer. Phase 14B adds an
Electron native runtime that signs compact Mac-agent gesture metadata as a
trusted device before the API routes it through the same Intent Engine path.
Phase 14C adds a reusable Spatial UI Framework so dashboard elements expose
consistent hover, focus, selection, activation, and telemetry primitives instead
of page-specific gesture handlers.
Phase 14D adds the dashboard-only Spatial Interaction Engine for cursor physics,
hand rays, target prediction, dwell progress, gesture sequence metadata, and
spatial navigation records.
Phase 14E adds a governed Spatial Desktop Layer that registers desktop objects,
profiles, overlays, dock items, panels, and desktop interaction history. It can
route a spatial desktop interaction into the Desktop Capability Layer, but it
still never controls macOS directly.
Phase 14F adds an optional Spatial Command Space that transforms the dashboard
into a holographic operating environment backed by scene metadata, themes,
visualization layers, particle profiles, and spatial mode sessions.
Phase 14.4 promotes browser hand tracking into a persistent app-shell runtime.
Gesture Lab becomes a diagnostics and configuration surface; route navigation no
longer destroys the camera runtime, spatial cursor, hand rays, or HUD overlays.

## Governance boundary

Confirmed gestures become natural-language command requests with
`source: "gesture"` and are submitted to the existing Intent & Execution
Engine. From there, all normal planning, safety classification, approval,
recent-authentication, policy, trusted-device, private-network, Desktop
Capability Layer, and audit controls still apply.

Gestures must never:

- Directly launch applications.
- Directly move windows.
- Inject keyboard or mouse input.
- Read or write files.
- Approve high-risk actions.
- Bypass recent authentication.
- Bypass the Intent Engine.
- Send raw camera frames to agents or backend APIs.

## What is implemented

- Shared Zod contracts for spatial records and requests.
- PostgreSQL migration
  `0022_phase_14_spatial_interaction_system.sql`.
- In-memory and PostgreSQL spatial stores.
- Spatial service with baseline profile, camera inventory placeholder,
  mappings, calibration, macros, metrics, versions, and history.
- Gesture-to-intent routing for confirmed mapped gestures.
- Low-confidence and unmapped gesture denial records.
- Authenticated API routes:
  - `GET /api/spatial`
  - `POST /api/spatial/cameras/refresh`
  - `POST /api/spatial/profiles`
  - `POST /api/spatial/mappings`
  - `POST /api/spatial/gestures`
- Gesture Lab dashboard page showing pipeline, profiles, mappings, safety
  invariants, calibration, tracking metrics, and recognition timeline.
- Browser Spatial Runtime with local MediaPipe hand tracking, a virtual cursor,
  landmark HUD, gesture confidence, FPS/latency readouts, and website-only
  dashboard navigation intents.
- Native Spatial Runtime metadata, signed-device gesture submission, provider
  records, native sessions, runtime profiles, monitor layouts, runtime sync,
  overlays, and native metrics.
- Mac Agent pinch targets for the finite reviewed `launch` and `focus`
  capabilities. The signed request contains registered provider and application
  IDs only; the API revalidates application trust, permissions, provider health,
  policy, device identity, private-network state, and transport requirements
  before queuing native execution.
- Signed native route: `POST /api/agent/spatial/gestures`.
- Owner runtime inspector: `GET /api/spatial/native`.
- Spatial UI framework inspector: `GET /api/spatial/ui`.
- Bounded interaction telemetry: `POST /api/spatial/ui/metrics`.
- Bounded interaction-engine telemetry:
  `POST /api/spatial/ui/engine-metrics`.
- Spatial desktop interaction routing:
  `POST /api/desktop/spatial/interactions`.
- Spatial Command Space:
  - `GET /api/spatial/command-space`
  - `POST /api/spatial/command-space/mode`

## Baseline mappings

The default Productivity profile includes safe mappings:

- `pinch` → open/show governed command-center actions.
- `open_palm` → show emergency-stop controls and current security posture.
- `swipe_right` → show the next dashboard context panel.

These are informational/read-only commands. Even when routed, they remain
ordinary Intent Engine commands and cannot bypass governance.

## Privacy defaults

- Camera permission state starts as `not_requested`.
- Camera inventory is permission-gated.
- Raw frames are never persisted.
- Processing is declared local-only.
- High-risk gesture approval is disabled.
- Direct OS control is unavailable.
- Raw or coordinate-based clicking inside native applications is unavailable;
  spatial app activation uses reviewed semantic `launch` or `focus`
  capabilities only.
- Spatial desktop object metadata is bounded and provider-scoped.

## Native provider path

The Mac agent now includes a native Electron renderer runtime for local camera
tracking. The main process signs only bounded recognition metadata. Native
providers may evolve to use additional camera hardware, depth sensors, overlays,
or GPU acceleration, but they must keep raw frames local by default, expose only
bounded structured recognition events, and route every gesture through this
spatial layer and the Intent Engine.
