import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { chmod, mkdir, mkdtemp, open, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import {
  SandboxExecutionRequestSchema,
  SandboxExecutionResultSchema,
  type SandboxExecutionRequest,
} from "@alexa-control/shared";

import type { AgentStore } from "../agents/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { DurableExecutionStore } from "./store.js";

const OUTPUT_LIMIT = 4_000;
const images = { NODE: "node:22-alpine", PYTHON: "python:3.12-alpine" } as const;
const commands = {
  NODE: ["node", "/workspace/code.js"],
  PYTHON: ["python", "/workspace/code.py"],
} as const;
const extensions = { NODE: "js", PYTHON: "py" } as const;
const MAX_COLLECTED_BYTES = 16 * 1_048_576;
const flatName = (name: string) =>
  name.length > 0 &&
  name.length <= 120 &&
  name !== "." &&
  name !== ".." &&
  basename(name) === name &&
  !name.includes("\\") &&
  [...name].every(
    (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
  );
const boundaryError = (code: string) =>
  Object.assign(new Error("Sandbox artifact boundary validation failed."), { code });

/** Open once without following links; validate and read through that same descriptor. */
export const readSandboxOutput = async (
  directory: string,
  name: string,
  budget: number,
) => {
  if (!flatName(name)) throw boundaryError("POLICY_DENIED");
  const file = await open(
    join(directory, name),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.nlink !== 1)
      throw boundaryError("POLICY_DENIED");
    if (metadata.size > budget) throw boundaryError("RESOURCE_LIMIT");
    const chunks: Buffer[] = [];
    let bytes = 0;
    for (;;) {
      // Read one byte past the limit to detect growth without an unbounded allocation.
      const chunk = Buffer.alloc(Math.min(65_536, budget - bytes + 1));
      const result = await file.read(chunk, 0, chunk.length, null);
      if (!result.bytesRead) break;
      bytes += result.bytesRead;
      if (bytes > budget) throw boundaryError("RESOURCE_LIMIT");
      chunks.push(chunk.subarray(0, result.bytesRead));
    }
    return Buffer.concat(chunks, bytes);
  } finally {
    await file.close();
  }
};
const bounded = (value: string) => value.slice(-OUTPUT_LIMIT);
const redact = (value: string) =>
  bounded(value)
    .replace(/bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "[REDACTED]")
    .replace(/\b(?:sk|pk)-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]")
    .replace(/\b(?:access|refresh|api)[_-]?token\s*[:=]\s*\S+/gi, "[REDACTED]");

type ProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};
export type SandboxRunner = (input: {
  binary: string;
  args: string[];
  timeoutMs: number;
}) => Promise<ProcessResult>;
const defaultRunner: SandboxRunner = ({ binary, args, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin" },
    });
    let stdout = "",
      stderr = "",
      timedOut = false;
    child.stdout.on(
      "data",
      (chunk: Buffer) => (stdout = bounded(stdout + chunk.toString("utf8"))),
    );
    child.stderr.on(
      "data",
      (chunk: Buffer) => (stderr = bounded(stderr + chunk.toString("utf8"))),
    );
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
  });

export interface SandboxArtifactResolver {
  read(
    ownerId: string,
    companyId: string,
    ref: string,
  ): Promise<{ name: string; content: Uint8Array }>;
  write(
    ownerId: string,
    companyId: string,
    input: {
      name: string;
      content: Uint8Array;
      taskId: string;
      traceId: string;
      idempotencyKey?: string;
    },
  ): Promise<string>;
  findByIdempotencyKey?(
    ownerId: string,
    companyId: string,
    idempotencyKey: string,
  ): Promise<string | undefined>;
}

export class LocalDockerSandboxProvider {
  readonly id = "LOCAL_DOCKER" as const;
  constructor(
    readonly artifacts: SandboxArtifactResolver,
    readonly binary = "/usr/local/bin/docker",
    readonly runner: SandboxRunner = defaultRunner,
  ) {}

