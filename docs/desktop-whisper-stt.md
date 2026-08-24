# Desktop Whisper STT

The macOS overlay uses `whisper.cpp` as its local primary STT provider. It
captures one VAD-bounded utterance at a time through `AlexaWhisperCapture.app`,
then invokes the fixed local `whisper-cli` binary. The transcript returns only
through the existing desktop `STTProvider` and Voice Runtime path.

Neither the native helper nor whisper.cpp can call Alexa models, AIRouter,
desktop capabilities, approvals, or execution systems. Raw microphone PCM is
held only in memory until VAD closes an utterance. A private temporary WAV file
is deleted after transcription, cancellation, or process shutdown.

## Default local runtime

The development runtime expects these ignored local paths:

- `apps/mac-agent/.local/whisper.cpp/build/bin/whisper-cli`
- `apps/mac-agent/.local/whisper.cpp/models/ggml-base.en.bin`

Use the pinned whisper.cpp `v1.7.5` source revision
`51c6961c7b64b406833f4b6a4a20e67142f69225`, compiled through CMake on Apple
Silicon. The standard build discovers Metal and Accelerate automatically. No
CUDA dependency is used.

`base.en` is the default English-only model. Configure a deliberate alternative
through `DESKTOP_STT_WHISPER_MODEL_PATH` and
`DESKTOP_STT_WHISPER_MODEL_VERSION`; models are not downloaded while voice is
running. `DESKTOP_STT_PROVIDER=apple_speech` explicitly selects the fallback.
The default `DESKTOP_STT_WHISPER_NO_SPEECH_THRESHOLD=0.25` is lower than
whisper.cpp's general dictation default because the native capture layer has
already bounded audio with VAD. Re-benchmark this value against real microphone
commands before changing it; synthetic voices can underrepresent short control
phrases.

## Failure behavior

At startup the Mac Agent verifies that the binary is executable and the model
is a plausible local model file. Missing or invalid Whisper artifacts produce a
bounded provider-unavailable state, then fail over to Apple Speech only when
`DESKTOP_STT_FALLBACK_PROVIDER=apple_speech` is configured. A cancelled voice
session kills the active local transcription process and advances its generation
so it cannot submit a late transcript.
