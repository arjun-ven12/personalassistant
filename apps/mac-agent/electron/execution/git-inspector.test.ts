import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  inspectCurrentBranch,
  inspectGitDiff,
  inspectGitStatus,
} from "./git-inspector.js";

const git = (cwd: string, args: string[]) => {
  const result = spawnSync("/usr/bin/git", args, {
    cwd,
    shell: false,
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin", HOME: "/var/empty", LC_ALL: "C" },
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
};

const repository = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "assistant-git-"));
  git(root, ["init", "-b", "main"]);
  await writeFile(path.join(root, "tracked.txt"), "initial\n");
  git(root, ["add", "tracked.txt"]);
  git(root, [
    "-c",
    "user.name=Phase Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "-m",
    "initial",
  ]);
  return root;
};

describe("fixed Git inspector", () => {
  it("returns status, branch, and summaries without mutating the repository", async () => {
    const root = await repository();
    const before = git(root, ["rev-parse", "HEAD"]);
    await writeFile(path.join(root, "tracked.txt"), "changed\n");
    await writeFile(path.join(root, "untracked.txt"), "new\n");
    const status = await inspectGitStatus({
      workspaceId: "workspace",
      rootPath: root,
      maxBytes: 32_768,
      maxEntries: 100,
    });
    expect(status.branch.head).toBe("main");
    expect(status.entries.some((entry) => entry.kind === "modified")).toBe(true);
    expect(status.entries.some((entry) => entry.kind === "untracked")).toBe(true);
    expect(
      await inspectCurrentBranch({
        workspaceId: "workspace",
        rootPath: root,
        maxBytes: 32_768,
      }),
    ).toMatchObject({ branchName: "main", detached: false });
    expect(
      (
        await inspectGitDiff({
          workspaceId: "workspace",
          rootPath: root,
          mode: "unstaged_name_status",
          maxBytes: 32_768,
          maxEntries: 100,
        })
      ).files[0],
    ).toMatchObject({ path: "tracked.txt", status: "M" });
    expect(git(root, ["rev-parse", "HEAD"])).toBe(before);
  });

  it("fails closed outside a Git repository", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "assistant-not-git-"));
    await expect(
      inspectGitStatus({
        workspaceId: "workspace",
        rootPath: root,
        maxBytes: 32_768,
        maxEntries: 100,
      }),
    ).rejects.toMatchObject({ code: "GIT_REPOSITORY_REQUIRED" });
  });
});