  async execute(request: SandboxExecutionRequest) {
    request = SandboxExecutionRequestSchema.parse(request);
    // The bind-backed output mount cannot enforce a runtime disk quota. Do not
    // run untrusted code on the real host until a reviewed quota-backed mount
    // exists. Injected runners are test fixtures, not production containment.
    if (this.runner === defaultRunner)
      throw Object.assign(boundaryError("SANDBOX_UNAVAILABLE"), { reasonCode: "RUNTIME_DISK_CONTAINMENT_UNVERIFIED" });
    if (
      request.expectedOutputs.some((name) => !flatName(name)) ||
      new Set(request.expectedOutputs).size !== request.expectedOutputs.length
    )
      throw boundaryError("POLICY_DENIED");
    if (request.networkPolicy !== "DENY_ALL")
      throw Object.assign(
        new Error("The local sandbox supports DENY_ALL networking only."),
        { code: "NETWORK_DENIED" },
      );
    if (request.allowedSecretRefs.length)
      throw Object.assign(
        new Error("The local sandbox does not inject company secrets."),
        { code: "POLICY_DENIED" },
      );
    const root = await mkdtemp(join(tmpdir(), "alexa-sandbox-"));
    const inputDir = join(root, "input"),
      outputDir = join(root, "output");
    const containerName = `alexa-sandbox-${crypto.randomUUID()}`;
    let dispatched = false;
    const started = performance.now();
    try {
      await Promise.all([mkdir(inputDir), mkdir(outputDir)]);
      // The container runs as nobody and may write only to this disposable output mount.
      await chmod(outputDir, 0o777);
      const code = await this.artifacts.read(
        request.ownerId,
        request.companyId,
        request.codeArtifactRef,
      );
      await writeFile(
        join(inputDir, `code.${extensions[request.language]}`),
        code.content,
        { mode: 0o444 },
      );
      for (const ref of request.inputArtifactRefs) {
        const artifact = await this.artifacts.read(
          request.ownerId,
          request.companyId,
          ref,
        );
        if (!flatName(artifact.name)) throw boundaryError("POLICY_DENIED");
        await writeFile(join(inputDir, artifact.name), artifact.content, {
          mode: 0o444,
          flag: "wx",
        });
      }
      await chmod(inputDir, 0o555);
      const memory = `${request.resourceLimits.memoryMb}m`;
      dispatched = true;
      const result = await this.runner({
        binary: this.binary,
        args: [
          "run",
          "--name",
          containerName,
          "--pull",
          "never",
          "--network",
          "none",
          "--memory",
          memory,
          "--cpus",
          String(request.resourceLimits.cpuCores),
          "--pids-limit",
          String(request.resourceLimits.processCount),
          "--read-only",
          "--cap-drop",
          "ALL",
          "--security-opt",
          "no-new-privileges",
          "--user",
          "65534:65534",
          "--tmpfs",
          `/tmp:rw,noexec,nosuid,size=${Math.min(64, request.resourceLimits.diskMb)}m`,
          "--mount",
          `type=bind,source=${inputDir},target=/workspace,readonly`,
          "--mount",
          `type=bind,source=${outputDir},target=/output`,
          images[request.language],
          ...commands[request.language],
        ],
        timeoutMs: request.timeoutMs,
      });
      if (result.timedOut) throw boundaryError("TIMEOUT");
      const outputArtifactRefs: string[] = [];
      let totalOutputBytes = 0;
      const names = await readdir(outputDir);
      if (
        names.length > 40 ||
        names.some((name) => !flatName(name)) ||
        (request.expectedOutputs.length > 0 &&
          (names.some((name) => !request.expectedOutputs.includes(name)) ||
            request.expectedOutputs.some((name) => !names.includes(name))))
      )
        throw boundaryError("POLICY_DENIED");
      const budget = Math.min(
        MAX_COLLECTED_BYTES,
        request.resourceLimits.diskMb * 1_048_576,
      );
      const outputs: Array<{ name: string; content: Buffer }> = [];
      for (const name of names.sort()) {
        const content = await readSandboxOutput(
          outputDir,
          name,
          budget - totalOutputBytes,
        );
        totalOutputBytes += content.byteLength;
        outputs.push({ name, content });
      }
      // Validate the entire batch before persisting any artifact.
      for (const { name, content } of outputs) {
        outputArtifactRefs.push(
          await this.artifacts.write(request.ownerId, request.companyId, {
            name,
            content,
            taskId: request.taskId,
            traceId: request.traceId,
          }),
        );
      }
      return {
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        stdout: redact(result.stdout),
        stderr: redact(result.stderr),
        outputArtifactRefs,
        durationMs: Math.round(performance.now() - started),
        destroyed: true,
      };
    } finally {
      await this.cleanup(containerName, dispatched, inputDir, root);
    }
  }

