import {
  EngineeringProjectSessionSchema,
  type EngineeringProjectSession,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { Awaitable } from "../identity/store.js";

export interface EngineeringProjectSessionStore {
  create(value: EngineeringProjectSession, idempotencyKey: string): Awaitable<EngineeringProjectSession>;
  find(ownerId: string, companyId: string, id: string): Awaitable<EngineeringProjectSession | undefined>;
  findByKey(ownerId: string, companyId: string, key: string): Awaitable<EngineeringProjectSession | undefined>;
  list(ownerId: string, companyId: string): Awaitable<EngineeringProjectSession[]>;
  saveIfUpdatedAt(value: EngineeringProjectSession, expected: string): Awaitable<boolean>;
}

const key = (ownerId: string, companyId: string, id: string) => `${ownerId}:${companyId}:${id}`;

export class InMemoryEngineeringProjectSessionStore implements EngineeringProjectSessionStore {
  readonly records = new Map<string, EngineeringProjectSession>();
  readonly keys = new Map<string, string>();
  create(value: EngineeringProjectSession, idempotencyKey: string) {
    const parsed = EngineeringProjectSessionSchema.parse(value);
    const existing = this.findByKey(parsed.ownerId, parsed.companyId, idempotencyKey);
    if (existing) return existing;
    this.records.set(key(parsed.ownerId, parsed.companyId, parsed.id), structuredClone(parsed));
    this.keys.set(key(parsed.ownerId, parsed.companyId, idempotencyKey), parsed.id);
    return structuredClone(parsed);
  }
  find(ownerId: string, companyId: string, id: string) {
    const value = this.records.get(key(ownerId, companyId, id));
    return value && structuredClone(value);
  }
  findByKey(ownerId: string, companyId: string, idempotencyKey: string) {
    const id = this.keys.get(key(ownerId, companyId, idempotencyKey));
    return id ? this.find(ownerId, companyId, id) : undefined;
  }
  list(ownerId: string, companyId: string) {
    return [...this.records.values()].filter((value) => value.ownerId === ownerId && value.companyId === companyId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((value) => structuredClone(value));
  }
  saveIfUpdatedAt(value: EngineeringProjectSession, expected: string) {
    const parsed = EngineeringProjectSessionSchema.parse(value);
    const existing = this.find(parsed.ownerId, parsed.companyId, parsed.id);
    if (!existing || existing.updatedAt !== expected) return false;
    this.records.set(key(parsed.ownerId, parsed.companyId, parsed.id), structuredClone(parsed));
    return true;
  }
}

export class PostgresEngineeringProjectSessionStore implements EngineeringProjectSessionStore {
  constructor(readonly pool: Pool) {}
  async create(value: EngineeringProjectSession, idempotencyKey: string) {
    const item = EngineeringProjectSessionSchema.parse(value);
    const result = await this.pool.query<{ record: unknown }>(
      `INSERT INTO engineering_project_sessions(id,owner_id,company_id,repository_id,conversation_id,idempotency_key,updated_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(owner_id,company_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
       RETURNING record`,
      [item.id,item.ownerId,item.companyId,item.repositoryId,item.conversationId,idempotencyKey,item.updatedAt,item],
    );
    return EngineeringProjectSessionSchema.parse(result.rows[0]!.record);
  }
  async find(ownerId: string, companyId: string, id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_project_sessions WHERE owner_id=$1 AND company_id=$2 AND id=$3", [ownerId,companyId,id]);
    return result.rows[0] ? EngineeringProjectSessionSchema.parse(result.rows[0].record) : undefined;
  }
  async findByKey(ownerId: string, companyId: string, idempotencyKey: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_project_sessions WHERE owner_id=$1 AND company_id=$2 AND idempotency_key=$3", [ownerId,companyId,idempotencyKey]);
    return result.rows[0] ? EngineeringProjectSessionSchema.parse(result.rows[0].record) : undefined;
  }
  async list(ownerId: string, companyId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_project_sessions WHERE owner_id=$1 AND company_id=$2 ORDER BY updated_at DESC LIMIT 100", [ownerId,companyId]);
    return result.rows.map((row) => EngineeringProjectSessionSchema.parse(row.record));
  }
  async saveIfUpdatedAt(value: EngineeringProjectSession, expected: string) {
    const item = EngineeringProjectSessionSchema.parse(value);
    const result = await this.pool.query(
      "UPDATE engineering_project_sessions SET updated_at=$4,record=$5 WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND updated_at=$6",
      [item.ownerId,item.companyId,item.id,item.updatedAt,item,expected]);
    return result.rowCount === 1;
  }
}
