import { describe, expect, it } from "vitest";

import {
  checkWhisperCppHealth,
  isUsableWhisperTranscript,
} from "./native-whisper.js";

describe("whisper.cpp desktop STT", () => {
  it("fails closed when the configured local runtime is unavailable", async () => {
    await expect(
      checkWhisperCppHealth({
        binaryPath: "/missing/whisper-cli",
        modelPath: "/missing/ggml-base.en.bin",
        modelVersion: "ggml-base.en",
        threads: 4,
        noSpeechThreshold: 0.25,
      }),
    ).resolves.toEqual({
      available: false,
      message: "The configured whisper.cpp binary or model is unavailable.",
    });
  });

  it("drops whisper silence sentinels instead of submitting Alexa turns", () => {
    expect(isUsableWhisperTranscript("[BLANK_AUDIO]")).toBe(false);
    expect(isUsableWhisperTranscript("(silence)")).toBe(false);
    expect(isUsableWhisperTranscript("[noise]")).toBe(false);
    expect(isUsableWhisperTranscript("Open the Devices page")).toBe(true);
  });
});
