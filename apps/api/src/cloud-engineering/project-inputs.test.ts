import { describe, expect, it, vi } from "vitest";
import {
  EngineeringProjectInputService,
  projectInputContext,
} from "./project-inputs.js";
import { InMemoryEngineeringOrchestrationStore } from "../engineering-orchestration/store.js";
import type { EngineeringObjective, EngineeringTask } from "@alexa-control/shared";
const ownerId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const objectiveId = "33333333-3333-4333-8333-333333333333";
const taskId = "44444444-4444-4444-8444-444444444444";
const context = { ownerId, companyId, requestId: taskId, ipAddress: "127.0.0.1" };
const request = {
  fileName: "requirements.txt",
  mimeType: "text/plain",
  contentBase64: Buffer.from("Use a compact status indicator.").toString("base64"),
  idempotencyKey: taskId,
};
const fixture = () => {
  const store = new InMemoryEngineeringOrchestrationStore();
  vi.spyOn(store, "findObjective").mockImplementation((owner, company, id) =>
    owner === ownerId && company === companyId && id === objectiveId
      ? ({
          id,
          ownerId,
          companyId,
          status: "RUNNING",
        } as unknown as EngineeringObjective)
      : undefined,
  );
  vi.spyOn(store, "listTasks").mockReturnValue([{ id: taskId }] as EngineeringTask[]);
  const audit = vi.fn(() => Promise.resolve());
  return { store, audit, service: new EngineeringProjectInputService(store, audit) };
};
describe("owner project inputs", () => {
  it("persists one canonical artifact across retries and excludes encoded binary from model context", async () => {
    const { store, audit, service } = fixture();
    const input = await service.upload(context, objectiveId, request);
    expect(input.provenance).toBe("OWNER_UPLOADED_UNTRUSTED");
    expect(await service.upload(context, objectiveId, request)).toEqual(input);
    expect(store.listArtifacts(ownerId, companyId, objectiveId)).toHaveLength(1);
    const artifact = store.listArtifacts(ownerId, companyId, objectiveId)[0]!;
    expect(projectInputContext(artifact).contract.contentBase64).toBeUndefined();
    expect(projectInputContext(artifact).contract.untrustedText).toContain(
      "compact status",
    );
    expect(JSON.stringify(audit.mock.calls)).not.toContain("compact status");
    await expect(
      service.upload(context, objectiveId, {
        ...request,
        contentBase64: Buffer.from("Different content").toString("base64"),
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("denies cross-company, disguised images, path names, invalid UTF8 and credentials", async () => {
    const { service, store } = fixture();
    await expect(
      service.upload({ ...context, companyId: ownerId }, objectiveId, request),
    ).rejects.toMatchObject({ statusCode: 404 });
    for (const changes of [
      { fileName: "../requirements.txt" },
      { mimeType: "image/png", fileName: "image.png" },
      { contentBase64: Buffer.from([255, 254]).toString("base64") },
      {
        contentBase64: Buffer.from("api_key=sk_test_12345678901234567890").toString(
          "base64",
        ),
      },
      { contentBase64: Buffer.alloc(16385, 65).toString("base64") },
    ])
      await expect(
        service.upload(context, objectiveId, { ...request, ...changes }),
      ).rejects.toThrow();
    expect(store.listArtifacts(ownerId, companyId, objectiveId)).toHaveLength(0);
  });
  it("enforces the objective quota under concurrent uploads", async () => {
    const { service, store } = fixture();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        service.upload(context, objectiveId, {
          ...request,
          idempotencyKey: crypto.randomUUID(),
        }),
      ),
    );
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(12);
    expect(store.listArtifacts(ownerId, companyId, objectiveId)).toHaveLength(12);
  });
  it("audits an existing receipt after a prior audit failure rather than silently accepting it", async () => {
    const { audit, service } = fixture();
    audit.mockRejectedValueOnce(Error("audit unavailable"));
    await expect(service.upload(context, objectiveId, request)).rejects.toThrow(
      "audit unavailable",
    );
    await expect(service.upload(context, objectiveId, request)).resolves.toMatchObject({
      provenance: "OWNER_UPLOADED_UNTRUSTED",
    });
    expect(audit).toHaveBeenCalledTimes(2);
  });
});
