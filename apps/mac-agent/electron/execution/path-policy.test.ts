import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { readWorkspaceFile } from "./file-reader.js";
import { resolveWorkspace, resolveWorkspaceFile } from "./path-policy.js";

const makeWorkspace = () => mkdtemp(path.join(os.tmpdir(), "assistant-workspace-"));

describe("workspace path policy and file reader", () => {
  it("reads bounded UTF-8 and redacts obvious inline secrets", async () => {
    const root = await makeWorkspace();
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "src", "index.txt"),
      "token=sk-abcdefghijklmnopqrstuvwxyz123456",
    );
    const result = await readWorkspaceFile({
      workspaceId: "workspace",
      rootPath: root,
      relativePath: "src/index.txt",
      blockedPatterns: [".env", "*.pem", "*.key"],
      maxBytes: 1_024,
    });
    expect(result.content).toContain("[REDACTED]");
    expect(result.redactionsApplied).toContain("openai-key");
  });

  it("rejects blocked files, symlinks, traversal, binary, and oversized files", async () => {
    const root = await makeWorkspace();
    const outside = await makeWorkspace();
    await writeFile(path.join(root, ".env"), "SECRET=yes");
    await writeFile(path.join(outside, "outside.txt"), "outside");
    await symlink(path.join(outside, "outside.txt"), path.join(root, "link.txt"));
    await writeFile(path.join(root, "binary"), Buffer.from([0, 1, 2]));
    await writeFile(path.join(root, "large"), "x".repeat(20));
    const workspace = await resolveWorkspace(root);
    await expect(
      resolveWorkspaceFile(workspace, ".env", [".env"]),
    ).rejects.toMatchObject({
      code: "WORKSPACE_PATH_BLOCKED",
    });
    await expect(
      resolveWorkspaceFile(workspace, "link.txt", [".env"]),
    ).rejects.toMatchObject({
      code: "WORKSPACE_SYMLINK_REJECTED",
    });
    await expect(
      resolveWorkspaceFile(workspace, "../outside", [".env"]),
    ).rejects.toMatchObject({
      code: "WORKSPACE_PATH_INVALID",
    });
    await expect(
      readWorkspaceFile({
        workspaceId: "w",
        rootPath: root,
        relativePath: "binary",
        blockedPatterns: [],
        maxBytes: 10,
      }),
    ).rejects.toMatchObject({ code: "FILE_BINARY_UNSUPPORTED" });
    await expect(
      readWorkspaceFile({
        workspaceId: "w",
        rootPath: root,
        relativePath: "large",
        blockedPatterns: [],
        maxBytes: 10,
      }),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });
});
