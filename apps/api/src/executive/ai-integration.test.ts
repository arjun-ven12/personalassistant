import { describe, expect, it, vi } from "vitest";
import { InMemoryTaskStore } from "../tasks/store.js";
import { ExecutiveBrainService } from "./service.js";
import { InMemoryExecutiveStore } from "./store.js";

const query = {
  type: "PRIORITIZE" as const,
  horizon: "TODAY" as const,
  target: null,
  availableMinutes: null,
  options: [],
  simulation: false,
};
describe("Executive canonical AI integration", () => {
  it("routes explanation through governed planning economics without granting authority", async () => {
    let routedRequest: unknown;
    const execute = vi.fn((request: unknown) => {
      routedRequest = request;
      return Promise.resolve({
        outcome: "SUCCESS",
        outputText: "Grounded executive explanation",
        providerId: "fake",
        modelId: "fake-model",
      });
    });
    const service = new ExecutiveBrainService(
      new InMemoryExecutiveStore(),
      new InMemoryTaskStore(),
      () => new Date("2026-08-16T00:00:00.000Z"),
      { execute } as never,
    );
    const ownerId = crypto.randomUUID();
    const result = await service.query(ownerId, query);
    const request = routedRequest as {
      purpose: string;
      economicContext: { ownerId: string };
      risk: string;
    };
    expect(request).toMatchObject({
      purpose: "PLANNING_ASSIST",
      risk: "LOW",
      economicContext: { ownerId },
    });
    expect(result.text).toBe("Grounded executive explanation");
    expect(result.executed).toBe(false);
  });
  it("propagates cancellation terminally and does not write partial executive history", async () => {
    let started!: () => void;
    const routed = new Promise<void>((resolve) => {
      started = resolve;
    });
    const execute = vi.fn(
      async (_request: unknown, options: { signal?: AbortSignal }) => {
        started();
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () =>
              reject(
                options.signal?.reason instanceof Error
                  ? options.signal.reason
                  : new Error("cancelled"),
              ),
            { once: true },
          );
        });
      },
    );
    const store = new InMemoryExecutiveStore();
    const service = new ExecutiveBrainService(
      store,
      new InMemoryTaskStore(),
      () => new Date(),
      { execute } as never,
    );
    const controller = new AbortController();
    const pending = service.query(crypto.randomUUID(), query, {
      signal: controller.signal,
    });
    await routed;
    controller.abort(new Error("cancelled"));
    await expect(pending).rejects.toThrow("cancelled");
    expect(store.listHistory(crypto.randomUUID())).toEqual([]);
  });
});
