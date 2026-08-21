# Planned Android controller

The Android application is intentionally not initialised in Phase 1. There is
no React Native, Expo, Gradle, or Android application code in this directory.

Future Android responsibilities:

- Secure device registration and revocation.
- Passkey or system-biometric login.
- Push notifications and task status.
- High-risk approval requests with recent authentication.
- Push-to-talk voice input and optional speaker verification.
- A floating control overlay.
- Gesture-camera mode where appropriate.
- A prominent emergency stop.

Phone biometrics must use Android's system biometric APIs. The platform must not
implement custom fingerprint recognition or handle raw fingerprint data.

The app must remain a controller under the same policy engine. Device trust,
VPN membership, voice, gesture, or biometric success never grants arbitrary
tool permission.
