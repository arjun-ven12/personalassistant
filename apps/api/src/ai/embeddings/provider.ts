import { z } from "zod";

export const EmbeddingRequestSchema = z
  .object({ input: z.string().trim().min(1).max(100_000) })
  .strict();
export const EmbeddingResponseSchema = z
  .object({
    providerId: z.string().min(1).max(80),
    modelId: z.string().min(1).max(160),
    embedding: z.array(z.number().finite()).min(1).max(16_384),
  })
  .strict();

export type EmbeddingRequest = z.infer<typeof EmbeddingRequestSchema>;
export type EmbeddingResponse = z.infer<typeof EmbeddingResponseSchema>;
export type EmbeddingProviderHealth = {
  providerId: string;
  status: "HEALTHY" | "UNCONFIGURED" | "UNAVAILABLE";
  errorCode: string | null;
};

export interface EmbeddingProvider {
  readonly providerId: string;
  readonly modelId: string;
  healthCheck(): Promise<EmbeddingProviderHealth>;
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}
