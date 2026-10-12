import { describe, it, expect, vi } from "vitest";
import type { LocalModelRuntime } from "../../local-ai/runtime.js";
import { createAIRuntime } from "../bootstrap.js";
import { AthenaCoderControlService, type AthenaCoderControlStore } from "./control.js";
import { ATHENA_CODER_MAC_MODEL_ID } from "../providers/athena-coder.js";
import type { AthenaCoderControlState } from "@alexa-control/shared";

const runtime = () =>
  createAIRuntime({
    ollamaRuntime: {} as LocalModelRuntime,
    ollamaEnabled: false,
    ollamaModel: "gemma3:4b",
    openAIEnabled: false,
    openAIModel: "luna",
    openAIBaseUrl: "https://api.openai.com/v1",
  });
const owner = crypto.randomUUID();
const fixture = () => {
  const records = new Map<string, AthenaCoderControlState>();
  const store: AthenaCoderControlStore = {
    get: (id) => Promise.resolve(records.get(id)),
    put: (value) => {
      records.set(value.ownerId, structuredClone(value));
      return Promise.resolve();
    },
  };
  return { records, service: new AthenaCoderControlService(runtime(), store) };
};
describe("AthenaCoder owner controls", () => {
  it("temporarily skips only the failed category after two observable failures", () => {
    const {service} = fixture(); vi.spyOn(Date, "now").mockReturnValue(1000);
    service.recordTaskOutcome(owner, "UI", {attempted: true, succeeded: false});
    expect(service.categoryAvailable(owner, "UI")).toBe(true);
    service.recordTaskOutcome(owner, "UI", {attempted: true, succeeded: false});
    expect(service.categoryAvailable(owner, "UI")).toBe(false);
    expect(service.categoryAvailable(owner, "TESTS")).toBe(true);
    expect(service.categoryAvailable(crypto.randomUUID(), "UI")).toBe(true);
    vi.mocked(Date.now).mockReturnValue(62000); expect(service.categoryAvailable(owner, "UI")).toBe(true);
    vi.restoreAllMocks();
  });
  it("fails closed without durable storage and still supports disable", async () => {
    const service = new AthenaCoderControlService(runtime());
    expect(await service.get(owner)).toMatchObject({ enabled: false });
    expect(await service.mutate(owner, { action: "DISABLE" })).toMatchObject({
      enabled: false,
    });
    await expect(service.mutate(owner, { action: "ENABLE" })).rejects.toThrow(
      "durable",
    );
  });
  it("version and category changes remain disabled until actual reviewed measurements exist", async () => {
    const { service } = fixture();
    expect(
      await service.mutate(owner, {
        action: "SELECT_VERSION",
        modelId: ATHENA_CODER_MAC_MODEL_ID,
      }),
    ).toMatchObject({ enabled: false });
    expect(
      await service.mutate(owner, {
        action: "SET_CATEGORIES",
        categories: ["UI", "TESTS"],
      }),
    ).toMatchObject({ enabled: false });
    await expect(service.mutate(owner, { action: "ENABLE" })).rejects.toThrow(
      "approved digest",
    );
  });
  it("cannot select unregistered versions or supply runtime/measurement authority", async () => {
    const { service } = fixture();
    await expect(
      service.mutate(owner, { action: "SELECT_VERSION", modelId: "caller-chosen" }),
    ).rejects.toThrow("not registered");
    await expect(
      service.mutate(owner, { action: "ENABLE", expectedLatencyMs: 1 } as never),
    ).rejects.toThrow();
  });
  it("isolates controls by owner and refuses unknown eligibility evidence", async () => {
    const { service } = fixture();
    await service.mutate(owner, { action: "SET_CATEGORIES", categories: ["TESTS"] });
    expect(await service.get(crypto.randomUUID())).toMatchObject({
      enabled: false,
      allowedCategories: [],
    });
    expect(
      await service.eligibilityForTask(owner, {
        size: "SMALL",
        category: "TESTS",
        risk: "LOW",
        securitySensitive: false,
        authenticationRelated: false,
        tenantIsolationRelated: false,
        approvalRelated: false,
        migrationRelated: false,
      }),
    ).toBeUndefined();
  });
});
