# Alexa Mac Agent Productization

The Alexa Mac Agent remains the existing trusted execution endpoint. Packaging
does not add a backend, capability registry, execution route, or native control
path.

## Product shell

- Product name: `Alexa Mac Agent`
- Bundle identifier: `com.alexacontrol.macagent`
- Primary architecture: Apple Silicon (`arm64`)
- UI model: menu-bar first (`LSUIElement`) with a compact status, permissions,
  pairing, and diagnostics window
- Closing the window releases its renderer and leaves the execution agent
  running. Only **Quit Alexa Mac Agent** stops the process.
- A single-instance lock routes later launches to the existing process.
- Login startup uses Electron's `setLoginItemSettings`, backed by the current
  macOS service-management mechanism.

## Configuration

Packaged builds read a strict, non-secret `mac-agent.config.json` resource.
Development builds may read `apps/mac-agent/.env`. Remote API and web URLs must
use HTTPS, and a production configuration cannot target localhost.

The default local package uses
`apps/mac-agent/build-resources/mac-agent.config.json`. A production build can
provide a reviewed file without modifying the repository:

```bash
ALEXA_MAC_AGENT_CONFIG_PATH=/absolute/path/mac-agent.production.json \
  pnpm --filter @alexa-control/mac-agent package:mac
```

Configuration must never contain credentials. Device identity remains in the
existing main-process secure-key store. Electron `safeStorage` uses macOS
Keychain protection for the encrypted private-key payload; only bounded public
metadata is stored separately.

## Native resources

Native helper apps are compiled before packaging and copied outside ASAR under
`Contents/Resources/native`. The main process passes explicit resource paths to
the active-context, semantic-interaction, Apple Speech, and Whisper capture
helpers. Unsupported or missing helpers remain unavailable and do not fall back
to generic automation.

The optional whisper.cpp binary and model are not embedded. They must use the
reviewed configured absolute paths; Apple Speech remains the configured bounded
fallback when enabled.

## Permissions

The app detects Accessibility, camera, and microphone status using Electron's
macOS APIs. Screen Recording, Automation, and Notifications are shown as not
required because the current packaged capability set does not require them.
System Settings links are selected from a fixed internal map. No renderer may
supply a URL.

Accessibility remains a prerequisite only for reviewed semantic provider
operations. It never enables coordinate clicking, arbitrary keystrokes,
AppleScript, shell execution, or unrestricted Accessibility access.

## Lifecycle and connection

The existing signed execution poll is still authoritative. Product state is
derived from that transport, trusted-device state, and bounded error codes.
Failures use exponential backoff capped at 60 seconds. Sleep suspends polling;
wake reconnects, restarts bounded active-context reporting, and refreshes
application discovery. A revoked device stops polling, persists revoked local
state, and requires explicit re-pairing. Expired requests are never replayed.

## Security

Renderer windows keep `nodeIntegration: false`, `contextIsolation: true`, and
`sandbox: true`. Navigation and new windows are denied. CSP allows only local
application resources, with blob media needed for explicit local camera use.
The preload exposes finite Zod-validated methods only.

The macOS App Sandbox is intentionally not enabled because the reviewed native
providers and TCC-governed Accessibility integration require controlled host
interaction. Hardened Runtime configuration includes only Electron's JIT and
unsigned executable-memory requirements. App signing is deliberately disabled
for local builds; no certificate or notarization credential is stored.

## Packaging and release

```bash
pnpm --filter @alexa-control/mac-agent package:mac
```

This produces an unsigned `.app`, `.dmg`, update `.zip`, and Electron update
metadata in `apps/mac-agent/release`. Unsigned local builds have production
auto-update disabled.

### One-command development install

```bash
pnpm mac-agent:install
```

