import {
  ReflectionCalibrationSchema,
  ReflectionPatternSchema,
  ReflectionRecordSchema,
  type ReflectionCalibration,
  type ReflectionPattern,
  type ReflectionRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";
import type { ReflectionStore } from "./store.js";
const save = async (
  pool: Pool,
  kind: string,
  value: { id: string; ownerId: string },
  at: string,
) => {
  await pool.query(
    "INSERT INTO reflection_artifacts(id,owner_id,kind,updated_at,record) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET updated_at=EXCLUDED.updated_at,record=EXCLUDED.record",
    [value.id, value.ownerId, kind, at, value],
  );
};
const list = async <T>(pool: Pool, o: string, k: string, s: { parse(v: unknown): T }) =>
  (
    await pool.query<{ record: unknown }>(
      "SELECT record FROM reflection_artifacts WHERE owner_id=$1 AND kind=$2 ORDER BY updated_at DESC",
      [o, k],
    )
  ).rows.map((r) => s.parse(r.record));
export class PostgresReflectionStore implements ReflectionStore {
  constructor(readonly pool: Pool) {}
  async saveReflection(v: ReflectionRecord) {
    const x = ReflectionRecordSchema.parse(v);
    await save(this.pool, "REFLECTION", x, x.createdAt);
  }
  listReflections(o: string) {
    return list(this.pool, o, "REFLECTION", ReflectionRecordSchema);
  }
  async savePattern(v: ReflectionPattern) {
    const x = ReflectionPatternSchema.parse(v);
    await save(this.pool, "PATTERN", x, x.lastObserved);
  }
  listPatterns(o: string) {
    return list(this.pool, o, "PATTERN", ReflectionPatternSchema);
  }
  async saveCalibration(v: ReflectionCalibration) {
    const x = ReflectionCalibrationSchema.parse(v);
    await save(this.pool, "CALIBRATION", x, x.updatedAt);
  }
  listCalibrations(o: string) {
    return list(this.pool, o, "CALIBRATION", ReflectionCalibrationSchema);
  }
}
