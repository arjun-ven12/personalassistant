# Desktop Capability Layer

Phase 13 introduces a governed desktop-capability framework without adding
unrestricted operating-system control.

The layer defines capability contracts, provider boundaries, metadata records,
health, metrics, action history, and a Desktop Control Center. A capability is
not executable merely because it is registered. It also needs a reviewed,
healthy provider plus the existing authentication, CSRF, policy, approval,
trusted-device, private-network, emergency-stop, and audit controls.

## What is implemented

- Owner-scoped capability registry records.
- Provider registry records with health and supported categories.
- Metadata-only desktop context records.
- Application metadata records that never accept executable paths.
- Clipboard history, window layout, action, metric, and preference records.
- Phase 14E spatial desktop records: desktop objects, interaction profiles,
  overlay settings, dock items, floating panels, navigation history, and desktop
  spatial metrics.
- PostgreSQL persistence through migration
  `0021_phase_13_desktop_capability_layer.sql`.
- API routes:
  - `GET /api/desktop`
  - `POST /api/desktop/context/refresh`
  - `POST /api/desktop/actions`
  - `POST /api/desktop/spatial/interactions`
- Web Desktop Control Center under the Control navigation group.

## Capability categories

The registry models application management, window management, clipboard,
keyboard, mouse, filesystem, browser, email, calendar, notifications, media,
camera, microphone, OCR, vision, networking, desktop metadata, system
information, developer tools, automation, printing, and accessibility.

Only two metadata-safe capabilities are available by default:

- `desktop.context.read`
- `system_information.framework_status`

All OS-affecting capabilities are registered as provider-required and
unavailable until a later reviewed provider is installed.

## Provider model

Capabilities reference providers instead of embedding implementation logic.
The baseline providers are:

- `desktop_metadata_provider`: healthy, metadata-only, no OS control.
- `mac_agent_desktop_provider`: unavailable, documents the boundary for future
  reviewed macOS providers.

Provider-unavailable capabilities deny requests and write audited
`DESKTOP_ACTION_DENIED` action records.

## Security model

The Desktop Capability Layer must never expose:

- Generic shell execution.
- Caller-supplied commands, executables, arguments, cwd, or environment.
- Unrestricted AppleScript.
- Unrestricted Accessibility APIs.
- Raw keyboard or mouse injection APIs directly to agents.
- Arbitrary file access outside governed workspace policy.
- Browser automation bypasses.
- Camera or microphone access without explicit future provider review.

Capability request payloads cannot supply their own risk, trust, provider
health, approval, identity, or network state. Those values come from registered
records and existing server-side governance only.

## Dashboard behavior

The Desktop Control Center shows:

- Capability count and availability.
- Provider status.
- Explicit confirmation that generic execution, unrestricted Accessibility, and
  arbitrary AppleScript are unavailable.
- Metadata-only context and registered application metadata.
- Recent capability action records.

The UI is an inspector and request surface for governed capabilities. It is not
an OS control panel yet.

## Phase 14E Spatial Desktop Layer

The Spatial Desktop Layer makes desktop targets visible to the Spatial Runtime
without giving the runtime operating-system authority. A desktop object is a
bounded metadata record for an application, window, dock item, notification,
workspace, browser tab, or floating panel. Each object declares a provider,
capability binding, permissions, risk level, and normalized interaction anchors.

Spatial interaction requests use `POST /api/desktop/spatial/interactions`.
The service resolves the target object, finds its registered desktop capability,
checks provider availability, records a `DesktopActionRecord`, writes navigation
history and metrics, and audits `SPATIAL_DESKTOP_INTERACTION_RECORDED`.

Metadata-safe inspection of the dashboard can complete through
`desktop.context.read`. Provider-required actions, such as application launch or
window movement, deny or wait for approval depending on the registered
capability state. No request can include raw mouse, keyboard, AppleScript,
shell, executable path, or unrestricted Accessibility payloads.

## Future provider path

A future desktop provider must be reviewed as its own milestone. It should
implement one bounded capability at a time, declare schemas and risk, bind to
registered applications or workspaces, enforce provider-level rollback where
appropriate, and route every invocation through this layer.
