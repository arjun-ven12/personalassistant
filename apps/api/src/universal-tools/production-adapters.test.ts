import { describe, expect, it, vi } from "vitest";

import type { IntegrationRegistryService } from "../integrations/service.js";
import { InMemoryExecutionStore, type ExecutionStore } from "../execution/store.js";
import type { NativeProviderRuntime } from "../native-providers/service.js";
import { createProductionUniversalAdapters } from "./production-adapters.js";

describe("production universal adapters", () => {
  it("passes a finite analytics read to existing business governance and requires verified completion", async () => {
    const ownerId = crypto.randomUUID();
    const companyId = crypto.randomUUID();
    const requestBusinessAction = vi.fn((input: unknown) => {
      if (!input) throw new Error("Expected business action input.");
      return Promise.resolve({ id: crypto.randomUUID(), companyId,
        status: "VERIFIED" as const, externalReferenceId: "metric:active_users" });
    });
    const businessDashboard = vi.fn(() => Promise.resolve({ metrics: [{ companyId, sourceProvider: "analytics", externalMetricId: "metric:active_users", metricId: "active_users", queryPeriodStart: "2026-09-01T00:00:00.000Z", queryPeriodEnd: "2026-09-30T00:00:00.000Z", value: 42, unit: "count", observedAt: "2026-09-30T00:00:00.000Z" }] }));
    const integrations = { requestBusinessAction, businessDashboard } as unknown as IntegrationRegistryService;
    const native = { dashboard: vi.fn() } as unknown as NativeProviderRuntime;
    const { handlers } = createProductionUniversalAdapters(integrations, native, new InMemoryExecutionStore());
    const handler = handlers.API[0]!;
    const input = { ownerId, companyId, arguments: { metricId: "active_users", windowStart: "2026-09-01T00:00:00.000Z", windowEnd: "2026-09-30T00:00:00.000Z" },
      invocationId: crypto.randomUUID(), idempotencyKey: null,
      context: { ownerId, companyId, agentId: null, requestId: "api-adapter-test", emergencyStopActive: false, ipAddress: "127.0.0.1" } };
    expect((await handler.invoke(input)).structuredOutput).toEqual({ status: "VERIFIED", externalReferenceId: "metric:active_users", metricId: "active_users", value: 42, unit: "count", observedAt: "2026-09-30T00:00:00.000Z" });
    expect(JSON.stringify(requestBusinessAction.mock.calls)).toContain('"capability":"analytics.query_metric"');
    expect(JSON.stringify(requestBusinessAction.mock.calls)).toContain('"metricId":"active_users"');
    requestBusinessAction.mockResolvedValueOnce({ id: crypto.randomUUID(), companyId, status: "EXTERNAL_RESULT_UNCERTAIN" as never, externalReferenceId: null as never });
    await expect(handler.invoke(input)).rejects.toThrow("not verified");
  });

  it("queues only the fixed VS Code focus operation and waits for a signed verified result", async () => {
    const ownerId = crypto.randomUUID();
    const companyId = crypto.randomUUID();
    const invocationId = crypto.randomUUID();
    const executionRequestId = crypto.randomUUID();
    const request = { id: executionRequestId, actionId: invocationId, toolName: "native.provider_capability",
      arguments: { providerId: "provider.vscode", applicationId: "vscode", capability: "focus", interactionProposalId: invocationId } };
    let queued = false;
    const findByActionId = vi.fn(() => Promise.resolve(queued ? request : undefined));
    const dispatch = vi.fn(() => { queued = true; return Promise.resolve({}); });
    const findExecutionByRequest = vi.fn(() => Promise.resolve({ status: "verified" }));
    const native = { dispatch, store: { findExecutionByRequest } } as unknown as NativeProviderRuntime;
    const execution = { findByActionId } as unknown as ExecutionStore;
    const integrations = {} as IntegrationRegistryService;
    const { handlers } = createProductionUniversalAdapters(integrations, native, execution);
    const focus = handlers.NATIVE.find((handler) => handler.descriptor.name === "focus_vscode")!;
    const input = { ownerId, companyId, arguments: {}, invocationId, idempotencyKey: invocationId,
      context: { ownerId, companyId, agentId: null, requestId: "native-focus-test", emergencyStopActive: false,
        sessionId: crypto.randomUUID(), ipAddress: "127.0.0.1", networkVerification: "PRIVATE_NETWORK" as const } };
    expect((await focus.invoke(input)).structuredOutput).toEqual({ verified: true, executionRequestId });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ ownerId, body: {
      providerId: "provider.vscode", applicationId: "vscode", capability: "focus", interactionProposalId: invocationId, arguments: {} } }));
    expect(await focus.reconcile?.({ ownerId, companyId, invocationId, requestDigest: "a".repeat(64) })).toMatchObject({ status: "SUCCEEDED", externalOperationId: executionRequestId });
    expect(findExecutionByRequest).toHaveBeenCalledWith(ownerId, executionRequestId);
    await expect(focus.invoke({ ...input, idempotencyKey: crypto.randomUUID() })).rejects.toThrow("idempotency");
    expect(dispatch).toHaveBeenCalledOnce();
  });
});
