# Spatial UI Framework

Phase 14C adds a reusable interaction layer for dashboard UI components. It
does not change backend authority, desktop capabilities, gesture recognition, or
the Intent Engine.

## What it provides

- Shared spatial component contracts for buttons, cards, panels, nodes, menus,
  dialogs, timelines, canvases, links, and containers.
- Interaction states: idle, hover, candidate, focused, selected, activated,
  dragging, dropped, cancelled, and disabled.
- A browser-side `SpatialFrameworkProvider` with a component registry, global
  focus state, hover hit-testing, selection state, and gesture activation hooks.
- Reusable primitives: `Spatial`, `SpatialButton`, `SpatialCard`, and
  `SpatialPanel`.
- A runtime bridge used by the Browser Spatial Runtime to feed virtual cursor
  movement and confirmed gestures into the component registry.
- Owner-visible framework metadata at `GET /api/spatial/ui`.
- Bounded interaction telemetry at `POST /api/spatial/ui/metrics`.

## Interaction flow

```text
Browser or native spatial runtime
  ↓
Normalized virtual pointer / confirmed gesture
  ↓
Spatial framework registry
  ↓
Hit test and focus engine
  ↓
Spatial interaction event
  ↓
Component callback and telemetry
  ↓
Intent Engine for command-producing gestures
```

The framework does not add privileged execution. It can highlight and activate
registered UI components, and command-producing gestures still route through the
Spatial API and Intent Engine.

## Security boundaries

- Spatial UI events are not permissions.
- Spatial UI never directly controls macOS.
- Spatial UI never bypasses the Intent Engine, policy, approval, audit, or
  recent-authentication rules.
- Interaction telemetry is metadata-only. It does not include camera frames,
  screenshots, raw landmarks, passwords, cookies, private keys, or command
  output.
- Mouse and keyboard access remain available; spatial mode is additive.

## Developer guide

Wrap new interactive controls with a spatial primitive:

```tsx
<SpatialButton
  spatialId="settings:save"
  spatialLabel="Save settings"
  onClick={saveSettings}
>
  Save
</SpatialButton>
```

For existing controls that should remain visually unchanged:

```tsx
<Spatial
  as="a"
  href="/agents"
  spatialId="nav:/agents"
  spatialLabel="Agents"
  spatialType="link"
  onSpatialEvent={(event) => {
    if (event.type === "spatial_activate") navigate("/agents");
  }}
>
  Agents
</Spatial>
```

Use stable IDs. Do not encode secrets or user-provided sensitive content into
spatial IDs or telemetry.
