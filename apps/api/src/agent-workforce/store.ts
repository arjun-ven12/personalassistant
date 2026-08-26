import { WorkforceEventSchema, type WorkforceEvent } from "@alexa-control/shared";
import type { Awaitable } from "../identity/store.js";

export interface AgentWorkforceStore {
  saveEvent(event: WorkforceEvent): Awaitable<void>;
  listEvents(ownerId: string, agentId: string, limit: number): Awaitable<WorkforceEvent[]>;
}

export class InMemoryAgentWorkforceStore implements AgentWorkforceStore {
  readonly #events = new Map<string, WorkforceEvent>();
  saveEvent(event: WorkforceEvent) {
    const parsed = WorkforceEventSchema.parse(event);
    this.#events.set(parsed.id, structuredClone(parsed));
  }
  listEvents(ownerId: string, agentId: string, limit: number) {
    return [...this.#events.values()]
      .filter((event) => event.ownerId === ownerId && event.agentId === agentId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((event) => structuredClone(event));
  }
}
