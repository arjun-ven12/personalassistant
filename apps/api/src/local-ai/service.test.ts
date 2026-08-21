/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from "vitest";

import { LocalAIService } from "./service.js";
import { LocalModelRegistry } from "./registry.js";
import type { LocalModelRuntime } from "./runtime.js";

const runtime = (): LocalModelRuntime => ({
  id: "fake",
  healthCheck: async () => true,
  listModels: async () => [{ name: "gemma3:4b" }],
  isModelAvailable: async () => true,
  loadModel: async () => undefined,
  unloadModel: async () => undefined,
  generate: async () => ({ model: "gemma3:4b", text: "unused" }),
  generateStructured: async () => ({ model: "gemma3:4b", text: "{}" }),
});

const service = (fake: LocalModelRuntime = runtime()) =>
  new LocalAIService(fake, new LocalModelRegistry(), {
    enabled: true,
    modelName: "gemma3:4b",
    maxConcurrentRequests: 1,
    interpretationTimeoutMs: 1_000,
    conversationTimeoutMs: 1_000,
    structuredRetries: 1,
    contextMaxCharacters: 100,
  });

describe("deprecated local AI compatibility facade", () => {
  it("retains reviewed model administration metadata without tool calling", () => {
    const model = new LocalModelRegistry().resolveRole("CONVERSATION");
    expect(model?.modelName).toBe("gemma3:4b");
    expect(model?.toolCalling).toBe(false);
  });

  it("fails closed when legacy inference is attempted without AIRouter", async () => {
    await expect(service().interpret({ text: "interpret this" })).rejects.toMatchObject({
      code: "CANONICAL_ROUTER_REQUIRED",
    });
    await expect(service().converse({ prompt: "hello" })).rejects.toMatchObject({
      code: "CANONICAL_ROUTER_REQUIRED",
    });
  });

  it("keeps load and unload as bounded local administration operations", async () => {
    const local = service();
    await expect(local.load("gemma3-4b")).resolves.toMatchObject({
      modelReady: false,
      state: "AVAILABLE",
    });
    await expect(local.unload("gemma3-4b")).resolves.toMatchObject({
      modelReady: false,
      state: "AVAILABLE",
    });
  });
});
