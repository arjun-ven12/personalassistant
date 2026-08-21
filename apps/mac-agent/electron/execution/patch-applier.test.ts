import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { applyApprovedPatch } from "./patch-applier.js";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

describe("approved patch applier", () => {
  it("applies only digest-bound approved patch operations", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "assistant-patch-"));
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src/index.ts"), "export const value = 1;\n");
    const operations = [
      {
        operationId: crypto.randomUUID(),
        kind: "modify" as const,
        relativePath: "src/index.ts",
        expectedOriginalSha256: sha256("export const value = 1;\n"),
        expectedOriginalContent: "export const value = 1;\n",
        newContent: "export const value = 2;\n",
      },
    ];
    const patchDigest = sha256(
      JSON.stringify(
        operations.map((operation) => ({
          kind: operation.kind,
          relativePath: operation.relativePath,
          newRelativePath: null,
          expectedOriginalSha256: operation.expectedOriginalSha256,
          newContent: operation.newContent,
        })),
      ),
    );

    const result = await applyApprovedPatch({
      workspaceId: "workspace",
      rootPath: root,
      blockedPatterns: [".env"],
      arguments: {
        workspaceId: "workspace",
        patchId: crypto.randomUUID(),
        patchDigest,
        approvalToken: "a".repeat(40),
        repositoryGeneration: 1,
        operations,
      },
    });

    expect(await readFile(path.join(root, "src/index.ts"), "utf8")).toBe(
      "export const value = 2;\n",
    );
    expect(result.rollbackSnapshots[0]).toMatchObject({
      relativePath: "src/index.ts",
      existed: true,
      content: "export const value = 1;\n",
    });
  });
});
