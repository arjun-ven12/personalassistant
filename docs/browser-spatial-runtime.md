# Browser Spatial Runtime

Phase 14A adds the first real hand-control layer for the Alexa dashboard.
It runs entirely in the web app.

## What it does

- Requests browser camera permission only after the owner clicks **Start** in
  the persistent floating runtime panel or Gesture Lab controls.
- Loads MediaPipe Tasks Vision in the browser.
- Runs hand tracking locally.
- Draws a persistent cross-page Spatial HUD with landmarks, a virtual cursor,
  interaction rays, confidence, FPS, and latency.
- Recognizes gestures such as pinch, open palm, point, peace sign, thumbs up,
  swipes, grab, and hover.
- Sends only compact gesture metadata to `POST /api/spatial/gestures`.
- Routes confirmed gestures through the existing Spatial API and Intent Engine.

## What it does not do

- It does not upload camera frames.
- It does not store video.
- It does not use the Mac agent camera.
- It does not control the operating system.
- It does not inject system mouse or keyboard events.
- It does not bypass policy, approval, CSRF, authentication, or audit.

## How to use it

1. Start the app with `pnpm dev`.
2. Open the dashboard in the browser.
3. Use the floating **Spatial Runtime** panel from any page, or go to
   **Gesture lab**.
4. Click **Start hand control** or **Start**.
5. Approve camera permission in the browser.
6. Hold your hand in view of the camera.
7. Watch the HUD show landmarks, virtual cursor position, gesture confidence,
   FPS, and latency.
8. Navigate to another dashboard page. Tracking should continue without
   reinitializing the camera or MediaPipe runtime.

## Phase 14.4 persistent runtime

The Browser Spatial Runtime is mounted once in the authenticated application
shell. Gesture Lab no longer owns the camera runtime; it only displays
diagnostics, mappings, simulation controls, profiles, calibration, history, and
performance information from the already-running service.

Runtime lifecycle:

- **Start** initializes the local browser camera runtime, persists the user's
  start preference in local storage, and begins cross-page HUD rendering.
- **Pause** stops the runtime and releases the camera temporarily while keeping
  the floating panel available for resume.
- **Resume** starts the same app-level runtime again.
- **Stop** releases the camera and clears the persisted start preference.
- Logout or component unmount releases the camera and clears the spatial pointer.

The floating control panel stores its last position and overlay preferences in
local storage. It supports toggling skeleton, ray, cursor, and HUD layers without
changing backend routing or permissions.

## Default dashboard gesture actions

The runtime submits every confirmed gesture to the governed Spatial API first.
After the API accepts the gesture, the web dashboard performs these local,
website-only navigation intents:

- `swipe_left` opens Repositories.
- `swipe_right` opens Agents.
- `swipe_up` opens Commands.
- `swipe_down` opens Tasks.
- `open_palm` opens Security.
- `peace_sign` opens Workflows.
- `thumbs_up` opens Approvals.

Other gestures are recorded and shown, but have no local dashboard navigation
mapping yet.

## Privacy model

Camera frames remain inside the browser process. The backend receives only:

- gesture name
- confidence score
- handedness
- lifecycle state
- optional profile id

No raw frame, image, landmark list, or video stream is sent to the server.

## Operational notes

MediaPipe model and WASM assets are loaded by the browser from pinned external
asset URLs. This is model loading, not camera upload. A future hardening pass
can self-host those assets for offline and supply-chain controlled deployments.
