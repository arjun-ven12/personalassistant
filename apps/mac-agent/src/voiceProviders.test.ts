import { afterEach, describe, expect, it, vi } from "vitest";

import { BrowserTTSProvider } from "./voiceProviders.js";

describe("BrowserTTSProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies the persisted provider-neutral voice profile", () => {
    let spoken: {
      voice: { name: string; lang: string } | null;
      lang: string;
      rate: number;
      pitch: number;
      volume: number;
    } | null = null;
    class TestUtterance {
      voice: { name: string; lang: string } | null = null;
      lang = "";
      rate = 1;
      pitch = 1;
      volume = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;

      constructor(readonly text: string) {}
    }
    const voice = { name: "Alexa Test Voice", lang: "en-SG" };
    vi.stubGlobal("SpeechSynthesisUtterance", TestUtterance);
    vi.stubGlobal("window", {
      speechSynthesis: {
        cancel: vi.fn(),
        getVoices: () => [voice],
        resume: vi.fn(),
        speak: (utterance: TestUtterance) => {
          spoken = utterance;
        },
      },
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
    });
    const provider = new BrowserTTSProvider();
    provider.configure({
      voiceName: voice.name,
      language: "en-SG",
      rate: 1.15,
      pitch: 0.9,
      volume: 0.8,
    });

    provider.speak("Hello", {
      onStart: vi.fn(),
      onEnd: vi.fn(),
      onError: vi.fn(),
    });

    expect(spoken).toMatchObject({
      voice,
      lang: "en-SG",
      rate: 1.15,
      pitch: 0.9,
      volume: 0.8,
    });
  });
});
