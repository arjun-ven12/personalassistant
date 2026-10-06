# Futuristic command center UI

Phase 7.5 redesigns the dashboard as a near-future AI command center without
changing backend functionality, APIs, workflows, agents, permissions, or
architecture.

## Design language

The interface uses a dark operating-system shell with:

- top command bar
- Lucide icon navigation rail
- central mission workspace
- context intelligence sidebar
- persistent telemetry bar
- glass panels
- thin blue-tinted borders
- subtle animated grid, scanlines, and radial lighting
- restrained accent colors

The goal is premium engineering mission control, not a movie replica or gaming
skin.

## Design tokens

Core tokens live in `apps/web/src/styles.css`:

- `--bg`: `#040608`
- `--panel-primary`: primary glass panels
- `--panel-secondary`: secondary panels
- `--card`: cards
- `--border`: `rgba(120, 190, 255, 0.12)`
- `--accent`: `#57B8FF`
- `--success`: `#43E7A2`
- `--warning`: `#FFC857`
- `--danger`: `#FF5D6E`
- `--text`: `#F2F6FC`
- `--text-secondary`: `#93A3B8`
- `--muted`: `#5A677A`

These tokens are intentionally centralized so future high-contrast, light, or
custom-accent themes can be added without rewriting individual pages.

## Motion guidelines

Motion is subtle and operational:

- slow ambient grid drift
- scanline texture
- soft live-dot pulse
- hover lift on panels
- focus rings for keyboard navigation
- no flashy neon bursts

Reduced-motion preferences are respected through `prefers-reduced-motion`.

## Accessibility

The redesign keeps:

- semantic landmarks
- keyboard focus visibility
- high-contrast media-query support
- text-first navigation labels for screen readers
- restrained animation with a reduced-motion fallback

## Implementation notes

Most existing pages reuse shared classes such as `panel`, `status-card`,
`registry-list`, `policy-form`, and `button-row`. That keeps the redesign broad
and consistent while preserving existing page behavior.

## Home command center

The `/` landing screen is implemented as a cinematic command-center scene in
`apps/web/src/HomeCommandCenter.tsx`.

It remains a UI-only layer. It reads existing dashboard telemetry through the
current authenticated API client and does not add backend routes, permissions,
workflows, agent behavior, repository access, or execution capability.

Phase 7.5.1 keeps the existing application shell, sidebar, top bar, workspace
header, and context panel intact. The home content itself is organized as a
professional command-dashboard composition: a split hero card with narrative and
primary telemetry on the left, the holographic AI ecosystem core on the right,
then structured summary cards below. This keeps the interface closer to a
premium operating console than a generic admin dashboard or a full-screen visual
demo.

The scene includes:

- lazy-loaded interactive Three.js holographic Earth in
  `apps/web/src/HomeScene3D.tsx`
- layered holographic AI ecosystem core with independent translucent shell,
  atmosphere, latitude/longitude layers, pseudo-continent repository regions,
  repository beacons, message particles, validation ripples, rotating orbital
  paths, and a pulsing AI core
- agent orbit nodes driven by the existing multi-agent dashboard data. Hovering
  or keyboard-focusing a node pauses the orbit and shows status, health, current
  task, derived progress, latency label, and last activity
- workflow orbit rings whose color and progress are derived from existing
  workflow records
- animated agent constellation, repository galaxy, workflow streams, telemetry
  widgets, particle/noise/grid background, and holographic floating panels
- visible emergency-stop control preserved on the home screen
- reduced-motion fallback for users who prefer less animation

Heavy 3D dependencies are split into a dedicated Vite vendor chunk so the
application shell and non-home pages do not eagerly execute the WebGL scene code.
The Three.js vendor bundle remains large by nature, but it is cacheable and only
loaded by the home scene.

## Mobile layouts

`apps/web/src/mobile.css` loads after the page styles. The app shell stacks below
920px, with labeled, horizontally scrollable navigation. Below 620px, forms and
detail workspaces stack, summary metrics use compact grids, and dense tables
scroll within their own containers. Touch controls have a 44px minimum height;
form text uses 16px to avoid mobile input zoom. Safe-area spacing and dynamic
viewport heights accommodate mobile browser chrome. Runtime panels are bounded
to the viewport; spatial mode panels flow vertically on phones.

These changes affect presentation only. Authentication, approval, emergency stop,
and the persistent camera/microphone runtime lifecycles use the existing paths.

Validation used Chromium at 320, 390, 768, 1024, and 1440px with authenticated
unavailable-data fixtures for 15 route shells, plus 25 populated CSS layout
fixtures and phone sign-in/registration. Live authenticated data and physical
devices were not tested. Existing cross-device `currentRoute` schema errors
prevented browser mounting of Voice, Memory, Companies, Portfolio, and Services;
their shared layouts are covered by CSS fixtures, not end-to-end route checks.

## Sound hooks

No audio is implemented. The UI exposes future sound integration points by
dispatching browser custom events such as:

```ts
window.dispatchEvent(
  new CustomEvent("assistant:sound-hook", {
    detail: { event: "agent_hover", agentId },
  }),
);
```

Future sounds should subscribe to these events without changing policy,
permissions, workflow, or agent behavior.
