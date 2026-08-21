import type { AIProviderErrorCode, AIUsage } from "@alexa-control/shared";

export class AIProviderError extends Error {
  constructor(
    readonly code: AIProviderErrorCode,
    message: string,
    readonly providerId?: string,
    readonly retryable = false,
    readonly partialUsage?: AIUsage,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
