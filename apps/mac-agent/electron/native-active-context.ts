import {
  ActiveContextObservationSchema,
  type ActiveContextObservation,
} from "@alexa-control/shared";
import { spawn, type ChildProcess } from "node:child_process";
import { createReadStream, type ReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const parseNativeActiveContextLine = (line: string) => {
  try {
    return ActiveContextObservationSchema.safeParse(JSON.parse(line)).data ?? null;
  } catch {
    return null;
  }
};

export class NativeActiveContextSession {
  #process: ChildProcess | null = null;
  #output: ReadStream | null = null;
  #temporaryDirectory: string | null = null;
  #buffer = "";

  constructor(
    private readonly onObservation: (observation: ActiveContextObservation) => void,
    private readonly onUnavailable: () => void = () => undefined,
  ) {}

  async start() {
    if (this.#process || process.platform !== "darwin") return;
    const appBundle = path.join(__dirname, "../dist-native/AlexaActiveContext.app");
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "alexa-active-context-"));
    const outputPipe = path.join(temporaryDirectory, "events.fifo");
    await new Promise<void>((resolve, reject) => {
      const maker = spawn("/usr/bin/mkfifo", [outputPipe], { stdio: "ignore" });
      maker.once("error", reject);
      maker.once("exit", (code) =>
        code === 0 ? resolve() : reject(new Error("Unable to create active context event pipe.")),
      );
    });
    this.#temporaryDirectory = temporaryDirectory;
    const output = createReadStream(outputPipe);
    output.on("data", (chunk) => this.consume(chunk.toString("utf8")));
    output.on("error", () => this.onUnavailable());
    this.#output = output;
    const child = spawn("/usr/bin/open", [
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
    ], { stdio: "ignore" });
    child.on("error", () => this.onUnavailable());
    child.on("exit", () => {
      if (this.#process === child) {
        this.#process = null;
        this.cleanup();
      }
    });
    this.#process = child;
  }

  stop() {
    const child = this.#process;
    this.#process = null;
    child?.kill();
    this.cleanup();
  }

  private consume(chunk: string) {
    this.#buffer += chunk;
    const lines = this.#buffer.split("\n");
    this.#buffer = lines.pop() ?? "";
    for (const line of lines) {
      const parsed = parseNativeActiveContextLine(line);
      if (parsed) this.onObservation(parsed);
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
