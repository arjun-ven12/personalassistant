import {
  CapabilityCandidateSchema,
  CapabilityRequestSchema,
  CapabilityStudioEventSchema,
  type CapabilityCandidate,
  type CapabilityRequest,
  type CapabilityStudioEvent,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface CapabilityStudioStore {
  saveCandidate(record: CapabilityCandidate): Awaitable<void>;
  getCandidate(ownerId: string, id: string): Awaitable<CapabilityCandidate | null>;
  listCandidates(ownerId: string, limit: number): Awaitable<CapabilityCandidate[]>;
  saveEvent(record: CapabilityStudioEvent): Awaitable<void>;
  listEvents(ownerId: string, limit: number): Awaitable<CapabilityStudioEvent[]>;
  saveRequest(record: CapabilityRequest): Awaitable<void>;
  listRequests(ownerId: string, limit: number): Awaitable<CapabilityRequest[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .sort((left, right) => String(right[field]).localeCompare(String(left[field])))
    .slice(0, limit)
    .map(clone);

export class InMemoryCapabilityStudioStore implements CapabilityStudioStore {
  readonly #candidates = new Map<string, CapabilityCandidate>();
  readonly #events = new Map<string, CapabilityStudioEvent>();
  readonly #requests = new Map<string, CapabilityRequest>();

  saveCandidate(record: CapabilityCandidate) {
    const parsed = CapabilityCandidateSchema.parse(record);
    this.#candidates.set(parsed.id, clone(parsed));
  }

  getCandidate(ownerId: string, id: string) {
    const record = this.#candidates.get(id);
    return record?.ownerId === ownerId ? clone(record) : null;
  }

  listCandidates(ownerId: string, limit: number) {
    return ordered(
      [...this.#candidates.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }

  saveEvent(record: CapabilityStudioEvent) {
    const parsed = CapabilityStudioEventSchema.parse(record);
    this.#events.set(parsed.id, clone(parsed));
  }

  listEvents(ownerId: string, limit: number) {
    return ordered(
      [...this.#events.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }

  saveRequest(record: CapabilityRequest) {
    const parsed = CapabilityRequestSchema.parse(record);
    this.#requests.set(parsed.id, clone(parsed));
  }

  listRequests(ownerId: string, limit: number) {
    return ordered(
      [...this.#requests.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
}
