import { describe, it, expect } from "vitest";
import type { AthenaCoderControlState, DistillationRecord } from "@alexa-control/shared";
import { AthenaCoderControlService } from "../athena-coder/control.js";
import type { AIRuntimeService } from "../runtime-service.js";
import { ExistingAthenaCoderVersionRuntime } from "./runtime.js";
import { fixtureScope, fixtureTime } from "./fixtures.js";
describe("trained model revocation during unavailable/inconsistent runtime", () => {
  it.each(["removed-model", "different-selected-model"])("disables owner-wide inference without trusting %s", async selectedModelId => {
    const registry = { listModels: () => { throw new Error("Runtime inventory unavailable"); } } as unknown as AIRuntimeService;
    let state: AthenaCoderControlState = { ownerId: fixtureScope.ownerId, enabled: true, selectedModelId, allowedCategories: ["UI"], updatedAt: fixtureTime };
    const control = new AthenaCoderControlService(registry, { get: () => Promise.resolve(state), put: value => { state = value; return Promise.resolve(); } });
    const runtime = new ExistingAthenaCoderVersionRuntime(registry, control);
    // Synthetic internal revocation fixture; no model inference or activation occurs.
    await runtime.disable({ ownerId: fixtureScope.ownerId } as DistillationRecord);
    expect((await control.get(fixtureScope.ownerId)).enabled).toBe(false);
  });
});
