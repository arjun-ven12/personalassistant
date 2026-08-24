import { spawn } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DelegatedSandboxResultSchema } from "@alexa-control/shared";

const DOCKER_IMAGE = "node:22-alpine";
const OUTPUT_LIMIT = 16_000;
const DEFAULT_TIMEOUT_MS = 30_000;

type ProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type SandboxProcessRunner = (input: {
  binary: string;
  args: string[];
  timeoutMs: number;
  signal?: AbortSignal;
}) => Promise<ProcessResult>;

const bounded = (value: string) => value.slice(-OUTPUT_LIMIT);

const defaultRunner: SandboxProcessRunner = ({ binary, args, timeoutMs, signal }) =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin" },
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = bounded(stdout + chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = bounded(stderr + chunk.toString("utf8"));
    });
    const stop = () => child.kill("SIGKILL");
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    signal?.addEventListener("abort", stop, { once: true });
    child.once("error", (error) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      reject(error);
    });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
  });

export class DockerNodeTestSandbox {
  readonly id = "docker_node_test_v1" as const;

  constructor(
    readonly binary = "/usr/local/bin/docker",
    readonly runProcess: SandboxProcessRunner = defaultRunner,
    readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async health() {
    try {
      const result = await this.runProcess({
        binary: this.binary,
        args: ["image", "inspect", DOCKER_IMAGE],
        timeoutMs: 5_000,
      });
      return {
        available: result.exitCode === 0,
        providerId: this.id,
        image: DOCKER_IMAGE,
      };
    } catch {
      return { available: false, providerId: this.id, image: DOCKER_IMAGE };
    }
  }

  async execute(input: {
    sourceCode: string;
    testCode: string;
    signal?: AbortSignal;
  }) {
    const startedAt = performance.now();
    const workspace = await mkdtemp(join(tmpdir(), "alexa-delegation-"));
    try {
      await Promise.all([
        writeFile(join(workspace, "source.cjs"), input.sourceCode, {
          encoding: "utf8",
          mode: 0o444,
        }),
        writeFile(join(workspace, "generated.test.cjs"), input.testCode, {
          encoding: "utf8",
          mode: 0o444,
        }),
      ]);
      await chmod(workspace, 0o555);
      const result = await this.runProcess({
        binary: this.binary,
        args: [
          "run",
          "--rm",
          "--pull",
          "never",
          "--network",
          "none",
          "--memory",
          "256m",
          "--cpus",
          "0.5",
          "--pids-limit",
          "64",
          "--read-only",
          "--cap-drop",
          "ALL",
          "--security-opt",
          "no-new-privileges",
          "--user",
          "65534:65534",
          "--tmpfs",
          "/tmp:rw,noexec,nosuid,size=32m",
          "--mount",
          `type=bind,source=${workspace},target=/workspace,readonly`,
          DOCKER_IMAGE,
          "node",
          "--test",
          "/workspace/generated.test.cjs",
        ],
        timeoutMs: this.timeoutMs,
        ...(input.signal ? { signal: input.signal } : {}),
      });
      return DelegatedSandboxResultSchema.parse({
        providerId: this.id,
        status: result.timedOut
          ? "TIMED_OUT"
          : result.exitCode === 0
            ? "PASSED"
            : "FAILED",
        exitCode: result.exitCode,
        durationMs: Math.round(performance.now() - startedAt),
        stdout: bounded(result.stdout),
        stderr: bounded(result.stderr),
        network: "disabled",
        hostWrites: false,
        cleanedUp: true,
      });
    } catch (error) {
      return DelegatedSandboxResultSchema.parse({
        providerId: this.id,
        status: "UNAVAILABLE",
        exitCode: null,
        durationMs: Math.round(performance.now() - startedAt),
        stdout: "",
        stderr:
          error instanceof Error
            ? bounded(error.message)
            : "Docker sandbox unavailable.",
        network: "disabled",
        hostWrites: false,
        cleanedUp: true,
      });
    } finally {
      await chmod(workspace, 0o700).catch(() => undefined);
      await rm(workspace, { recursive: true, force: true });
    }
  }
}
