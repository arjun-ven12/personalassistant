import { BusinessActionRequestSchema } from "@alexa-control/shared";
import { z } from "zod";

import type { IntegrationRegistryService } from "../integrations/service.js";
import type { ExecutionStore } from "../execution/store.js";
import type { NativeProviderRuntime } from "../native-providers/service.js";
import type { ReviewedToolManifest } from "./lifecycle.js";
import type { ReviewedToolHandler } from "./reviewed-adapter.js";
import { normalizeSchema, schemaDigest } from "./schema.js";

const empty = { type: "object", properties: {}, required: [], additionalProperties: false };
const metricInput = { type: "object", properties: {
  metricId: { type: "string", minLength: 2, maxLength: 120 },
  windowStart: { type: "string", minLength: 20, maxLength: 35 },
  windowEnd: { type: "string", minLength: 20, maxLength: 35 },
}, required: ["metricId", "windowStart", "windowEnd"], additionalProperties: false };
const metricOutput = { type: "object", properties: {
  status: { type: "string", enum: ["VERIFIED"] },
  externalReferenceId: { type: "string", maxLength: 240 },
  metricId: { type: "string", minLength: 2, maxLength: 120 },
  value: { type: "number" },
  unit: { type: "string", minLength: 1, maxLength: 80 },
  observedAt: { type: "string", minLength: 20, maxLength: 35 },
}, required: ["status", "externalReferenceId", "metricId", "value", "unit", "observedAt"], additionalProperties: false };
const nativeOutput = { type: "object", properties: {
  registeredProviders: { type: "integer", minimum: 0 },
  healthyProviders: { type: "integer", minimum: 0 },
}, required: ["registeredProviders", "healthyProviders"], additionalProperties: false };
const nativeFocusOutput = { type: "object", properties: {
  verified: { type: "boolean", enum: [true] },
  executionRequestId: { type: "string", minLength: 36, maxLength: 36 },
}, required: ["verified", "executionRequestId"], additionalProperties: false };
const exactDigest = (input: unknown, output: unknown) => schemaDigest({ type: "object", properties: {
  input: normalizeSchema(input), output: normalizeSchema(output),
}, required: ["input", "output"], additionalProperties: false });

