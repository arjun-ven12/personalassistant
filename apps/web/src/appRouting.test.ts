import { describe, expect, it } from "vitest";

import { legacyRoute } from "./appRouting.js";

describe("consolidated route migration", () => {
  it("redirects legacy pages to the owning workspace tab", () => {
    expect(legacyRoute("/conversations", "")).toBe("/conversation");
    expect(legacyRoute("/personality", "")).toBe("/voice?tab=personality");
    expect(legacyRoute("/knowledge-graph", "")).toBe("/memory?tab=knowledge");
    expect(legacyRoute("/semantic", "")).toBe("/memory?tab=retrieval");
    expect(legacyRoute("/tasks", "")).toBe("/automation?tab=tasks");
    expect(legacyRoute("/commands", "")).toBe("/automation?tab=commands");
    expect(legacyRoute("/workflows", "")).toBeNull();
    expect(legacyRoute("/application-intelligence", "")).toBe(
      "/applications?tab=adapters",
    );
    expect(legacyRoute("/infrastructure", "")).toBe("/ai?tab=advanced");
    expect(legacyRoute("/policies", "")).toBe("/security?tab=policies");
    expect(legacyRoute("/audit", "")).toBe("/security?tab=audit");
    expect(legacyRoute("/agents", "?tab=workflows")).toBe("/workflows");
    expect(legacyRoute("/agents", "?tab=skills")).toBe("/skills");
    expect(legacyRoute("/workspace", "?tab=applications")).toBe("/applications");
    expect(legacyRoute("/security", "?tab=approvals")).toBe("/approvals");
  });

  it("keeps consolidated routes intact", () => {
    expect(legacyRoute("/conversation", "")).toBeNull();
    expect(legacyRoute("/automation", "?tab=tasks")).toBeNull();
  });
});
