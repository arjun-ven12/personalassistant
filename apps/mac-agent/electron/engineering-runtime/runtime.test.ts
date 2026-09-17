import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  EngineeringCommandDefinitionSchema,
  EngineeringCommandResultSchema,
  EngineeringDependencyOperationResultSchema,
} from "@alexa-control/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  NativeEngineeringRuntime,
  type EngineeringDependencyRunner,
  type NetworkIsolatedEngineeringRunner,
} from "./runtime.js";

const execute = promisify(execFile);
const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

class TestIsolatedRunner implements NetworkIsolatedEngineeringRunner {
  readonly networkIsolated = true as const;
  run(input: Parameters<NetworkIsolatedEngineeringRunner["run"]>[0]) {
    const startedAt = new Date().toISOString();
    return Promise.resolve(
      EngineeringCommandResultSchema.parse({
        commandId: input.command.id,
        exitCode: 0,
        stdout: "bounded test output",
        stderr: "",
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: 1,
        timedOut: false,
        cancelled: false,
        truncated: false,
        networkIsolated: true,
      }),
    );
  }
}

class TestDependencyRunner implements EngineeringDependencyRunner {
  calls: Parameters<EngineeringDependencyRunner["run"]>[0][] = [];
  async run(input: Parameters<EngineeringDependencyRunner["run"]>[0]) {
    this.calls.push(input);
    await writeFile(path.join(input.cwd, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    return EngineeringDependencyOperationResultSchema.parse({
      packageManager: input.packageManager,
      operation: input.operation,
      packages: input.packages,
      exitCode: 0,
      durationMs: 1,
      stdout: "installed",
      stderr: "",
      timedOut: false,
      lockfileChanged: true,
    });
  }
}

describe("NativeEngineeringRuntime", () => {
  let temporaryRoot: string;
  let repositoryRoot: string;
  let worktreeRoot: string;
  let runtime: NativeEngineeringRuntime;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "engineering-runtime-test-"));
    repositoryRoot = path.join(temporaryRoot, "repository");
    worktreeRoot = path.join(temporaryRoot, "worktrees");
    await mkdir(repositoryRoot);
    await execute("/usr/bin/git", ["init", "-b", "main"], { cwd: repositoryRoot });
    await execute("/usr/bin/git", ["config", "user.email", "test@example.invalid"], {
      cwd: repositoryRoot,
    });
    await execute("/usr/bin/git", ["config", "user.name", "Engineering Runtime Test"], {
      cwd: repositoryRoot,
    });
    await writeFile(
      path.join(repositoryRoot, "source.ts"),
      "export const value = 1;\n",
    );
    await writeFile(path.join(repositoryRoot, "README.md"), "Base documentation.\n");
    await writeFile(
      path.join(repositoryRoot, "package.json"),
      '{"scripts":{"test":"node --test"}}\n',
    );
    await writeFile(
      path.join(repositoryRoot, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\n",
    );
    await writeFile(
      path.join(repositoryRoot, "secret.txt"),
      "api_key=sk-syntheticfixture000000000000\n",
    );
    await writeFile(
      path.join(repositoryRoot, ".env"),
      "SYNTHETIC_SECRET=never-return-this\n",
    );
    await mkdir(path.join(repositoryRoot, "security"));
    await writeFile(
      path.join(repositoryRoot, "security", "policy.ts"),
      "export const safe = true;\n",
    );
    await execute("/usr/bin/git", ["add", "."], { cwd: repositoryRoot });
    await execute("/usr/bin/git", ["commit", "-m", "fixture"], { cwd: repositoryRoot });
    runtime = new NativeEngineeringRuntime(worktreeRoot, new TestIsolatedRunner());
  });

