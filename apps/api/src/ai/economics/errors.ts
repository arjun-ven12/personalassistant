import type { AIEconomicErrorCode } from "@alexa-control/shared";

export class AIEconomicError extends Error {
  constructor(readonly code: AIEconomicErrorCode, message: string, readonly retryable = false) {
    super(message);
    this.name = "AIEconomicError";
  }
}
