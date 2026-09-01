import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
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
        await writeFile(
          join(inputDir, basename(artifact.name).slice(0, 120)),
          artifact.content,
          { mode: 0o444 },
        );
      }
      await chmod(inputDir, 0o555);
      const memory = `${request.resourceLimits.memoryMb}m`;
      const result = await this.runner({
        binary: this.binary,
        args: [
          "run",
          "--rm",
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
      const outputArtifactRefs: string[] = [];
      let totalOutputBytes = 0;
      for (const name of (await readdir(outputDir)).slice(
        0,
        request.expectedOutputs.length || 40,
      )) {
        if (name.includes("..")) continue;
        const content = await readFile(join(outputDir, name));
        totalOutputBytes += content.byteLength;
        if (totalOutputBytes > request.resourceLimits.diskMb * 1_048_576) {
          throw Object.assign(new Error("Sandbox output exceeded its disk budget."), {
            code: "RESOURCE_LIMIT",
          });
        }
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
      };
    } finally {
      await chmod(inputDir, 0o700).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  }
}

export class SandboxExecutionService {
  constructor(
    readonly store: DurableExecutionStore,
    readonly agents: AgentStore,
    readonly provider: LocalDockerSandboxProvider,
    readonly audit?: GovernanceAuditWriter,
    readonly now = () => new Date(),
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
        ["RESOURCE_LIMIT", "NETWORK_DENIED", "POLICY_DENIED"].includes(
          (error as Error & { code?: string }).code ?? "",
        )
          ? (
              error as Error & {
                code: "RESOURCE_LIMIT" | "NETWORK_DENIED" | "POLICY_DENIED";
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
      destroyed: true,
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
