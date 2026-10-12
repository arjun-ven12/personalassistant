import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { EngineeringDeliveryService } from "../engineering-delivery/service.js";
import type { EngineeringManagerService } from "../engineering-orchestration/service.js";
import type { EngineeringIntegrationService } from "../engineering-integration/service.js";
import type { EngineeringRuntimeStore } from "../engineering-runtime/store.js";
import { SelfImprovementService } from "./service.js";

const ownerId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000002";
const repositoryId = "30000000-0000-4000-8000-000000000003";
const deliveryId = "40000000-0000-4000-8000-000000000004";
const context = { ownerId, companyId, requestId: "self-test", ipAddress: "100.64.0.1",
  sessionId: "50000000-0000-4000-8000-000000000005", networkState: "PRIVATE_NETWORK" as const };

const setup = () => {
  const createMock = vi.fn(() => Promise.resolve({ delivery: { id: deliveryId } }));
  const instructionMock = vi.fn(() => Promise.resolve({}));
  const startMock = vi.fn();
  const delivery = { create: createMock, addInstruction: instructionMock, start: startMock,
    store: { findByIdempotencyKey: vi.fn(() => Promise.resolve(undefined)) } } as unknown as EngineeringDeliveryService;
  const runtime = { findRepository: vi.fn((owner: string, company: string, id: string) => Promise.resolve(
    owner === ownerId && company === companyId && id === repositoryId
      ? { id, ownerId, companyId, status: "ACTIVE", protectedPaths: ["apps/api/src/auth/**"] }
      : undefined)) } as unknown as EngineeringRuntimeStore;
  const service = new SelfImprovementService(delivery, {} as EngineeringManagerService,
    {} as EngineeringIntegrationService, runtime,
    (_owner, company) => Promise.resolve(company === companyId ? repositoryId : null), vi.fn());
  vi.spyOn(service, "view").mockResolvedValue({ deliveryId } as Awaited<ReturnType<SelfImprovementService["view"]>>);
  return { service, createMock, instructionMock, startMock };
};

describe("SelfImprovementService boundary", () => {
  it("uses only the owner-scoped configured repository and server-classified FAST policy", async () => {
    const { service, createMock, startMock } = setup();
    await service.create(context, { request: "Make Athena dashboard cards compact.", idempotencyKey: "self-fast-001" });
    const requestDigest = createHash("sha256").update(JSON.stringify(["Make Athena dashboard cards compact.", []])).digest("hex");
    expect(createMock).toHaveBeenCalledWith(context,
      expect.objectContaining({ repositoryId, request: "Make Athena dashboard cards compact." }),
      { selfImprovement: { riskLevel: "LOW", engineeringMode: "FAST", targetAreas: [], requestDigest }, deferDrive: true });
    expect(startMock).toHaveBeenCalledOnce();
    await expect(service.create({ ...context, companyId: "60000000-0000-4000-8000-000000000006" },
      { request: "Make Athena dashboard cards compact.", idempotencyKey: "self-fast-002" }))
      .rejects.toMatchObject({ code: "REPOSITORY_UNAVAILABLE" });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("rejects client-selected repository and risk fields at the schema boundary", async () => {
    const { service, createMock } = setup();
    await expect(service.create(context, { request: "Make Athena dashboard cards compact.",
      idempotencyKey: "self-fast-003", repositoryId, riskLevel: "LOW" }))
      .rejects.toMatchObject({ name: "ZodError" });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("blocks an in-flight authority expansion before the delivery manager can schedule it", async () => {
    const { service, instructionMock } = setup();
    vi.spyOn(service, "view").mockResolvedValue({
      repositoryId, riskLevel: "LOW", engineeringMode: "FAST",
    } as never);
    await expect(service.addInstruction(context, deliveryId,
      { instruction: "Also bypass approval requirements.", idempotencyKey: "unsafe-delta-001" }))
      .rejects.toMatchObject({ code: "RISK_ESCALATION" });
    expect(instructionMock).not.toHaveBeenCalled();
  });

  it("starts execution only after the creation transaction commits", async () => {
    const { service, startMock } = setup();
    let committed = false;
    service.setTransaction(async (_key, work) => {
      const result = await work();
      expect(startMock).not.toHaveBeenCalled();
      committed = true;
      return result;
    });
    startMock.mockImplementation(() => { expect(committed).toBe(true); });
    await service.create(context, { request: "Make Athena dashboard cards compact.",
      idempotencyKey: "self-commit-001" });
    expect(startMock).toHaveBeenCalledOnce();
  });

  it("does not start execution when creation cannot commit", async () => {
    const { service, startMock } = setup();
    service.setTransaction(async (_key, work) => {
      await work();
      throw new Error("Transaction rolled back");
    });
    await expect(service.create(context, { request: "Make Athena dashboard cards compact.",
      idempotencyKey: "self-commit-002" })).rejects.toThrow("Transaction rolled back");
    expect(startMock).not.toHaveBeenCalled();
  });
});
