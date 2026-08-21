import { describe, expect, it } from "vitest";

import {
  RepositorySchema,
  ValidationExecutionResultSchema,
} from "@alexa-control/shared";
import { InMemoryPatchStore } from "../patches/store.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { ValidationService } from "./service.js";
import { InMemoryValidationStore } from "./store.js";

describe("ValidationService", () => {
  it("plans, starts, and publishes a profile-backed validation run", async () => {
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
    const createdExecutions: Array<{ id: string; input: unknown }> = [];
    const store = new InMemoryValidationStore();
    const service = new ValidationService(
      store,
      repositoryStore,
      new InMemoryPatchStore(),
      {
        create: (input: unknown) => {
          const execution = { id: crypto.randomUUID(), input };
          createdExecutions.push(execution);
          return Promise.resolve(execution);
        },
        store: { cancel: () => Promise.resolve(undefined) },
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

    const planned = await service.create({
      ownerId,
      body: {
        repositoryId: repository.id,
        profileIds: ["pnpm_typecheck"],
      },
      ipAddress: "127.0.0.1",
      requestId: crypto.randomUUID(),
    });
    expect(planned.validation.status).toBe("PLANNED");
    expect(createdExecutions).toHaveLength(0);

    const started = await service.start({
      ownerId,
      sessionId: crypto.randomUUID(),
      validationRunId: planned.validation.id,
      body: {},
      networkState: "PRIVATE_NETWORK",
      ipAddress: "127.0.0.1",
      requestId: crypto.randomUUID(),
    });
    expect(started.validation.status).toBe("EXECUTION_REQUESTED");
    expect(JSON.stringify(createdExecutions[0]?.input)).toContain(
      "workspace.validate_profile",
    );

    const resultPayload = ValidationExecutionResultSchema.parse({
      workspaceId: "project",
      validationRunId: planned.validation.id,
      status: "PASSED",
      classification: "PASSED",
      steps: [
        {
          stepId: crypto.randomUUID(),
          profileId: "pnpm_typecheck",
          status: "PASSED",
          classification: "PASSED",
          exitCode: 0,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 1,
          stdout: "",
          stderr: "",
          truncated: false,
          warnings: [],
          errors: [],
        },
      ],
      summary: "1 validation step(s) passed.",
      sandbox: { isolated: true, cleanedUp: true, network: "disabled" },
      metrics: { durationMs: 1, stepCount: 1 },
    });
    await service.publishExecutionResult({
      ownerId,
      executionRequestId: started.validation.executionRequestId!,
      result: {
        commandId: crypto.randomUUID(),
        executionRequestId: started.validation.executionRequestId!,
        deviceId: crypto.randomUUID(),
        toolName: "workspace.validate_profile",
        status: "SUCCEEDED",
        result: resultPayload,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 1,
        truncated: false,
        resultDigest: "b".repeat(64),
        nonce: crypto.randomUUID(),
        deviceSignature: "c".repeat(64),
      },
      ipAddress: "127.0.0.1",
      requestId: crypto.randomUUID(),
    });

    expect(store.find(planned.validation.id)?.status).toBe("PASSED");
  });
});