  afterEach(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("creates five isolated worktrees and preserves independent changes", async () => {
    const inspection = await runtime.inspectRepository({
      repositoryRootPath: repositoryRoot,
    });
    const locators = Array.from({ length: 5 }, () => `ew-${crypto.randomUUID()}`);
    await Promise.all(
      locators.map((worktreeLocator, index) =>
        runtime.createWorktree({
          repositoryRootPath: repositoryRoot,
          worktreeLocator,
          branchName: `alexa/00000000000${index}-parallel`,
          baseCommit: inspection.baseCommit,
        }),
      ),
    );

    await Promise.all(
      locators.map((worktreeLocator, index) =>
        runtime.applyPatch({
          repositoryRootPath: repositoryRoot,
          worktreeLocator,
          patch: {
            path: "source.ts",
            expectedSha256: digest("export const value = 1;\n"),
            hunks: [
              {
                startLine: 1,
                endLine: 1,
                replacement: `export const value = ${index + 2};`,
              },
            ],
          },
          protectedPaths: [],
          protectedPathApproved: false,
        }),
      ),
    );

    const values = await Promise.all(
      locators.map((worktreeLocator) =>
        runtime.readFile({
          repositoryRootPath: repositoryRoot,
          worktreeLocator,
          path: "source.ts",
          startLine: 1,
          maxBytes: 1_024,
        }),
      ),
    );
    expect(new Set(values.map((value) => value.content))).toHaveLength(5);
    expect(await readFile(path.join(repositoryRoot, "source.ts"), "utf8")).toBe(
      "export const value = 1;\n",
    );
  });

  it("blocks traversal, absolute paths, symlink escape, generated paths, and protected paths", async () => {
    const inspection = await runtime.inspectRepository({
      repositoryRootPath: repositoryRoot,
    });
    const locator = `ew-${crypto.randomUUID()}`;
    await runtime.createWorktree({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
      branchName: "alexa/111111111111-security",
      baseCommit: inspection.baseCommit,
    });
    await expect(
      runtime.readFile({
        repositoryRootPath: repositoryRoot,
        worktreeLocator: locator,
        path: "../../.ssh/id_rsa",
        startLine: 1,
        maxBytes: 100,
      }),
    ).rejects.toThrow();
    await expect(
      runtime.readFile({
        repositoryRootPath: repositoryRoot,
        worktreeLocator: locator,
        path: "/etc/passwd",
        startLine: 1,
        maxBytes: 100,
      }),
    ).rejects.toThrow();
    await expect(
      runtime.readFile({
        repositoryRootPath: repositoryRoot,
        worktreeLocator: locator,
        path: ".env",
        startLine: 1,
        maxBytes: 100,
      }),
    ).rejects.toThrow();
    expect(
      await runtime.search({
        repositoryRootPath: repositoryRoot,
        worktreeLocator: locator,
        query: "never-return-this",
        mode: "TEXT",
        limit: 10,
      }),
    ).toEqual([]);
    const outside = path.join(temporaryRoot, "outside.txt");
    await writeFile(outside, "outside\n");
    await symlink(outside, path.join(worktreeRoot, locator, "escape.txt"));
    await expect(
      runtime.readFile({
        repositoryRootPath: repositoryRoot,
        worktreeLocator: locator,
        path: "escape.txt",
        startLine: 1,
        maxBytes: 100,
      }),
    ).rejects.toMatchObject({ code: "SYMLINK_REJECTED" });
    await expect(
      runtime.createFile({
        repositoryRootPath: repositoryRoot,
        worktreeLocator: locator,
        path: "node_modules/payload.ts",
        content: "bad",
        protectedPaths: [],
        protectedPathApproved: false,
      }),
    ).rejects.toThrow();
    await expect(
      runtime.applyPatch({
        repositoryRootPath: repositoryRoot,
        worktreeLocator: locator,
        patch: {
          path: "security/policy.ts",
          expectedSha256: digest("export const safe = true;\n"),
          hunks: [
            { startLine: 1, endLine: 1, replacement: "export const safe = false;" },
          ],
        },
        protectedPaths: ["security/**"],
        protectedPathApproved: false,
      }),
    ).rejects.toMatchObject({ code: "PROTECTED_PATH" });
  });

  it("redacts secrets and quarantines approved deletions instead of permanently deleting", async () => {
    const inspection = await runtime.inspectRepository({
      repositoryRootPath: repositoryRoot,
    });
    const locator = `ew-${crypto.randomUUID()}`;
    await runtime.createWorktree({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
      branchName: "alexa/222222222222-redaction",
      baseCommit: inspection.baseCommit,
    });
    const read = await runtime.readFile({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
      path: "secret.txt",
      startLine: 1,
      maxBytes: 1_024,
    });
    expect(read.content).not.toContain("sk-synthetic");
    expect(read.redactions).toContain("api-key");
    const deletion = await runtime.quarantineFile({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
      path: "source.ts",
      expectedSha256: digest("export const value = 1;\n"),
      protectedPaths: [],
      protectedPathApproved: true,
    });
    expect(deletion.recoveryLocator).toMatch(/^ew-.*:/);
    const status = await runtime.gitStatus({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
    });
    expect(status.entries).toContainEqual(
      expect.objectContaining({ path: "source.ts", kind: "DELETED" }),
    );
  });

  it("searches, reads bounded ranges, patches atomically, creates files, diffs, and runs registered commands", async () => {
    const inspection = await runtime.inspectRepository({
      repositoryRootPath: repositoryRoot,
    });
    expect(inspection.metadata.languages).toContain("TypeScript");
    expect(inspection.metadata.packageManagers).toContain("pnpm");
    const locator = `ew-${crypto.randomUUID()}`;
    await runtime.createWorktree({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
      branchName: "alexa/333333333333-e2e",
      baseCommit: inspection.baseCommit,
    });
    expect(
      await runtime.search({
        repositoryRootPath: repositoryRoot,
        worktreeLocator: locator,
        query: "value",
        mode: "TEXT",
        limit: 10,
      }),
    ).toContainEqual(expect.objectContaining({ path: "source.ts", line: 1 }));
    await runtime.applyPatch({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
      patch: {
        path: "source.ts",
        expectedSha256: digest("export const value = 1;\n"),
        hunks: [{ startLine: 1, endLine: 1, replacement: "export const value = 42;" }],
      },
      protectedPaths: [],
      protectedPathApproved: false,
    });
    await runtime.createFile({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
      path: "created.ts",
      content: "export const created = true;\n",
      protectedPaths: [],
      protectedPathApproved: false,
    });
    const diff = await runtime.gitDiff({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
      maxBytes: 64_000,
    });
    expect(diff.patch).toContain("value = 42");
    expect(diff.patch).toContain("created = true");
    expect(diff.files).toContainEqual(
      expect.objectContaining({ path: "created.ts", additions: 1 }),
    );
    const command = EngineeringCommandDefinitionSchema.parse({
      id: "lint",
      executable: "pnpm",
      args: ["lint"],
      kind: "LINT",
      timeoutMs: 5_000,
      maxOutputBytes: 4_096,
      networkPolicy: "DENY",
    });
    const result = await runtime.runCommand({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
      command,
    });
    expect(result).toMatchObject({
      exitCode: 0,
      networkIsolated: true,
      truncated: false,
    });
  });

  it("rejects shell syntax in command definitions and fails closed without an isolated runner", async () => {
    expect(() =>
      EngineeringCommandDefinitionSchema.parse({
        id: "escape",
        executable: "pnpm",
        args: ["test;cat", "~/.ssh/id_rsa"],
        kind: "TEST",
        timeoutMs: 5_000,
        maxOutputBytes: 4_096,
        networkPolicy: "DENY",
      }),
    ).toThrow();
    expect(() =>
      EngineeringCommandDefinitionSchema.parse({
        id: "escape",
        executable: "pnpm",
        args: ["test", "&&", "curl"],
        kind: "TEST",
        timeoutMs: 5_000,
        maxOutputBytes: 4_096,
        networkPolicy: "DENY",
      }),
    ).toThrow();
    const inspection = await runtime.inspectRepository({
      repositoryRootPath: repositoryRoot,
    });
    const locator = `ew-${crypto.randomUUID()}`;
    await runtime.createWorktree({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
      branchName: "alexa/444444444444-command",
      baseCommit: inspection.baseCommit,
    });
    const noRunner = new NativeEngineeringRuntime(worktreeRoot);
    const command = EngineeringCommandDefinitionSchema.parse({
      id: "test",
      executable: "pnpm",
      args: ["test"],
      kind: "TEST",
      timeoutMs: 5_000,
      maxOutputBytes: 4_096,
      networkPolicy: "DENY",
    });
    await expect(
      noRunner.runCommand({
        repositoryRootPath: repositoryRoot,
        worktreeLocator: locator,
        command,
      }),
    ).rejects.toMatchObject({ code: "COMMAND_SANDBOX_UNAVAILABLE" });
  });

  it("preserves a dirty human checkout and refuses to remove dirty worktrees", async () => {
    await writeFile(path.join(repositoryRoot, "human-change.txt"), "do not touch\n");
    const inspection = await runtime.inspectRepository({
      repositoryRootPath: repositoryRoot,
    });
    await expect(
      runtime.createWorktree({
        repositoryRootPath: repositoryRoot,
        worktreeLocator: `ew-${crypto.randomUUID()}`,
        branchName: "alexa/555555555555-dirty",
        baseCommit: inspection.baseCommit,
      }),
    ).rejects.toMatchObject({ code: "DIRTY_REPOSITORY" });
    expect(await readFile(path.join(repositoryRoot, "human-change.txt"), "utf8")).toBe(
      "do not touch\n",
    );
    await rm(path.join(repositoryRoot, "human-change.txt"));
    const clean = await runtime.inspectRepository({
      repositoryRootPath: repositoryRoot,
    });
    const locator = `ew-${crypto.randomUUID()}`;
    await runtime.createWorktree({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
      branchName: "alexa/555555555555-preserve",
      baseCommit: clean.baseCommit,
    });
    await writeFile(path.join(worktreeRoot, locator, "dirty.txt"), "keep\n");
    await expect(
      runtime.removeWorktree({
        repositoryRootPath: repositoryRoot,
        worktreeLocator: locator,
      }),
    ).rejects.toMatchObject({ code: "WORKTREE_ERROR" });
  });

  it("creates a controlled task commit and cherry-picks it into a dedicated integration worktree", async () => {
    const inspection = await runtime.inspectRepository({
      repositoryRootPath: repositoryRoot,
    });
    const taskLocator = `ew-${crypto.randomUUID()}`;
    const integrationLocator = `ew-${crypto.randomUUID()}`;
    await runtime.createWorktree({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: taskLocator,
      branchName: "alexa/666666666666-task",
      baseCommit: inspection.baseCommit,
    });
    await runtime.createWorktree({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: integrationLocator,
      branchName: "alexa/777777777777-integration",
      baseCommit: inspection.baseCommit,
    });
    await runtime.applyPatch({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: taskLocator,
      patch: {
        path: "source.ts",
        expectedSha256: digest("export const value = 1;\n"),
        hunks: [{ startLine: 1, endLine: 1, replacement: "export const value = 2;" }],
      },
      protectedPaths: [],
      protectedPathApproved: false,
    });
    const prepared = await runtime.prepareCommit({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: taskLocator,
      taskId: "10000000-0000-4000-8000-000000000001",
      agentId: "20000000-0000-4000-8000-000000000002",
      baseCommit: inspection.baseCommit,
    });
    expect(prepared.files).toEqual(["source.ts"]);
    const integrated = await runtime.integrateCommit({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: integrationLocator,
      commit: prepared.commit,
      sourceWorktreeLocator: taskLocator,
    });
    expect(integrated).toMatchObject({ integrated: true, conflictPaths: [] });
    expect(
      (
        await runtime.readFile({
          repositoryRootPath: repositoryRoot,
          worktreeLocator: integrationLocator,
          path: "source.ts",
          startLine: 1,
          maxBytes: 1_024,
        })
      ).content,
    ).toBe("export const value = 2;\n");
    const combined = await runtime.gitDiff({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: integrationLocator,
      baseCommit: inspection.baseCommit,
      maxBytes: 131_072,
    });
    expect(combined.files.map((file) => file.path)).toEqual(["source.ts"]);
    expect(combined.patch).toContain("+export const value = 2;");
    expect(combined.truncated).toBe(false);
    expect(await readFile(path.join(repositoryRoot, "source.ts"), "utf8")).toBe(
      "export const value = 1;\n",
    );
    expect(
      await runtime.prepareCommit({
        repositoryRootPath: repositoryRoot,
        worktreeLocator: taskLocator,
        taskId: "10000000-0000-4000-8000-000000000001",
        agentId: "20000000-0000-4000-8000-000000000002",
        baseCommit: inspection.baseCommit,
      }),
    ).toEqual(prepared);
    expect(
      (
        await runtime.integrateCommit({
          repositoryRootPath: repositoryRoot,
          worktreeLocator: integrationLocator,
          commit: prepared.commit,
          sourceWorktreeLocator: taskLocator,
        })
      ).headCommit,
    ).toBe(integrated.headCommit);
  });

  it("aborts a conflicting cherry-pick and preserves the last clean integrated head", async () => {
    const inspection = await runtime.inspectRepository({
      repositoryRootPath: repositoryRoot,
    });
    const firstLocator = `ew-${crypto.randomUUID()}`;
    const secondLocator = `ew-${crypto.randomUUID()}`;
    const integrationLocator = `ew-${crypto.randomUUID()}`;
    await runtime.createWorktree({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: firstLocator,
      branchName: "alexa/888888888888-first",
      baseCommit: inspection.baseCommit,
    });
    await runtime.createWorktree({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: secondLocator,
      branchName: "alexa/999999999999-second",
      baseCommit: inspection.baseCommit,
    });
    await runtime.createWorktree({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: integrationLocator,
      branchName: "alexa/aaaaaaaaaaaa-integration",
      baseCommit: inspection.baseCommit,
    });
    for (const [locator, value] of [
      [firstLocator, 2],
      [secondLocator, 3],
    ] as const)
      await runtime.applyPatch({
        repositoryRootPath: repositoryRoot,
        worktreeLocator: locator,
        patch: {
          path: "source.ts",
          expectedSha256: digest("export const value = 1;\n"),
          hunks: [
            { startLine: 1, endLine: 1, replacement: `export const value = ${value};` },
          ],
        },
        protectedPaths: [],
        protectedPathApproved: false,
      });
    const first = await runtime.prepareCommit({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: firstLocator,
      taskId: "30000000-0000-4000-8000-000000000003",
      agentId: "20000000-0000-4000-8000-000000000002",
      baseCommit: inspection.baseCommit,
    });
    const second = await runtime.prepareCommit({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: secondLocator,
      taskId: "40000000-0000-4000-8000-000000000004",
      agentId: "20000000-0000-4000-8000-000000000002",
      baseCommit: inspection.baseCommit,
    });
    const accepted = await runtime.integrateCommit({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: integrationLocator,
      commit: first.commit,
      sourceWorktreeLocator: firstLocator,
    });
    const rejected = await runtime.integrateCommit({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: integrationLocator,
      commit: second.commit,
      sourceWorktreeLocator: secondLocator,
    });
    expect(rejected).toMatchObject({
      integrated: false,
      headCommit: accepted.headCommit,
      conflictPaths: ["source.ts"],
    });
    expect(
      (
        await runtime.gitStatus({
          repositoryRootPath: repositoryRoot,
          worktreeLocator: integrationLocator,
        })
      ).dirty,
    ).toBe(false);
  });

  it("fast-forwards only the exact clean protected target and recognizes crash retry", async () => {
    const base = (
      await runtime.inspectRepository({ repositoryRootPath: repositoryRoot })
    ).baseCommit;
    const locator = `ew-${crypto.randomUUID()}`;
    await runtime.createWorktree({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
      branchName: "alexa/bbbbbbbbbbbb-integration",
      baseCommit: base,
    });
    await runtime.applyPatch({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
      patch: {
        path: "source.ts",
        expectedSha256: digest("export const value = 1;\n"),
        hunks: [{ startLine: 1, endLine: 1, replacement: "export const value = 2;" }],
      },
      protectedPaths: [],
      protectedPathApproved: false,
    });
    const prepared = await runtime.prepareCommit({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
      taskId: "10000000-0000-4000-8000-000000000001",
      agentId: "20000000-0000-4000-8000-000000000002",
      baseCommit: base,
    });
    const request = {
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
      expectedBase: base,
      candidateHead: prepared.commit,
      targetBranch: "main",
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    await expect(
      runtime.mergeCandidate({ ...request, candidateHead: "f".repeat(40) }),
    ).rejects.toMatchObject({ code: "INCONSISTENT_STATE" });
    await expect(
      runtime.mergeCandidate({
        ...request,
        leaseExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_DENIED" });
    const merged = await runtime.mergeCandidate(request);
    expect(merged).toMatchObject({
      merged: true,
      alreadyMerged: false,
      headCommit: prepared.commit,
    });
    expect((await runtime.mergeCandidate(request)).alreadyMerged).toBe(true);
    expect(
      (await runtime.inspectRepository({ repositoryRootPath: repositoryRoot }))
        .baseCommit,
    ).toBe(prepared.commit);
    expect(await readFile(path.join(repositoryRoot, "source.ts"), "utf8")).toBe(
      "export const value = 2;\n",
    );
  });

  it("resolves only independently appended low-risk Markdown in the integration worktree", async () => {
    const base = (
      await runtime.inspectRepository({ repositoryRootPath: repositoryRoot })
    ).baseCommit;
    const firstLocator = `ew-${crypto.randomUUID()}`;
    const secondLocator = `ew-${crypto.randomUUID()}`;
    const integrationLocator = `ew-${crypto.randomUUID()}`;
    for (const [locator, branch] of [
      [firstLocator, "alexa/cccccccccccc-first"],
      [secondLocator, "alexa/dddddddddddd-second"],
      [integrationLocator, "alexa/eeeeeeeeeeee-integration"],
    ] as const)
      await runtime.createWorktree({
        repositoryRootPath: repositoryRoot,
        worktreeLocator: locator,
        branchName: branch,
        baseCommit: base,
      });
    await writeFile(
      path.join(worktreeRoot, firstLocator, "README.md"),
      "Base documentation.\nFirst addition.\n",
    );
    await writeFile(
      path.join(worktreeRoot, secondLocator, "README.md"),
      "Base documentation.\nSecond addition.\n",
    );
    const first = await runtime.prepareCommit({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: firstLocator,
      taskId: "10000000-0000-4000-8000-000000000001",
      agentId: "20000000-0000-4000-8000-000000000002",
      baseCommit: base,
    });
    const second = await runtime.prepareCommit({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: secondLocator,
      taskId: "30000000-0000-4000-8000-000000000003",
      agentId: "20000000-0000-4000-8000-000000000002",
      baseCommit: base,
    });
    const accepted = await runtime.integrateCommit({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: integrationLocator,
      commit: first.commit,
      sourceWorktreeLocator: firstLocator,
    });
    expect(
      await runtime.integrateCommit({
        repositoryRootPath: repositoryRoot,
        worktreeLocator: integrationLocator,
        commit: second.commit,
        sourceWorktreeLocator: secondLocator,
      }),
    ).toMatchObject({
      conflictPaths: ["README.md"],
      conflictHunks: [expect.objectContaining({ path: "README.md" })],
    });
    await expect(
      runtime.resolveAdditiveDocsConflict({
        repositoryRootPath: repositoryRoot,
        worktreeLocator: integrationLocator,
        sourceWorktreeLocator: secondLocator,
        commit: second.commit,
        path: "security/policy.md",
        expectedHead: accepted.headCommit,
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_DENIED" });
    const resolved = await runtime.resolveAdditiveDocsConflict({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: integrationLocator,
      sourceWorktreeLocator: secondLocator,
      commit: second.commit,
      path: "README.md",
      expectedHead: accepted.headCommit,
    });
    expect(resolved.integrated).toBe(true);
    expect(
      await readFile(path.join(worktreeRoot, integrationLocator, "README.md"), "utf8"),
    ).toBe("Base documentation.\nFirst addition.\nSecond addition.\n");
    expect(await readFile(path.join(repositoryRoot, "README.md"), "utf8")).toBe(
      "Base documentation.\n",
    );
  });

  it("initializes a deterministic project and installs dependencies through the reviewed runner", async () => {
    const developmentRoot = path.join(temporaryRoot, "development-root");
    await mkdir(developmentRoot);
    const dependencies = new TestDependencyRunner();
    const initializedRuntime = new NativeEngineeringRuntime(
      worktreeRoot,
      new TestIsolatedRunner(),
      dependencies,
    );
    const projectRoot = path.join(developmentRoot, "saas-site");
    const inspection = await initializedRuntime.initializeProject({
      repositoryRootPath: projectRoot,
      projectSlug: "saas-site",
      template: "REACT_VITE_TYPESCRIPT",
      defaultBranch: "main",
    });
    expect(inspection).toMatchObject({ branch: "main", dirty: false });
    expect(inspection.metadata.frameworks).toContain("Vite");
    expect(dependencies.calls).toHaveLength(1);
    expect(dependencies.calls[0]).toMatchObject({
      packageManager: "pnpm",
      operation: "INSTALL",
      packages: [],
    });
    expect(
      JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8")),
    ).toMatchObject({ name: "saas-site", private: true });
    expect(
      (
        await execute("/usr/bin/git", ["log", "-1", "--pretty=%s"], {
          cwd: projectRoot,
        })
      ).stdout.trim(),
    ).toBe("Initialize governed project");
    await expect(
      initializedRuntime.initializeProject({
        repositoryRootPath: projectRoot,
        projectSlug: "saas-site",
        template: "REACT_VITE_TYPESCRIPT",
        defaultBranch: "main",
      }),
    ).rejects.toMatchObject({ code: "INCONSISTENT_STATE" });
  });

  it("runs bounded project dependency operations and denies non-registry dependency specs", async () => {
    const dependencies = new TestDependencyRunner();
    const dependencyRuntime = new NativeEngineeringRuntime(
      worktreeRoot,
      new TestIsolatedRunner(),
      dependencies,
    );
    const base = (
      await dependencyRuntime.inspectRepository({ repositoryRootPath: repositoryRoot })
    ).baseCommit;
    const locator = `ew-${crypto.randomUUID()}`;
    await dependencyRuntime.createWorktree({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
      branchName: "alexa/ffffffffffff-dependencies",
      baseCommit: base,
    });
    const installed = await dependencyRuntime.dependencyOperation({
      repositoryRootPath: repositoryRoot,
      worktreeLocator: locator,
      packageManager: "pnpm",
      operation: "INSTALL",
      packages: [],
    });
    expect(installed).toMatchObject({ operation: "INSTALL", exitCode: 0 });
    await writeFile(
      path.join(worktreeRoot, locator, "package.json"),
      JSON.stringify({
        dependencies: { unsafe: "https://example.invalid/archive.tgz" },
      }),
    );
    await expect(
      dependencyRuntime.dependencyOperation({
        repositoryRootPath: repositoryRoot,
        worktreeLocator: locator,
        packageManager: "pnpm",
        operation: "INSTALL",
        packages: [],
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_DENIED" });
  });
});
