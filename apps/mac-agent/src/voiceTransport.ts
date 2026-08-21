import type { STTProvider, TTSProvider } from "./voiceProviders.js";

export type VoiceTransportState = "disconnected" | "connected";
export type VoiceInputHandlers = Parameters<STTProvider["start"]>[0];

/**
 * Transport owns only the local media-session lifecycle. Transcript handling
 * and all Alexa intelligence remain outside this boundary.
 */
export interface VoiceTransport {
  readonly id: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  startInput(handlers: VoiceInputHandlers): Promise<void>;
  stopInput(): Promise<void>;
  stopPlayback(): Promise<void>;
  getState(): VoiceTransportState;
}

export class LocalVoiceTransport implements VoiceTransport {
  readonly id = "local_electron";
  #state: VoiceTransportState = "disconnected";

  constructor(
    private readonly stt: STTProvider,
    private readonly tts: TTSProvider,
  ) {}

  connect() {
    this.#state = "connected";
    return Promise.resolve();
  }

  disconnect() {
    this.stt.stop();
    this.tts.stop();
    this.#state = "disconnected";
    return Promise.resolve();
  }

  async startInput(handlers: VoiceInputHandlers) {
    if (this.#state !== "connected") throw new Error("Voice transport is disconnected.");
    await this.stt.start(handlers);
  }

  stopInput() {
    this.stt.stop();
    return Promise.resolve();
  }

  stopPlayback() {
    this.tts.stop();
    return Promise.resolve();
  }

  getState() {
    return this.#state;
  }
}
