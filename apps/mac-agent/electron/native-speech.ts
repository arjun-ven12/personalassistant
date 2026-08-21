import { spawn, type ChildProcess } from "node:child_process";
import { createReadStream, type ReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type NativeSpeechEvent =
  | { type: "process"; pid: number }
  | { type: "ready"; onDevice: boolean }
  | { type: "audioLevel"; level: number }
  | { type: "interim"; text: string }
  | { type: "final"; text: string }
  | {
      type: "error";
      code: "MIC_PERMISSION_DENIED" | "STT_PERMISSION_DENIED" | "STT_PROVIDER_UNAVAILABLE" | "STT_AUDIO_CAPTURE_ERROR" | "STT_DICTATION_DISABLED" | "STT_RECOGNITION_FAILED";
      diagnosticDomain?: string;
      diagnosticCode?: number;
    };

const isEvent = (value: unknown): value is NativeSpeechEvent => {
  if (!value || typeof value !== "object") return false;
  const event = value as {
    type?: unknown;
    text?: unknown;
    code?: unknown;
    onDevice?: unknown;
    diagnosticDomain?: unknown;
    diagnosticCode?: unknown;
    level?: unknown;
  };
  if (event.type === "process")
    return Number.isSafeInteger((event as { pid?: unknown }).pid) && Number((event as { pid?: unknown }).pid) > 0;
  if (event.type === "ready") return typeof event.onDevice === "boolean";
  if (event.type === "audioLevel")
    return typeof event.level === "number" && event.level >= 0 && event.level <= 1;
  if (event.type === "interim" || event.type === "final") return typeof event.text === "string";
  const validError =
    event.type === "error" &&
    ["MIC_PERMISSION_DENIED", "STT_PERMISSION_DENIED", "STT_PROVIDER_UNAVAILABLE", "STT_AUDIO_CAPTURE_ERROR", "STT_DICTATION_DISABLED", "STT_RECOGNITION_FAILED"].includes(String(event.code));
  if (!validError) return false;
  return (
    (event.diagnosticDomain === undefined ||
      (typeof event.diagnosticDomain === "string" && event.diagnosticDomain.length <= 120)) &&
    (event.diagnosticCode === undefined || Number.isSafeInteger(event.diagnosticCode))
  );
};

export class NativeSpeechRecognitionSession {
  #launcher: ChildProcess | null = null;
  #nativePid: number | null = null;
  #output: ReadStream | null = null;
  #temporaryDirectory: string | null = null;
  #buffer = "";

  constructor(private readonly onEvent: (event: NativeSpeechEvent) => void) {}

  async start() {
    if (this.#launcher) return;
    const appBundle = path.join(__dirname, "../dist-native/AlexaVoiceSTT.app");
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "alexa-voice-stt-"));
    const outputPipe = path.join(temporaryDirectory, "events.fifo");
    await new Promise<void>((resolve, reject) => {
      const maker = spawn("/usr/bin/mkfifo", [outputPipe], { stdio: "ignore" });
      maker.once("error", reject);
      maker.once("exit", (code) =>
        code === 0 ? resolve() : reject(new Error("Unable to create native speech event pipe.")),
      );
    });
    this.#temporaryDirectory = temporaryDirectory;
    const output = createReadStream(outputPipe);
    output.on("data", (chunk) => this.consume(chunk.toString()));
    output.on("error", () => {
      if (this.#launcher)
        this.onEvent({ type: "error", code: "STT_PROVIDER_UNAVAILABLE" });
    });
    this.#output = output;
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
        "--parent-pid",
        String(process.pid),
      ],
      { stdio: "ignore" },
    );
    launcher.on("error", () => {
      this.onEvent({ type: "error", code: "STT_PROVIDER_UNAVAILABLE" });
    });
    launcher.on("exit", (code) => {
      if (this.#launcher !== launcher) return;
      this.#launcher = null;
      this.#nativePid = null;
      this.cleanup();
      if (code !== 0 && code !== null)
        this.onEvent({ type: "error", code: "STT_RECOGNITION_FAILED" });
    });
    this.#launcher = launcher;
  }

  stop() {
    const launcher = this.#launcher;
    this.#launcher = null;
    launcher?.kill();
    if (this.#nativePid !== null) {
      try {
        process.kill(this.#nativePid, "SIGTERM");
      } catch {
        // The helper may already have exited after a recognition failure.
      }
    }
    this.#nativePid = null;
    this.cleanup();
  }

  private consume(chunk: string) {
    this.#buffer += chunk;
    const lines = this.#buffer.split("\n");
    this.#buffer = lines.pop() ?? "";
    for (const line of lines) {
      try {
        const parsed: unknown = JSON.parse(line);
        if (!isEvent(parsed)) continue;
        if (parsed.type === "process") this.#nativePid = parsed.pid;
        else {
          if (parsed.type === "error" && parsed.diagnosticDomain)
            console.warn(
              `[native-voice-stt] ${parsed.code} ${parsed.diagnosticDomain}:${parsed.diagnosticCode ?? "unknown"}`,
            );
          this.onEvent(parsed);
        }
      } catch {
        // Native helper output is treated as untrusted diagnostics.
      }
    }
  }

  private cleanup() {
    this.#output?.destroy();
    this.#output = null;
    const temporaryDirectory = this.#temporaryDirectory;
    this.#temporaryDirectory = null;
    if (temporaryDirectory)
      void rm(temporaryDirectory, { recursive: true, force: true });
  }
}
