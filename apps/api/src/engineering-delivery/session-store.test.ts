import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import { InMemoryEngineeringProjectSessionStore } from "./session-store.js";

const make = (ownerId: string, companyId: string) => ({
  schemaVersion: "1" as const, id: crypto.randomUUID(), ownerId, companyId,
  repositoryId: crypto.randomUUID(), conversationId: crypto.randomUUID(),
  projectName: "Existing project", messages: [], deliveryIds: [], activeDeliveryId: null, queuedRequests: [],
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});

describe("engineering project session store", () => {
  it("isolates sessions and idempotency keys by owner and company", () => {
    const store = new InMemoryEngineeringProjectSessionStore();
    const owner = crypto.randomUUID();
    const companyA = crypto.randomUUID();
    const companyB = crypto.randomUUID();
    const first = store.create(make(owner, companyA), "session-key-123");
    const second = store.create(make(owner, companyB), "session-key-123");
    expect(second.id).not.toBe(first.id);
    expect(store.find(owner, companyB, first.id)).toBeUndefined();
    expect(store.findByKey(owner, companyB, "session-key-123")?.id).toBe(second.id);
    expect(store.list(owner, companyA).map((session) => session.id)).toEqual([first.id]);
  });

  it("rejects stale updates and preserves the prior transcript", () => {
    const store = new InMemoryEngineeringProjectSessionStore();
    const owner = crypto.randomUUID();
    const company = crypto.randomUUID();
    const session = store.create(make(owner, company), "session-key-123");
    const updated = { ...session, updatedAt: new Date(Date.now() + 1000).toISOString() };
    expect(store.saveIfUpdatedAt(updated, session.updatedAt)).toBe(true);
    expect(store.saveIfUpdatedAt({ ...session, projectName: "stale" }, session.updatedAt)).toBe(false);
    expect(store.find(owner, company, session.id)?.projectName).toBe("Existing project");
  });
});
