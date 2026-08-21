# Gesture and voice security architecture

## Gesture model

The shared package defines normalised 2D/3D points, handedness, landmark frames,
gesture events, modes, engine states, spatial pipeline records, camera
metadata, gesture profiles, mappings, macros, calibration, history, custom
gestures, and security policy. Phase 14 adds persistence, APIs, and the
Gesture Lab dashboard for these records. It does not install MediaPipe, request
camera access, process raw frames, or expose direct OS control.

Safe defaults require local-only camera processing, no persistence of raw
frames, a visible camera indicator, an emergency shortcut, and no high-risk
approval by gesture. Gesture input is a convenience input—not authentication.

Future gesture modes are disabled, assistant, cursor, media, presentation, and
calibration. Any cursor mode must be visibly bounded, debounced, time out when
inactive, and remain subordinate to the emergency stop.

Confirmed mapped gestures are submitted to the Intent Engine with
`source: "gesture"`. They are then ordinary governed commands, not privileged
desktop actions. See [spatial interaction system](spatial-interaction-system.md).

## Three separate voice concepts

### Speech recognition

Answers: “What words were spoken?”

### Speaker verification

Answers: “Does this voice match the enrolled owner?”

### Voice-command authorisation

Answers: “Is this action permitted given the device, network, policy, and
action risk?”

Speaker verification is not sufficient by itself. Recordings, voice cloning,
background noise, illness, microphone quality, false acceptance, and false
rejection all weaken it.

## Intended future policy

- Low risk: trusted device, private network, valid session, and optional speaker
  verification.
- Medium risk: trusted device, private network, valid session, and explicit
  approval.
- High risk: trusted device, private network, valid session, and recent
  biometric or passkey approval.
- Prohibited: never permitted.

Voice recognition must never independently authorise sending email, Git push,
production deployment, account changes, security-policy changes, device
registration, credential access, banking actions, or permanent deletion.

Phase 2.1 performs no speech recognition, recording, wake-word detection,
speaker enrolment, or speaker verification.
