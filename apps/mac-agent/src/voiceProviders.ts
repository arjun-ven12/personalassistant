export interface STTProvider {
  readonly id: string;
  start(handlers: {
    onReady?: (providerId: string) => void;
    onAudioLevel?: (level: number) => void;
    onInterim: (transcript: string, confidence: number) => void;
    onFinal: (transcript: string, confidence: number) => void;
    onError: (message: string) => void;
  }): Promise<void>;
  stop(): void;
}

export interface TTSProvider {
  readonly id: string;
  configure(profile: TTSVoiceProfile): void;
  speak(text: string, handlers: { onStart: () => void; onEnd: () => void; onError: (message: string) => void }): void;
  stop(): void;
}

export interface TTSVoiceProfile {
  voiceName: string | null;
  language: string;
  rate: number;
  pitch: number;
  volume: number;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: {
    resultIndex: number;
    results: { length: number; [index: number]: { isFinal: boolean; [index: number]: SpeechRecognitionAlternativeLike } };
  }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const speechRecognitionConstructor = (): SpeechRecognitionConstructor | null => {
  const candidate = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
};

export class BrowserSTTProvider implements STTProvider {
  readonly id = "browser_speech_recognition";
  #recognition: BrowserSpeechRecognition | null = null;

  async start(handlers: Parameters<STTProvider["start"]>[0]) {
    const Recognition = speechRecognitionConstructor();
    if (!Recognition) throw new Error("Speech recognition is unavailable in this Electron runtime.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((track) => track.stop());
    this.stop();
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let interim = "";
      let confidence = 0.75;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result?.[0];
        if (!alternative) continue;
        confidence = Math.max(confidence, alternative.confidence || 0.75);
        if (result.isFinal) handlers.onFinal(alternative.transcript, confidence);
        else interim += alternative.transcript;
      }
      if (interim.trim()) handlers.onInterim(interim.trim(), confidence);
    };
    recognition.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") handlers.onError(event.error);
    };
    recognition.onend = () => {
      if (this.#recognition !== recognition) return;
      try {
        recognition.start();
      } catch {
        // Recognition may still be restarting internally.
      }
    };
    this.#recognition = recognition;
    recognition.start();
    handlers.onReady?.(this.id);
  }

  stop() {
    const recognition = this.#recognition;
    this.#recognition = null;
    recognition?.abort();
  }
}

const nativeSpeechMessage: Record<string, string> = {
  MIC_PERMISSION_DENIED: "Microphone access is required for desktop voice.",
  STT_PERMISSION_DENIED: "Speech recognition permission is required for desktop voice.",
  STT_PROVIDER_UNAVAILABLE: "Desktop speech recognition is unavailable right now.",
  STT_AUDIO_CAPTURE_ERROR: "Alexa could not capture audio from the selected microphone.",
  STT_DICTATION_DISABLED: "Turn on Dictation in System Settings → Keyboard, then try Start again.",
  STT_RECOGNITION_FAILED: "Desktop speech recognition stopped unexpectedly.",
  STT_TRANSCRIPTION_FAILED: "Local Whisper could not transcribe that utterance.",
};

class NativeDesktopSTTProvider implements STTProvider {
  constructor(readonly id: "whisper_cpp" | "apple_speech") {}
  #unsubscribe: (() => void) | null = null;

  async start(handlers: Parameters<STTProvider["start"]>[0]) {
    this.stop();
    await new Promise<void>((resolve, reject) => {
      let ready = false;
      this.#unsubscribe = window.alexaAgent.onNativeVoiceRecognitionEvent((event) => {
        if (event.type === "ready") {
          ready = true;
          handlers.onReady?.(event.providerId);
          resolve();
          return;
        }
        if (event.type === "interim") handlers.onInterim(event.text, 0.9);
        if (event.type === "final") handlers.onFinal(event.text, 0.95);
        if (event.type === "audioLevel") handlers.onAudioLevel?.(event.level);
        if (event.type === "error") {
          const message = nativeSpeechMessage[event.code] ?? "Desktop speech recognition failed.";
          handlers.onError(message);
          if (!ready) reject(new Error(message));
        }
      });
      void window.alexaAgent.startNativeVoiceRecognition().catch(reject);
    });
  }

  stop() {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    void window.alexaAgent.stopNativeVoiceRecognition();
  }
}

/** Primary local desktop provider. The Electron main process owns its fixed
 * whisper.cpp binary/model configuration and may fail over to Apple Speech. */
export class WhisperCppSTTProvider extends NativeDesktopSTTProvider {
  constructor() {
    super("whisper_cpp");
  }
}

/** Explicit configuration fallback for macOS Speech Framework. */
export class AppleSpeechSTTProvider extends NativeDesktopSTTProvider {
  constructor() {
    super("apple_speech");
  }
}

export class BrowserTTSProvider implements TTSProvider {
  readonly id = "browser_speech_synthesis";
  #profile: TTSVoiceProfile = {
    voiceName: null,
    language: "en-US",
    rate: 1,
    pitch: 1,
    volume: 1,
  };

  configure(profile: TTSVoiceProfile) {
    this.#profile = { ...profile };
  }

  speak(text: string, handlers: { onStart: () => void; onEnd: () => void; onError: (message: string) => void }) {
    if (!("speechSynthesis" in window) || !text.trim()) {
      handlers.onError("Speech synthesis is unavailable in this runtime.");
      return;
    }
    const synthesis = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = synthesis.getVoices();
    const exactVoice = this.#profile.voiceName
      ? voices.find((voice) => voice.name === this.#profile.voiceName)
      : null;
    const languageVoice = voices.find(
      (voice) => voice.lang.toLowerCase() === this.#profile.language.toLowerCase(),
    );
    utterance.voice = exactVoice ?? languageVoice ?? null;
    utterance.lang = utterance.voice?.lang ?? this.#profile.language;
    utterance.rate = this.#profile.rate;
    utterance.pitch = this.#profile.pitch;
    utterance.volume = this.#profile.volume;
    utterance.onstart = handlers.onStart;
    utterance.onend = handlers.onEnd;
    utterance.onerror = (event) => {
      if (event.error === "canceled" || event.error === "interrupted") return;
      handlers.onError(event.error || "Speech synthesis failed.");
    };
    synthesis.cancel();
    // Chromium can ignore an utterance queued in the same task as cancel().
    window.setTimeout(() => {
      try {
        synthesis.resume();
        synthesis.speak(utterance);
      } catch (error) {
        handlers.onError(error instanceof Error ? error.message : "Speech synthesis failed.");
      }
    }, 0);
  }

  stop() {
    window.speechSynthesis?.cancel();
  }
}
