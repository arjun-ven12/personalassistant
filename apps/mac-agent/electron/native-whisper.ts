import { spawn, type ChildProcess } from "node:child_process";
import { createReadStream, type ReadStream } from "node:fs";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

export type WhisperCppConfig = {
  binaryPath: string;
  modelPath: string;
  modelVersion: string;
  threads: number;
  noSpeechThreshold: number;
};

export type DesktopSttEvent =
  | { type: "process"; pid: number }
  | { type: "ready"; providerId: "whisper_cpp" | "apple_speech"; onDevice?: boolean }
  | { type: "audioLevel"; level: number }
  | { type: "interim"; text: string }
  | { type: "final"; text: string; latencyMs?: number }
  | {
      type: "error";
      code:
        | "MIC_PERMISSION_DENIED"
        | "STT_PERMISSION_DENIED"
        | "STT_PROVIDER_UNAVAILABLE"
        | "STT_AUDIO_CAPTURE_ERROR"
        | "STT_DICTATION_DISABLED"
        | "STT_RECOGNITION_FAILED"
        | "STT_TRANSCRIPTION_FAILED";
      diagnosticDomain?: string;
      diagnosticCode?: number;
    };

type DesktopSttErrorCode = Extract<DesktopSttEvent, { type: "error" }>["code"];

type WhisperCaptureEvent =
  | { type: "process"; pid: number }
  | { type: "ready"; providerId: "whisper_cpp" }
  | { type: "audioLevel"; level: number }
  | { type: "utterance"; path: string }
  | { type: "error"; code: DesktopSttErrorCode };

const isCaptureEvent = (value: unknown): value is WhisperCaptureEvent => {
  if (!value || typeof value !== "object") return false;
  const event = value as { type?: unknown; pid?: unknown; level?: unknown; path?: unknown; code?: unknown; providerId?: unknown };
  if (event.type === "process") return Number.isSafeInteger(event.pid) && Number(event.pid) > 0;
  if (event.type === "ready") return event.providerId === "whisper_cpp";
  if (event.type === "audioLevel") return typeof event.level === "number" && event.level >= 0 && event.level <= 1;
  if (event.type === "utterance") return typeof event.path === "string" && event.path.length > 0 && event.path.length <= 1_024;
  return event.type === "error" && typeof event.code === "string";
};

const removeQuietly = (target: string) => rm(target, { force: true }).catch(() => undefined);

const reserveLoopbackPort = () =>
  new Promise<number>((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      socket.close((error) => {
        if (error || !address || typeof address === "string") {
          reject(error ?? new Error("Unable to reserve a local whisper.cpp port."));
          return;
        }
        resolve(address.port);
      });
    });
  });

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const WhisperResponseSchema = z.object({ text: z.string().max(4_000) }).passthrough();

