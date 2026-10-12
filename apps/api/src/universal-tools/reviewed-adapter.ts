import type { UniversalTool, UniversalToolProvider } from "@alexa-control/shared";
import type { ToolAdapter, TrustedToolContext } from "./gateway.js";

type Descriptor = Awaited<ReturnType<ToolAdapter["discover"]>>[number];
export interface ReviewedToolHandler {
  readonly providerId: string;
  readonly descriptor: Descriptor;
  readonly writeRecovery?: "PROVIDER_IDEMPOTENT_RECONCILABLE";
  /** Must delegate to an existing governed execution service. */
  invoke(input: { context: TrustedToolContext; ownerId: string; companyId: string | null; arguments: unknown; invocationId: string; idempotencyKey: string | null }): Promise<{ structuredOutput: unknown; boundedTextOutput?: string | null; externalOperationId?: string | null }>;
  reconcile?(input: { ownerId: string; companyId: string | null; invocationId: string; requestDigest: string }): Promise<{ status: "SUCCEEDED" | "FAILED" | "UNKNOWN"; structuredOutput?: unknown; externalOperationId: string | null }>;
}

/** Server-registered finite handlers for existing API, native, or local capabilities. */
export class ReviewedDelegatingAdapter implements ToolAdapter {
  readonly #handlers: ReadonlyMap<string, ReviewedToolHandler>;
  readonly writeRecovery?: "PROVIDER_IDEMPOTENT_RECONCILABLE";
  constructor(readonly sourceType: "API" | "NATIVE" | "LOCAL" | "MCP_LOCAL", handlers: readonly ReviewedToolHandler[]) {
    this.#handlers = new Map(handlers.map((handler) => [`${handler.providerId}:${handler.descriptor.name}`, handler]));
    if (this.#handlers.size !== handlers.length) throw new Error("Duplicate reviewed handler.");
    const writes = handlers.filter((handler) => handler.descriptor.operationClass !== "READ");
    if (writes.length > 0 && writes.every((handler) => handler.writeRecovery === "PROVIDER_IDEMPOTENT_RECONCILABLE" && typeof handler.reconcile === "function")) this.writeRecovery = "PROVIDER_IDEMPOTENT_RECONCILABLE";
  }
  hasHandler(toolId: string) { return this.#handlers.has(toolId); }
  discover(provider: UniversalToolProvider) {
    const descriptors = [...this.#handlers.values()].filter((handler) => handler.providerId === provider.id).map((handler) => handler.descriptor);
    return Promise.resolve(descriptors);
  }
  invoke(input: { context: TrustedToolContext; provider: UniversalToolProvider; tool: UniversalTool; arguments: unknown; invocationId: string; idempotencyKey: string | null }) {
    const handler = this.#handlers.get(input.tool.id);
    if (!handler || handler.providerId !== input.provider.id || input.tool.providerId !== input.provider.id) throw new Error("Unreviewed tool handler.");
    if (input.tool.operationClass !== "READ" && (handler.writeRecovery !== "PROVIDER_IDEMPOTENT_RECONCILABLE" || !handler.reconcile)) throw new Error("Provider write recovery is unavailable.");
    return handler.invoke({ context: input.context, ownerId: input.provider.ownerId, companyId: input.provider.companyId, arguments: input.arguments, invocationId: input.invocationId, idempotencyKey: input.idempotencyKey });
  }
  reconcile(input: { provider: UniversalToolProvider; tool: UniversalTool; invocationId: string; requestDigest: string }) {
    const handler = this.#handlers.get(input.tool.id);
    if (!handler?.reconcile || handler.writeRecovery !== "PROVIDER_IDEMPOTENT_RECONCILABLE" || input.tool.providerId !== input.provider.id) throw new Error("Provider reconciliation is unavailable.");
    return handler.reconcile({ ownerId: input.provider.ownerId, companyId: input.provider.companyId, invocationId: input.invocationId, requestDigest: input.requestDigest });
  }
}
