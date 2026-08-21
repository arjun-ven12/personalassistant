import { describe, expect, it } from "vitest";

import { RepositorySchema } from "@alexa-control/shared";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { InMemoryPatchStore } from "./store.js";
import { PatchService } from "./service.js";

describe("PatchService", () => {
  it("requires explicit approval before creating patch execution", async () => {
    const ownerId = crypto.randomUUID();
    const repositoryStore = new InMemoryRepositoryStore();
    const repository = repositoryStore.upsertRepository(
      RepositorySchema.parse({
        schemaVersion: "1",
        id: crypto.randomUUID(),
        ownerId,
        workspaceId: "project",
        indexStatus: "INDEXED",
        activeGeneration: 1,
        activeFingerprint: "a".repeat(64),
        lastIndexedAt: new Date().toISOString(),
        lastFailureCode: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );
    const createdExecutions: unknown[] = [];
    const service = new PatchService(
      new InMemoryPatchStore(),
      repositoryStore,
      {
        create: (input: unknown) => {
          createdExecutions.push(input);
          return Promise.resolve({ id: crypto.randomUUID() });
        },
      } as never,
      {
        create: () =>
          Promise.resolve({
            id: crypto.randomUUID(),
            status: "PENDING",
          }),
        approve: () => Promise.resolve({ status: "APPROVED" }),
      } as never,
      () => Promise.resolve(),
    );
    const operation = {
      operationId: crypto.randomUUID(),
      kind: "create" as const,
      relativePath: "src/new-file.ts",
      expectedOriginalSha256: null,
      expectedOriginalContent: null,
      newContent: "export const value = 1;\n",
    };

    const generated = await service.generate({
      ownerId,
      body: {
        repositoryId: repository.id,
        title: "Add file",
        summary: "Creates a new file.",
        operations: [operation],
      },
      ipAddress: "127.0.0.1",
      requestId: crypto.randomUUID(),
    });

    expect(generated.patch.status).toBe("PENDING_APPROVAL");
    expect(createdExecutions).toHaveLength(0);

    const decision = await service.decide({
      ownerId,
      patchId: generated.patch.id,
      sessionId: crypto.randomUUID(),
      body: { decision: "approve" },
      ipAddress: "127.0.0.1",
      requestId: crypto.randomUUID(),
    });

    expect(decision.approvalToken).toBeTruthy();
    await service.execute({
      ownerId,
      sessionId: crypto.randomUUID(),
      patchId: generated.patch.id,
      body: { approvalToken: decision.approvalToken },
      networkState: "PRIVATE_NETWORK",
      ipAddress: "127.0.0.1",
      requestId: crypto.randomUUID(),
    });

    expect(createdExecutions).toHaveLength(1);
    expect(JSON.stringify(createdExecutions[0])).toContain("workspace.apply_patch");
  });
});
