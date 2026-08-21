import { ValidationRecordSchema, type ValidationRecord } from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface ValidationStore {
  create(validation: ValidationRecord): Awaitable<ValidationRecord>;
  find(id: string): Awaitable<ValidationRecord | undefined>;
  list(ownerId: string, limit: number): Awaitable<ValidationRecord[]>;
  update(validation: ValidationRecord): Awaitable<void>;
  findByExecutionRequestId(id: string): Awaitable<ValidationRecord | undefined>;
}

export class InMemoryValidationStore implements ValidationStore {
  readonly #validations = new Map<string, ValidationRecord>();

  create(validation: ValidationRecord) {
    const parsed = ValidationRecordSchema.parse(validation);
    this.#validations.set(parsed.id, structuredClone(parsed));
    return structuredClone(parsed);
  }

  find(id: string) {
    const validation = this.#validations.get(id);
    return validation ? structuredClone(validation) : undefined;
  }

  list(ownerId: string, limit: number) {
    return [...this.#validations.values()]
      .filter((validation) => validation.ownerId === ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((validation) => structuredClone(validation));
  }

  update(validation: ValidationRecord) {
    if (!this.#validations.has(validation.id)) throw new Error("Validation missing.");
    this.#validations.set(
      validation.id,
      structuredClone(ValidationRecordSchema.parse(validation)),
    );
  }

  findByExecutionRequestId(id: string) {
    const validation = [...this.#validations.values()].find(
      (candidate) => candidate.executionRequestId === id,
    );
    return validation ? structuredClone(validation) : undefined;
  }
}
