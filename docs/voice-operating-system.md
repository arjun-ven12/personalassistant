# Voice Operating System

Phase 15A adds voice as a first-class input source for the Personal Assistant.
It follows the same architecture as gestures and commands:

```mermaid
flowchart LR
  A["Microphone permission"] --> B["Local browser voice runtime"]
  B --> C["Speech recognition transcript"]
  C --> D["Voice metadata API"]
  D --> E["Intent Engine"]
  E --> F["Planner / Agent Society"]
  F --> G["Governed execution systems"]
```

## Runtime model

The browser voice runtime is mounted at the authenticated app shell, not inside
one page. It exposes a draggable floating panel with:

- microphone permission state
- current lifecycle state
- live transcript
- confidence
- wake-word status
- start, pause, resume, stop, and interruption controls
- optional text-to-speech playback

The Voice Center page is diagnostics/configuration. It does not own an
independent microphone runtime.

## Security model

- Raw microphone audio is not persisted by default.
- Browser audio frames are not uploaded to the API.
- The API accepts bounded transcript, confidence, language, provider, session,
  and metric metadata.
- Every final confident transcript becomes a `source: "voice"` command routed
  through the existing Intent Engine.
- Voice cannot authenticate users, provide recent authentication, approve
  high-risk actions, or bypass policy.
- Low-confidence transcripts fail closed and are stored as metadata only.

## Browser provider

The first runtime uses browser-native `SpeechRecognition` and
`speechSynthesis` when available. Browsers that do not expose speech recognition
show an explicit unsupported state instead of pretending to listen.

## Data model

Phase 15A adds PostgreSQL tables for:

- `voice_sessions`
- `voice_profiles`
- `voice_shortcuts`
- `conversation_history`
- `voice_metrics`
- `microphone_preferences`
- `wake_word_settings`
- `tts_profiles`
- `stt_provider_metrics`

All records are owner scoped and store structured metadata only.
