import {
  EngineeringDeliverySchema,
  type EngineeringDelivery,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface EngineeringDeliveryStore {
  save(value: EngineeringDelivery): Awaitable<void>;
  saveIfUpdatedAt(
    value: EngineeringDelivery,
    expectedUpdatedAt: string,
  ): Awaitable<boolean>;
  find(
    ownerId: string,
    companyId: string,
    id: string,
  ): Awaitable<EngineeringDelivery | undefined>;
  findByObjective(
    ownerId: string,
    companyId: string,
    objectiveId: string,
  ): Awaitable<EngineeringDelivery | undefined>;
  findByIdempotencyKey(
    ownerId: string,
    companyId: string,
    key: string,
  ): Awaitable<EngineeringDelivery | undefined>;
  list(
    ownerId: string,
    companyId: string,
    limit: number,
  ): Awaitable<EngineeringDelivery[]>;
}

const scoped = (ownerId: string, companyId: string, id: string) =>
  `${ownerId}:${companyId}:${id}`;

export class InMemoryEngineeringDeliveryStore implements EngineeringDeliveryStore {
  readonly #records = new Map<string, EngineeringDelivery>();
  readonly #idempotency = new Map<string, string>();

  save(value: EngineeringDelivery) {
    const parsed = EngineeringDeliverySchema.parse(value);
    this.#records.set(
      scoped(parsed.ownerId, parsed.companyId, parsed.id),
      structuredClone(parsed),
    );
    const initial = parsed.instructionKeys[0];
    if (initial)
      this.#idempotency.set(
        scoped(parsed.ownerId, parsed.companyId, initial),
        parsed.id,
      );
  }

  saveIfUpdatedAt(value: EngineeringDelivery, expectedUpdatedAt: string) {
    const parsed = EngineeringDeliverySchema.parse(value);
    const existing = this.find(parsed.ownerId, parsed.companyId, parsed.id);
    if (!existing || existing.updatedAt !== expectedUpdatedAt) return false;
    this.save(parsed);
    return true;
  }

  find(ownerId: string, companyId: string, id: string) {
    const value = this.#records.get(scoped(ownerId, companyId, id));
    return value ? structuredClone(value) : undefined;
  }

  findByObjective(ownerId: string, companyId: string, objectiveId: string) {
    const value = [...this.#records.values()].find(
      (item) =>
        item.ownerId === ownerId &&
        item.companyId === companyId &&
        item.objectiveId === objectiveId,
    );
    return value ? structuredClone(value) : undefined;
  }

  findByIdempotencyKey(ownerId: string, companyId: string, key: string) {
    const id = this.#idempotency.get(scoped(ownerId, companyId, key));
    return id ? this.find(ownerId, companyId, id) : undefined;
  }

  list(ownerId: string, companyId: string, limit: number) {
    return [...this.#records.values()]
      .filter((item) => item.ownerId === ownerId && item.companyId === companyId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((value) => structuredClone(value));
  }
}