The command validates, builds, packages, gracefully terminates only the fixed
installed bundle, stages the replacement beside it, atomically swaps the app,
relaunches it, checks canonical backend health, and verifies that an existing
`deviceId` did not change. It uses an existing `/Applications` installation or
defaults to `~/Applications`, so it does not require `sudo`. Set
`ALEXA_MAC_AGENT_INSTALL_PATH` only to choose another app destination. Switching
between production and development packages is denied unless the owner
explicitly sets `ALEXA_ALLOW_ENVIRONMENT_SWITCH=true`.

The installer never reads or replaces the encrypted private key and never
modifies `~/Library/Application Support/Alexa Mac Agent`. A failed launch,
backend check, or identity check rolls the app bundle back and relaunches the
previous version. Local device reset remains the separate, explicit owner action
in the status window.

### Signed production updates

Production packages may use the standard `electron-updater` generic HTTPS feed:

```json
{
  "ALEXA_AGENT_ENVIRONMENT": "production",
  "ALEXA_UPDATE_PROVIDER": "generic",
  "ALEXA_UPDATE_FEED_URL": "https://updates.example.com/alexa-mac-agent/stable",
  "ALEXA_UPDATE_CHANNEL": "stable",
  "ALEXA_UPDATE_AUTO_CHECK": true,
  "ALEXA_UPDATE_CHECK_INTERVAL_HOURS": 6
}
```

The feed is non-secret configuration and must use HTTPS. The updater transport
also verifies that the running app has a Developer ID Application authority;
ad-hoc and Apple Development builds remain disabled even if given a production
feed. Private GitHub release
tokens are deliberately not embedded in the client, so a private repository
must mirror the immutable `.zip` and `latest-mac.yml` files to an owner-controlled
HTTPS release origin. The app checks one minute after launch and then at the
configured low-frequency interval. Downloads and restarts remain manual. An
active governed execution changes the updater to `RESTART_REQUIRED` and defers
installation.

The explicit `mac-agent-release` workflow runs only for `mac-agent-v*` tags or
manual dispatch. It validates version consistency, runs typecheck/lint/tests,
builds the production configuration, signs, notarizes, verifies with `codesign`,
`spctl`, and `stapler`, generates SHA-256 checksums, and creates an immutable
GitHub Release. It intentionally fails when owner signing, notarization,
production URL, or feed configuration is absent.

Required repository secrets are:

- `MACOS_DEVELOPER_ID_CERTIFICATE`
- `MACOS_DEVELOPER_ID_CERTIFICATE_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `ALEXA_PRODUCTION_API_BASE_URL`
- `ALEXA_PRODUCTION_WEB_BASE_URL`
- `ALEXA_MAC_AGENT_UPDATE_FEED_URL`

No certificate, Apple credential, feed credential, token, or private key is
stored in source or the app bundle. Hardened Runtime and nested native-helper
signing remain part of the existing Electron Builder release chain.

Unsigned local acceptance packages are coherently ad-hoc signed. Their local-only
entitlements disable library validation because ad-hoc Electron framework and
host signatures do not share a Developer ID Team ID. The signed release branch
does not use that exception; it returns to the narrower production entitlement
file and signs the host, Electron frameworks, and native helpers with the
configured Developer ID identity.

The checked-in icon is a temporary Alexa Control placeholder and must be
replaced with approved production brand artwork before public distribution.

## Manual acceptance

1. Open the app from Finder and confirm the menu-bar icon appears.
2. Pair or restore the existing trusted device and confirm no duplicate device.
3. Enable Launch at Login, log out/in, and confirm the app starts without a terminal.
4. Close the status window and confirm the menu-bar agent remains running.
5. Verify permission states and fixed System Settings links.
6. Execute existing governed Chrome/Figma launch, focus, and allowed URL capabilities.
7. Disconnect/reconnect Wi-Fi and test sleep/wake recovery.
8. Revoke the device and confirm execution stops until explicit re-pairing.
9. Quit from the menu and confirm backend presence expires to offline.

Wake-on-LAN, cross-device routing, raw remote control, generic shell,
AppleScript, mouse/keyboard replay, OCR, and screen streaming are not included.
