import { describe, expect, it } from "vitest";
import { EmbeddingService } from "../../intelligence/embedding-service.js";
import { OpenAIEmbeddingProvider } from "./openai.js";

describe("provider-neutral embedding runtime", () => {
  it("fails soft when no embedding provider is configured", async () => {
    const service = new EmbeddingService({
      provider: "disabled",
      model: "none",
      batchSize: 32,
      maxRetries: 1,
      dimensions: 1536,
    });
    expect(service.status().enabled).toBe(false);
    await expect(service.embed("hello")).rejects.toThrow("EMBEDDING_PROVIDER_DISABLED");
    await expect(service.runtime.health()).resolves.toMatchObject({ status: "UNCONFIGURED" });
  });

  it("keeps OpenAI transport inside an optional embedding provider", async () => {
    const provider = new OpenAIEmbeddingProvider(
      "text-embedding-test",
      "test-key",
      "https://example.test/v1",
      () => Promise.resolve(new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), { status: 200 })),
    );
    await expect(provider.embed({ input: "hello" })).resolves.toMatchObject({
      providerId: "openai",
      modelId: "text-embedding-test",
      embedding: [0.1, 0.2],
    });
  });
});
