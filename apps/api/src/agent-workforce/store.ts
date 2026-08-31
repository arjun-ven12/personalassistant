import { WorkforceEventSchema, type WorkforceEvent } from "@alexa-control/shared";
import type { Awaitable } from "../identity/store.js";
import { companyScope } from "../companies/scope.js";

export interface AgentWorkforceStore {
  saveEvent(event: WorkforceEvent): Awaitable<void>;
  listEvents(ownerId: string, agentId: string, limit: number): Awaitable<WorkforceEvent[]>;
}

export class InMemoryAgentWorkforceStore implements AgentWorkforceStore {
  readonly #events = new Map<string, WorkforceEvent>();
  saveEvent(event: WorkforceEvent) {
    const parsed = WorkforceEventSchema.parse(event);
    this.#events.set(`${parsed.ownerId}:${companyScope.companyId(parsed.ownerId)??"owner-default"}:${parsed.id}`, structuredClone(parsed));
  }
  listEvents(ownerId: string, agentId: string, limit: number) {
    const prefix=`${ownerId}:${companyScope.companyId(ownerId)??"owner-default"}:`;
    return [...this.#events.entries()]
      .filter(([key,event]) => key.startsWith(prefix) && event.ownerId === ownerId && event.agentId === agentId)
      .map(([,event])=>event)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((event) => structuredClone(event));
  }
}
