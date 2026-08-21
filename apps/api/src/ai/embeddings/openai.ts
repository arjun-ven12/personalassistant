import { z } from "zod";
import {
  EmbeddingRequestSchema,
  EmbeddingResponseSchema,
  type EmbeddingProvider,
} from "./provider.js";

const OpenAIEmbeddingResponseSchema = z
  .object({
    data: z.array(
      z.object({ embedding: z.array(z.number().finite()).min(1).max(16_384) }),
    ).min(1),
  })
  .passthrough();

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly providerId = "openai";

  constructor(
    readonly modelId: string,
    private readonly apiKey?: string,
    private readonly baseUrl = "https://api.openai.com/v1",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  healthCheck() {
    return Promise.resolve(this.apiKey
      ? { providerId: this.providerId, status: "HEALTHY" as const, errorCode: null }
      : {
          providerId: this.providerId,
          status: "UNCONFIGURED" as const,
          errorCode: "EMBEDDING_PROVIDER_UNCONFIGURED",
        });
  }

  async embed(request: { input: string }) {
    const parsed = EmbeddingRequestSchema.parse(request);
    if (!this.apiKey) throw new Error("EMBEDDING_PROVIDER_UNCONFIGURED");
    const response = await this.fetchImpl(
      `${this.baseUrl.replace(/\/$/, "")}/embeddings`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: this.modelId, input: parsed.input }),
      },
    );
    if (!response.ok) throw new Error("EMBEDDING_REQUEST_FAILED");
    const body = OpenAIEmbeddingResponseSchema.parse(await response.json());
    return EmbeddingResponseSchema.parse({
      providerId: this.providerId,
      modelId: this.modelId,
      embedding: body.data[0]!.embedding,
    });
  }
}