  private async cleanup(
    containerName: string,
    dispatched: boolean,
    inputDir: string,
    root: string,
  ) {
    // Killing the Docker CLI is not proof that its container stopped.
    let destroyed = !dispatched;
    try {
      if (dispatched) {
        const removal = await this.runner({
          binary: this.binary,
          args: ["rm", "--force", containerName],
          timeoutMs: 10_000,
        });
        destroyed = removal.exitCode === 0 && !removal.timedOut;
        if (!destroyed) {
          const remaining = await this.runner({
            binary: this.binary,
            args: [
              "container",
              "ls",
              "--all",
              "--filter",
              `name=^/${containerName}$`,
              "--format",
              "{{.ID}}",
            ],
            timeoutMs: 10_000,
          });
          destroyed =
            remaining.exitCode === 0 && !remaining.timedOut && !remaining.stdout.trim();
        }
      }
    } catch {
      destroyed = false;
    }
    // Never remove a mount while an unconfirmed container could still write to it.
    if (!destroyed)
      throw Object.assign(boundaryError("SANDBOX_UNAVAILABLE"), { destroyed: false });
    await chmod(inputDir, 0o700).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}

export class SandboxExecutionService {
  constructor(
    readonly store: DurableExecutionStore,
    readonly agents: AgentStore,
    readonly provider: LocalDockerSandboxProvider,
    readonly audit?: GovernanceAuditWriter,
    readonly now = () => new Date(),
    readonly authorize?: (request: SandboxExecutionRequest, capability: string) => Promise<boolean>,
  ) {}
  async execute(raw: unknown, auditContext: { requestId: string; ipAddress: string }) {
    const request = SandboxExecutionRequestSchema.parse(raw);
    const assignment = (
      await this.agents.listAssignments(request.ownerId, request.companyId)
    ).find((item) => item.id === request.assignmentId);
    if (!assignment || assignment.status !== "ACTIVE")
      throw Object.assign(
        new Error(
          "Sandbox execution requires an active assignment in the selected company.",
        ),
        { code: "SANDBOX_ASSIGNMENT_DENIED", statusCode: 403 },
      );
    const definition = await this.agents.findDefinition(
      request.ownerId,
      assignment.agentDefinitionId,
    );
    const capability =
      request.language === "PYTHON" ? "SANDBOX_PYTHON_ANALYSIS" : "SANDBOX_NODE_SCRIPT";
    if (!definition?.capabilityRequirements.includes(capability))
      throw Object.assign(
        new Error(
          "The assignment was not granted the required finite sandbox capability.",
        ),
        { code: "SANDBOX_CAPABILITY_DENIED", statusCode: 403 },
      );
    // A definition requirement or profile ID is not an effective grant. Only a
    // trusted server resolver may attest the full policy/grant intersection.
    if (!this.authorize || !(await this.authorize(request, capability)))
      throw Object.assign(new Error("Effective sandbox authority is unavailable or denied."), { code: "SANDBOX_CAPABILITY_DENIED", statusCode: 403 });
    let outcome: Awaited<ReturnType<LocalDockerSandboxProvider["execute"]>> | undefined;
    let failureCode:
      | "CODE_ERROR"
      | "TIMEOUT"
      | "RESOURCE_LIMIT"
      | "NETWORK_DENIED"
      | "POLICY_DENIED"
      | "SANDBOX_UNAVAILABLE"
      | null = null;
    try {
      outcome = await this.provider.execute(request);
      failureCode = outcome.timedOut
        ? "TIMEOUT"
        : outcome.exitCode === 0
          ? null
          : "CODE_ERROR";
    } catch (error) {
      failureCode =
        error instanceof Error &&
        ["RESOURCE_LIMIT", "NETWORK_DENIED", "POLICY_DENIED", "TIMEOUT"].includes(
          (error as Error & { code?: string }).code ?? "",
        )
          ? (
              error as Error & {
                code: "RESOURCE_LIMIT" | "NETWORK_DENIED" | "POLICY_DENIED" | "TIMEOUT";
              }
            ).code
          : "SANDBOX_UNAVAILABLE";
    }
    const result = SandboxExecutionResultSchema.parse({
      id: crypto.randomUUID(),
      ownerId: request.ownerId,
      companyId: request.companyId,
      assignmentId: request.assignmentId,
      taskId: request.taskId,
      provider: this.provider.id,
      status: failureCode ? "FAILED" : "COMPLETED",
      failureCode,
      exitCode: outcome?.exitCode ?? null,
      outputArtifactRefs: outcome?.outputArtifactRefs ?? [],
      stdoutSummary: outcome?.stdout ?? "",
      stderrSummary: outcome?.stderr ?? "",
      durationMs: outcome?.durationMs ?? 0,
      destroyed: outcome?.destroyed ?? false,
      traceId: request.traceId,
      createdAt: this.now().toISOString(),
    });
    await this.store.saveSandboxResult(result);
    await this.audit?.({
      eventType: "SANDBOX_EXECUTION_COMPLETED",
      ownerId: request.ownerId,
      companyId: request.companyId,
      outcome: result.status === "COMPLETED" ? "SUCCESS" : "FAILURE",
      reason: result.failureCode ?? "Sandbox completed.",
      metadata: {
        sandboxExecutionId: result.id,
        taskId: result.taskId,
        provider: result.provider,
      },
      ...auditContext,
    });
    return result;
  }
}
