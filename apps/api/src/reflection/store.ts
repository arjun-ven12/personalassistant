import {
  ReflectionCalibrationSchema,
  ReflectionPatternSchema,
  ReflectionRecordSchema,
  type ReflectionCalibration,
  type ReflectionPattern,
  type ReflectionRecord,
} from "@alexa-control/shared";
import type { Awaitable } from "../identity/store.js";
export interface ReflectionStore {
  saveReflection(value: ReflectionRecord): Awaitable<void>;
  listReflections(ownerId: string): Awaitable<ReflectionRecord[]>;
  savePattern(value: ReflectionPattern): Awaitable<void>;
  listPatterns(ownerId: string): Awaitable<ReflectionPattern[]>;
  saveCalibration(value: ReflectionCalibration): Awaitable<void>;
  listCalibrations(ownerId: string): Awaitable<ReflectionCalibration[]>;
}
const clone = <T>(value: T): T => structuredClone(value);
export class InMemoryReflectionStore implements ReflectionStore {
  #reflections = new Map<string, ReflectionRecord>();
  #patterns = new Map<string, ReflectionPattern>();
  #calibrations = new Map<string, ReflectionCalibration>();
  saveReflection(v: ReflectionRecord) {
    this.#reflections.set(v.id, clone(ReflectionRecordSchema.parse(v)));
  }
  listReflections(o: string) {
    return [...this.#reflections.values()].filter((v) => v.ownerId === o).map(clone);
  }
  savePattern(v: ReflectionPattern) {
    this.#patterns.set(v.id, clone(ReflectionPatternSchema.parse(v)));
  }
  listPatterns(o: string) {
    return [...this.#patterns.values()].filter((v) => v.ownerId === o).map(clone);
  }
  saveCalibration(v: ReflectionCalibration) {
    this.#calibrations.set(v.id, clone(ReflectionCalibrationSchema.parse(v)));
  }
  listCalibrations(o: string) {
    return [...this.#calibrations.values()].filter((v) => v.ownerId === o).map(clone);
  }
}
