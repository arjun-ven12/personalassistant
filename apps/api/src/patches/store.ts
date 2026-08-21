import { PatchRecordSchema, type PatchRecord } from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface PatchStore {
  create(patch: PatchRecord): Awaitable<PatchRecord>;
  find(id: string): Awaitable<PatchRecord | undefined>;
  list(ownerId: string, limit: number): Awaitable<PatchRecord[]>;
  update(patch: PatchRecord): Awaitable<void>;
}

export class InMemoryPatchStore implements PatchStore {
  readonly #patches = new Map<string, PatchRecord>();

  create(patch: PatchRecord) {
    const parsed = PatchRecordSchema.parse(patch);
    this.#patches.set(parsed.id, structuredClone(parsed));
    return structuredClone(parsed);
  }

  find(id: string) {
    const patch = this.#patches.get(id);
    return patch ? structuredClone(patch) : undefined;
  }

  list(ownerId: string, limit: number) {
    return [...this.#patches.values()]
      .filter((patch) => patch.ownerId === ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((patch) => structuredClone(patch));
  }

  update(patch: PatchRecord) {
    if (!this.#patches.has(patch.id)) throw new Error("Patch missing.");
    this.#patches.set(patch.id, structuredClone(PatchRecordSchema.parse(patch)));
  }
}