export const isUsableWhisperTranscript = (value: string) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || !/[\p{L}\p{N}]/u.test(normalized)) return false;
  const sentinel = normalized
    .toLowerCase()
    .replace(/[[\]()<>_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return !new Set([
    "blank audio",
    "silence",
    "no speech",
    "music",
    "noise",
    "background noise",
    "wind",
    "breathing",
    "breath",
    "sigh",
    "sighs",
    "sighing",
    "cough",
    "coughing",
    "laugh",
    "laughing",
    "keyboard",
    "typing",
    "keyboard typing",
    "applause",
    "clapping",
    "humming",
  ]).has(sentinel);
};

export const checkWhisperCppHealth = async (config: WhisperCppConfig) => {
  try {
    await access(config.binaryPath);
    const serverPath = path.join(path.dirname(config.binaryPath), "whisper-server");
    const [binary, server, model] = await Promise.all([
      stat(config.binaryPath),
      stat(serverPath),
      stat(config.modelPath),
    ]);
    if (
      !binary.isFile() ||
      (binary.mode & 0o111) === 0 ||
      !server.isFile() ||
      (server.mode & 0o111) === 0 ||
      !model.isFile() ||
      model.size < 50 * 1024 * 1024
    )
      return { available: false as const, message: "The configured whisper.cpp binary or model is invalid." };
    return { available: true as const, message: `whisper.cpp ${config.modelVersion} is ready.` };
  } catch {
    return { available: false as const, message: "The configured whisper.cpp binary or model is unavailable." };
  }
};

/**
 * Captures bounded local PCM utterances through the trusted native helper and
 * runs exactly one local whisper.cpp inference job at a time. File paths and
 * raw audio are retained only inside the Electron main process.
 */
export class NativeWhisperRecognitionSession {
  #launcher: ChildProcess | null = null;
  #nativePid: number | null = null;
  #server: ChildProcess | null = null;
  #serverPort: number | null = null;
  #serverPath: string | null = null;
  #requestAbort: AbortController | null = null;
  #transcribing = false;
  #output: ReadStream | null = null;
  #temporaryDirectory: string | null = null;
  #buffer = "";
  #generation = 0;

  constructor(
    private readonly config: WhisperCppConfig,
    private readonly onEvent: (event: DesktopSttEvent) => void,
  ) {}

  async start() {
    if (this.#launcher) return;
    const health = await checkWhisperCppHealth(this.config);
    if (!health.available) {
      this.onEvent({ type: "error", code: "STT_PROVIDER_UNAVAILABLE" });
      return;
    }
    try {
      await this.startWorker();
    } catch {
      this.stopWorker();
      this.onEvent({ type: "error", code: "STT_PROVIDER_UNAVAILABLE" });
      return;
    }
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "alexa-whisper-"));
    this.#temporaryDirectory = temporaryDirectory;
    const outputPipe = path.join(temporaryDirectory, "events.fifo");
    await new Promise<void>((resolve, reject) => {
      const maker = spawn("/usr/bin/mkfifo", [outputPipe], { stdio: "ignore" });
      maker.once("error", reject);
      maker.once("exit", (code) =>
        code === 0 ? resolve() : reject(new Error("Unable to create native whisper event pipe.")),
      );
    });
    const output = createReadStream(outputPipe);
    output.on("data", (chunk) => this.consume(chunk.toString()));
    output.on("error", () => {
      if (this.#launcher) this.onEvent({ type: "error", code: "STT_PROVIDER_UNAVAILABLE" });
    });
    this.#output = output;
    const appBundle = path.join(__dirname, "../dist-native/AlexaWhisperCapture.app");
    const launcher = spawn(
      "/usr/bin/open",
      [
        "-n",
        "-g",
        "-W",
        "--stdin",
        "/dev/null",
        "--stdout",
        outputPipe,
        "--stderr",
        "/dev/null",
        appBundle,
        "--args",
        "--audio-dir",
        temporaryDirectory,
        "--parent-pid",
        String(process.pid),
      ],
      { stdio: "ignore" },
    );
    launcher.on("error", () => this.onEvent({ type: "error", code: "STT_PROVIDER_UNAVAILABLE" }));
    launcher.on("exit", (code) => {
      if (this.#launcher !== launcher) return;
      this.#launcher = null;
      this.#nativePid = null;
      this.stopWorker();
      this.cleanup();
      if (code !== 0 && code !== null)
        this.onEvent({ type: "error", code: "STT_RECOGNITION_FAILED" });
    });
    this.#launcher = launcher;
  }

  stop() {
    this.#generation += 1;
    const launcher = this.#launcher;
    this.#launcher = null;
    launcher?.kill();
    if (this.#nativePid !== null) {
      try {
        process.kill(this.#nativePid, "SIGTERM");
      } catch {
        // The helper may already have exited.
      }
    }
    this.#nativePid = null;
    this.stopWorker();
    this.cleanup();
  }

  private consume(chunk: string) {
    this.#buffer += chunk;
    const lines = this.#buffer.split("\n");
    this.#buffer = lines.pop() ?? "";
    for (const line of lines) {
      try {
        const parsed: unknown = JSON.parse(line);
        if (!isCaptureEvent(parsed)) continue;
        if (parsed.type === "process") this.#nativePid = parsed.pid;
        else if (parsed.type === "utterance") void this.transcribe(parsed.path);
        else if (parsed.type !== "error") this.onEvent(parsed);
        else this.onEvent(parsed);
      } catch {
        // Native helper output is untrusted and never interpreted as a command.
      }
    }
  }

  private async transcribe(audioPath: string) {
    const temporaryDirectory = this.#temporaryDirectory;
    if (!temporaryDirectory || this.#serverPort === null || !this.#serverPath) return;
    const resolvedDirectory = path.resolve(temporaryDirectory) + path.sep;
    const resolvedAudio = path.resolve(audioPath);
    if (!resolvedAudio.startsWith(resolvedDirectory) || path.extname(resolvedAudio) !== ".wav") {
      this.onEvent({ type: "error", code: "STT_TRANSCRIPTION_FAILED" });
      return;
    }
    if (this.#transcribing) {
      await removeQuietly(resolvedAudio);
      return;
    }
    const generation = this.#generation;
    const startedAt = performance.now();
    this.#transcribing = true;
    const abort = new AbortController();
    this.#requestAbort = abort;
    try {
      const audio = await readFile(resolvedAudio);
      const form = new FormData();
      form.append("file", new Blob([audio], { type: "audio/wav" }), "utterance.wav");
      form.append("language", "en");
      form.append("response_format", "json");
      const response = await fetch(
        `http://127.0.0.1:${this.#serverPort}${this.#serverPath}/inference`,
        { method: "POST", body: form, signal: abort.signal },
      );
      if (!response.ok) throw new Error("whisper.cpp returned an unsuccessful response.");
      const body = WhisperResponseSchema.parse(await response.json());
      const text = body.text.replace(/\s+/g, " ").trim();
      if (
        !isUsableWhisperTranscript(text) ||
        generation !== this.#generation ||
        abort.signal.aborted
      )
        return;
      this.onEvent({
        type: "final",
        text: text.slice(0, 4_000),
        latencyMs: Math.round(performance.now() - startedAt),
      });
    } catch {
      if (generation === this.#generation && !abort.signal.aborted)
        this.onEvent({ type: "error", code: "STT_TRANSCRIPTION_FAILED" });
    } finally {
      if (this.#requestAbort === abort) this.#requestAbort = null;
      this.#transcribing = false;
      await removeQuietly(resolvedAudio);
    }
  }

  private async startWorker() {
    const binaryDirectory = path.dirname(this.config.binaryPath);
    const serverBinary = path.join(binaryDirectory, "whisper-server");
    const port = await reserveLoopbackPort();
    const serverPath = `/alexa-${crypto.randomUUID()}`;
    const server = spawn(
      serverBinary,
      [
        "--model", this.config.modelPath,
        "--language", "en",
        "--threads", String(this.config.threads),
        "--processors", "1",
        "--no-speech-thold", String(this.config.noSpeechThreshold),
        "--host", "127.0.0.1",
        "--port", String(port),
        "--request-path", serverPath,
      ],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    this.#server = server;
    this.#serverPort = port;
    this.#serverPath = serverPath;
    server.once("error", () => undefined);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (server.exitCode !== null) break;
      try {
        const response = await fetch(`http://127.0.0.1:${port}${serverPath}/health`);
        if (response.ok) return;
      } catch {
        // The Metal model is still loading.
      }
      await wait(100);
    }
    this.stopWorker();
    throw new Error("whisper.cpp did not become ready.");
  }

  private stopWorker() {
    this.#requestAbort?.abort();
    this.#requestAbort = null;
    this.#transcribing = false;
    const server = this.#server;
    this.#server = null;
    this.#serverPort = null;
    this.#serverPath = null;
    server?.kill("SIGTERM");
  }

  private cleanup() {
    this.#output?.destroy();
    this.#output = null;
    const temporaryDirectory = this.#temporaryDirectory;
    this.#temporaryDirectory = null;
    if (temporaryDirectory) void rm(temporaryDirectory, { recursive: true, force: true });
  }
}