/** Delegates a finite read to the existing credentialed, company-scoped business runtime. */
export function createProductionUniversalAdapters(integrations: IntegrationRegistryService, nativeProviders: NativeProviderRuntime, executionStore: ExecutionStore): {
  handlers: { API: ReviewedToolHandler[]; NATIVE: ReviewedToolHandler[] };
  manifests: ReviewedToolManifest[];
} {
  const api: ReviewedToolHandler = {
    providerId: "analytics",
    descriptor: { name: "read_metric", description: "Read one registered analytics metric through the governed business integration.",
      inputSchema: metricInput, outputSchema: metricOutput, capabilityCategory: "analytics.query_metric",
      department: "analytics", operationClass: "READ", riskLevel: "read_only", approvalRequirement: "session", costModel: "UNKNOWN" },
    async invoke(input) {
      const args = z.object({ metricId: z.string(), windowStart: z.string(), windowEnd: z.string() }).strict().parse(input.arguments);
      const action = BusinessActionRequestSchema.parse({ capability: "analytics.query_metric", metricId: args.metricId,
        periodStart: args.windowStart, periodEnd: args.windowEnd, dimensions: [],
        idempotencyKey: input.idempotencyKey ?? input.invocationId,
        reason: "Reviewed universal tool metric read." });
      const record = await integrations.requestBusinessAction({ ownerId: input.ownerId, body: action,
        requestId: input.context.requestId, ipAddress: input.context.ipAddress ?? "internal" });
      if (record.companyId !== input.companyId || record.status !== "VERIFIED" || !record.externalReferenceId) throw new Error("Business provider read was not verified.");
      const dashboard = await integrations.businessDashboard(input.ownerId);
      const metric = dashboard.metrics.find((item) => item.companyId === input.companyId && item.sourceProvider === "analytics" && item.externalMetricId === record.externalReferenceId && item.metricId === args.metricId && item.queryPeriodStart === args.windowStart && item.queryPeriodEnd === args.windowEnd);
      if (!metric) throw new Error("Verified metric observation is unavailable.");
      return { structuredOutput: { status: "VERIFIED", externalReferenceId: record.externalReferenceId.slice(0, 240),
        metricId: metric.metricId, value: metric.value, unit: metric.unit, observedAt: metric.observedAt },
        externalOperationId: record.id };
    },
  };
  const native: ReviewedToolHandler = {
    providerId: "athena.native",
    descriptor: { name: "provider_health", description: "Read bounded status of registered native providers without dispatching a macOS action.",
      inputSchema: empty, outputSchema: nativeOutput, capabilityCategory: "native.provider_health",
      department: "engineering", operationClass: "READ", riskLevel: "read_only", approvalRequirement: "session", costModel: "FREE" },
    async invoke(input) {
      const dashboard = await nativeProviders.dashboard(input.ownerId);
      return { structuredOutput: { registeredProviders: dashboard.nativeProviders.length,
        healthyProviders: dashboard.providerHealth.filter((item) => item.status === "healthy").length } };
    },
  };
  const nativeFocusStatus = async (ownerId: string, companyId: string | null, invocationId: string) => {
      if (!companyId) return { status: "UNKNOWN" as const, externalOperationId: null };
      const request = await executionStore.findByActionId(ownerId, invocationId);
      if (!request || request.toolName !== "native.provider_capability" || request.actionId !== invocationId ||
        request.arguments.providerId !== "provider.vscode" || request.arguments.applicationId !== "vscode" || request.arguments.capability !== "focus" ||
        request.arguments.interactionProposalId !== invocationId) return { status: "UNKNOWN" as const, externalOperationId: null };
      const outcome = await nativeProviders.store.findExecutionByRequest(ownerId, request.id);
      if (outcome?.status === "verified") return { status: "SUCCEEDED" as const, structuredOutput: { verified: true, executionRequestId: request.id }, externalOperationId: request.id };
      if (outcome?.status === "failed" || outcome?.status === "denied") return { status: "FAILED" as const, externalOperationId: request.id };
      return { status: "UNKNOWN" as const, externalOperationId: request.id };
  };
  const focus: ReviewedToolHandler = {
    providerId: "athena.native",
    descriptor: { name: "focus_vscode", description: "Focus the explicitly trusted VS Code application through the signed Mac Agent provider host.",
      inputSchema: empty, outputSchema: nativeFocusOutput, capabilityCategory: "native.focus_vscode",
      department: "engineering", operationClass: "WRITE", riskLevel: "medium", approvalRequirement: "explicit", costModel: "FREE" },
    writeRecovery: "PROVIDER_IDEMPOTENT_RECONCILABLE",
    reconcile(input) { return nativeFocusStatus(input.ownerId, input.companyId, input.invocationId); },
    async invoke(input) {
      if (!input.companyId || !input.context.sessionId || !input.context.ipAddress || !input.context.networkVerification || input.idempotencyKey !== input.invocationId) throw new Error("Trusted native invocation context or exact idempotency key is unavailable.");
      const previous = await executionStore.findByActionId(input.ownerId, input.invocationId);
      if (!previous) await nativeProviders.dispatch({ ownerId: input.ownerId,
        body: { providerId: "provider.vscode", applicationId: "vscode", capability: "focus", interactionProposalId: input.invocationId, arguments: {} },
        requestId: input.context.requestId, ipAddress: input.context.ipAddress,
        sessionId: input.context.sessionId, networkState: input.context.networkVerification });
      if (!await executionStore.findByActionId(input.ownerId, input.invocationId)) throw new Error("Trusted native dispatch did not create a signed execution request.");
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const reconciled = await nativeFocusStatus(input.ownerId, input.companyId, input.invocationId);
        if (reconciled.status === "SUCCEEDED") return { structuredOutput: reconciled.structuredOutput,
          externalOperationId: reconciled.externalOperationId };
        if (reconciled.status === "FAILED") throw new Error("Signed native provider result failed verification.");
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
      }
      throw new Error("Signed native provider result is pending reconciliation.");
    },
  };
  return {
    handlers: { API: [api], NATIVE: [native, focus] },
    manifests: [
      { providerId: api.providerId, toolName: api.descriptor.name, sourceType: "API", schemaDigest: exactDigest(metricInput, metricOutput),
        providerVersion: "1", governanceToolName: "universal.external_read", operationClass: "READ",
        riskLevel: "read_only", approvalRequirement: "session", credentialRequired: true },
      { providerId: native.providerId, toolName: native.descriptor.name, sourceType: "NATIVE", schemaDigest: exactDigest(empty, nativeOutput),
        providerVersion: "1", governanceToolName: "universal.external_read", operationClass: "READ",
        riskLevel: "read_only", approvalRequirement: "session", credentialRequired: false },
      { providerId: focus.providerId, toolName: focus.descriptor.name, sourceType: "NATIVE", schemaDigest: exactDigest(empty, nativeFocusOutput),
        providerVersion: "1", governanceToolName: "universal.external_write", operationClass: "WRITE",
        riskLevel: "medium", approvalRequirement: "explicit", credentialRequired: false },
    ],
  };
}
