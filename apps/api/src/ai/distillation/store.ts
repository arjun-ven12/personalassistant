import { DistillationRecordSchema, type DistillationRecord, type DistillationScope } from "@alexa-control/shared";
import type { Pool } from "pg";
import type { UnitOfWork } from "../../persistence/unit-of-work.js";

export interface DistillationStore {
  readonly durable: boolean;
  atomic<T>(scope: DistillationScope, work: () => Promise<T>): Promise<T>;
  get(scope: DistillationScope, id: string): Promise<DistillationRecord | undefined>;
  list(scope: DistillationScope): Promise<DistillationRecord[]>;
  active(scope: DistillationScope): Promise<DistillationRecord | undefined>;
  create(record: DistillationRecord): Promise<DistillationRecord>;
  replace(record: DistillationRecord, expectedVersion: number): Promise<void>;
}
const checked = (raw: unknown, scope: DistillationScope) => {
  const value = DistillationRecordSchema.parse(raw);
  if (value.ownerId !== scope.ownerId || value.companyId !== scope.companyId) throw new Error("DISTILLATION_SCOPE_DENIED");
  return value;
};
/** Fixtures only. Production never falls back to memory. */
export class InMemoryDistillationStore implements DistillationStore {
  readonly durable = false;
  private records = new Map<string, DistillationRecord>();
  private tail: Promise<unknown> = Promise.resolve();
  atomic<T>(_scope: DistillationScope, work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(async () => {
      const snapshot = structuredClone(this.records);
      try { return await work(); } catch (error) { this.records = snapshot; throw error; }
    });
    this.tail = next.catch(() => undefined);
    return next;
  }
  private key(scope: DistillationScope, id: string) { return `${scope.ownerId}:${scope.companyId}:${id}`; }
  get(scope: DistillationScope, id: string) { return Promise.resolve(structuredClone(this.records.get(this.key(scope, id)))); }
  list(scope: DistillationScope) { return Promise.resolve([...this.records.values()].filter(v => v.ownerId === scope.ownerId && v.companyId === scope.companyId).map(v => structuredClone(v))); }
  active(scope: DistillationScope) {
    const value = [...this.records.values()].find(v => v.ownerId === scope.ownerId && v.activation === "ACTIVE");
    if (value && value.companyId !== scope.companyId) throw new Error("ACTIVE_MODEL_SCOPE_CONFLICT");
    return Promise.resolve(value ? structuredClone(value) : undefined);
  }
  async create(raw: DistillationRecord) {
    const record = DistillationRecordSchema.parse(raw);
    const existing = (await this.list(record)).find(v => v.request.idempotencyKey === record.request.idempotencyKey);
    if (existing) return existing;
    this.records.set(this.key(record, record.id), structuredClone(record));
    return structuredClone(record);
  }
  replace(raw: DistillationRecord, expectedVersion: number) {
    const record = DistillationRecordSchema.parse(raw);
    const key = this.key(record, record.id), previous = this.records.get(key);
    if (!previous || previous.version !== expectedVersion || record.version !== expectedVersion + 1) throw new Error("DISTILLATION_CONFLICT");
    this.records.set(key, structuredClone(record));
    return Promise.resolve();
  }
}
export class PostgresDistillationStore implements DistillationStore {
  readonly durable = true;
  constructor(private readonly pool: Pool, private readonly transaction: UnitOfWork) {}
  atomic<T>(scope: DistillationScope, work: () => Promise<T>) { return this.transaction(`athena-distillation:${scope.ownerId}`, work); }
  async get(scope: DistillationScope, id: string) {
    const result = await this.pool.query<{ record: unknown }>("SELECT record FROM athena_distillation_runs WHERE owner_id=$1 AND company_id=$2 AND id=$3", [scope.ownerId, scope.companyId, id]);
    return result.rows[0] ? checked(result.rows[0].record, scope) : undefined;
  }
  async list(scope: DistillationScope) {
    const result = await this.pool.query<{ record: unknown }>("SELECT record FROM athena_distillation_runs WHERE owner_id=$1 AND company_id=$2 ORDER BY created_at DESC LIMIT 501", [scope.ownerId, scope.companyId]);
    if (result.rows.length > 500) throw new Error("DISTILLATION_LIST_QUOTA");
    return result.rows.map(v => checked(v.record, scope));
  }
  async active(scope: DistillationScope) {
    const result = await this.pool.query<{ company_id: string; record: unknown }>("SELECT company_id,record FROM athena_distillation_runs WHERE owner_id=$1 AND record->>'activation'='ACTIVE'", [scope.ownerId]);
    if (result.rows.length > 1 || result.rows.some(v => v.company_id !== scope.companyId)) throw new Error("ACTIVE_MODEL_SCOPE_CONFLICT");
    return result.rows[0] ? checked(result.rows[0].record, scope) : undefined;
  }
  async create(raw: DistillationRecord) {
    const value = DistillationRecordSchema.parse(raw);
    await this.pool.query("INSERT INTO athena_distillation_runs(owner_id,company_id,id,idempotency_key,version,created_at,record) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(owner_id,company_id,idempotency_key) DO NOTHING", [value.ownerId, value.companyId, value.id, value.request.idempotencyKey, value.version, value.createdAt, value]);
    const result = await this.pool.query<{ record: unknown }>("SELECT record FROM athena_distillation_runs WHERE owner_id=$1 AND company_id=$2 AND idempotency_key=$3", [value.ownerId, value.companyId, value.request.idempotencyKey]);
    return checked(result.rows[0]?.record, value);
  }
  async replace(raw: DistillationRecord, expectedVersion: number) {
    const value = DistillationRecordSchema.parse(raw);
    if (value.version !== expectedVersion + 1) throw new Error("DISTILLATION_CONFLICT");
    const result = await this.pool.query("UPDATE athena_distillation_runs SET record=$1,version=$2 WHERE owner_id=$3 AND company_id=$4 AND id=$5 AND version=$6", [value, value.version, value.ownerId, value.companyId, value.id, expectedVersion]);
    if (result.rowCount !== 1) throw new Error("DISTILLATION_CONFLICT");
  }
}
