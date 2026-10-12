/* In-memory methods deliberately satisfy the asynchronous persistence contract. */
/* eslint-disable @typescript-eslint/require-await */
import {
  EngineeringDatasetRecordSchema,
  type EngineeringDatasetRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";
export interface EngineeringDatasetStore {
  get(
    ownerId: string,
    companyId: string,
    kind: EngineeringDatasetRecord["kind"],
    key: string,
  ): Promise<EngineeringDatasetRecord | undefined>;
  list(
    ownerId: string,
    companyId: string,
    kind: EngineeringDatasetRecord["kind"],
  ): Promise<EngineeringDatasetRecord[]>;
  save(value: EngineeringDatasetRecord): Promise<EngineeringDatasetRecord>;
}
const identity = (
  v: Pick<EngineeringDatasetRecord, "ownerId" | "companyId" | "kind" | "key">,
) => `${v.ownerId}:${v.companyId}:${v.kind}:${v.key}`;
export class InMemoryEngineeringDatasetStore implements EngineeringDatasetStore {
  private records = new Map<string, EngineeringDatasetRecord>();
  async get(
    ownerId: string,
    companyId: string,
    kind: EngineeringDatasetRecord["kind"],
    key: string,
  ) {
    return structuredClone(
      this.records.get(identity({ ownerId, companyId, kind, key })),
    );
  }
  async list(
    ownerId: string,
    companyId: string,
    kind: EngineeringDatasetRecord["kind"],
  ) {
    return structuredClone(
      [...this.records.values()].filter(
        (v) => v.ownerId === ownerId && v.companyId === companyId && v.kind === kind,
      ),
    );
  }
  async save(value: EngineeringDatasetRecord) {
    const parsed = EngineeringDatasetRecordSchema.parse(value);
    const key = identity(parsed);
    const existing = this.records.get(key);
    if (!existing || parsed.kind === "POLICY" || parsed.kind === "EXCLUSION")
      this.records.set(key, structuredClone(parsed));
    return structuredClone(this.records.get(key)!);
  }
}
export class PostgresEngineeringDatasetStore implements EngineeringDatasetStore {
  constructor(readonly pool: Pool) {}
  async get(
    ownerId: string,
    companyId: string,
    kind: EngineeringDatasetRecord["kind"],
    key: string,
  ) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_dataset_records WHERE owner_id=$1 AND company_id=$2 AND kind=$3 AND record_key=$4",
      [ownerId, companyId, kind, key],
    );
    return result.rows[0]
      ? EngineeringDatasetRecordSchema.parse(result.rows[0].record)
      : undefined;
  }
  async list(
    ownerId: string,
    companyId: string,
    kind: EngineeringDatasetRecord["kind"],
  ) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_dataset_records WHERE owner_id=$1 AND company_id=$2 AND kind=$3 ORDER BY record_key LIMIT 10001",
      [ownerId, companyId, kind],
    );
    if (result.rows.length > 10000)
      throw new Error("Dataset listing quota exceeded; export denied.");
    return result.rows.map((row) => EngineeringDatasetRecordSchema.parse(row.record));
  }
  async save(value: EngineeringDatasetRecord) {
    const parsed = EngineeringDatasetRecordSchema.parse(value);
    const update = parsed.kind === "POLICY" || parsed.kind === "EXCLUSION";
    await this.pool.query(
      `INSERT INTO engineering_dataset_records(owner_id,company_id,kind,record_key,record) VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner_id,company_id,kind,record_key) ${update ? "DO UPDATE SET record=EXCLUDED.record" : "DO NOTHING"}`,
      [parsed.ownerId, parsed.companyId, parsed.kind, parsed.key, parsed],
    );
    return (await this.get(parsed.ownerId, parsed.companyId, parsed.kind, parsed.key))!;
  }
}
