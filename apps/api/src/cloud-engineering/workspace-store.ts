import {
  CloudWorkspaceRecordSchema,
  type CloudWorkspaceRecord,
} from "@alexa-control/shared";
import type { Pool } from "pg";
export interface CloudWorkspaceStore {
  create(
    value: CloudWorkspaceRecord,
  ): Promise<{ value: CloudWorkspaceRecord; inserted: boolean }>;
  find(
    ownerId: string,
    companyId: string,
    id: string,
  ): Promise<CloudWorkspaceRecord | undefined>;
  findByRepository(
    ownerId: string,
    companyId: string,
    repositoryId: string,
  ): Promise<CloudWorkspaceRecord | undefined>;
  save(value: CloudWorkspaceRecord, expectedVersion: number): Promise<boolean>;
  cleanupCandidates(now: string, limit: number): Promise<CloudWorkspaceRecord[]>;
  reconciliationCandidates(limit: number): Promise<CloudWorkspaceRecord[]>;
}
const key = (owner: string, company: string, id: string) => `${owner}:${company}:${id}`;
export class InMemoryCloudWorkspaceStore implements CloudWorkspaceStore {
  readonly #items = new Map<string, CloudWorkspaceRecord>();
  create(raw: CloudWorkspaceRecord) {
    const value = CloudWorkspaceRecordSchema.parse(raw);
    const prior = structuredClone(
      [...this.#items.values()].find(
        (v) =>
          v.ownerId === value.ownerId &&
          v.companyId === value.companyId &&
          v.repositoryId === value.repositoryId,
      ),
    );
    if (prior) return Promise.resolve({ value: prior, inserted: false });
    this.#items.set(
      key(value.ownerId, value.companyId, value.id),
      structuredClone(value),
    );
    return Promise.resolve({ value, inserted: true });
  }
  find(owner: string, company: string, id: string) {
    return Promise.resolve(structuredClone(this.#items.get(key(owner, company, id))));
  }
  findByRepository(owner: string, company: string, repo: string) {
    return Promise.resolve(
      structuredClone(
        [...this.#items.values()].find(
          (v) =>
            v.ownerId === owner && v.companyId === company && v.repositoryId === repo,
        ),
      ),
    );
  }
  save(raw: CloudWorkspaceRecord, version: number) {
    const value = CloudWorkspaceRecordSchema.parse(raw);
    const id = key(value.ownerId, value.companyId, value.id);
    const prior = this.#items.get(id);
    if (
      !prior ||
      prior.version !== version ||
      value.version !== version + 1 ||
      prior.repositoryId !== value.repositoryId ||
      prior.registrationId !== value.registrationId
    )
      return Promise.resolve(false);
    this.#items.set(id, structuredClone(value));
    return Promise.resolve(true);
  }
  reconciliationCandidates(limit: number) {
    return Promise.resolve(
      [...this.#items.values()]
        .filter((v) => v.state !== "DESTROYED")
        .slice(0, Math.min(limit, 100))
        .map((v) => structuredClone(v)),
    );
  }
  cleanupCandidates(now: string, limit: number) {
    return Promise.resolve(
      [...this.#items.values()]
        .filter((v) => v.state !== "DESTROYED" && v.expiresAt <= now)
        .slice(0, Math.min(limit, 100))
        .map((v) => structuredClone(v)),
    );
  }
}
export class PostgresCloudWorkspaceStore implements CloudWorkspaceStore {
  constructor(readonly pool: Pool) {}
  async create(raw: CloudWorkspaceRecord) {
    const v = CloudWorkspaceRecordSchema.parse(raw);
    const result = await this.pool.query<{ record: unknown }>(
      `INSERT INTO engineering_cloud_workspaces(id,owner_id,company_id,repository_id,version,state,expires_at,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(owner_id,company_id,repository_id) DO NOTHING RETURNING record`,
      [
        v.id,
        v.ownerId,
        v.companyId,
        v.repositoryId,
        v.version,
        v.state,
        v.expiresAt,
        v,
      ],
    );
    return result.rows[0]
      ? {
          value: CloudWorkspaceRecordSchema.parse(result.rows[0].record),
          inserted: true,
        }
      : {
          value: (await this.findByRepository(v.ownerId, v.companyId, v.repositoryId))!,
          inserted: false,
        };
  }
  async find(owner: string, company: string, id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_cloud_workspaces WHERE owner_id=$1 AND company_id=$2 AND id=$3",
      [owner, company, id],
    );
    return result.rows[0]
      ? CloudWorkspaceRecordSchema.parse(result.rows[0].record)
      : undefined;
  }
  async findByRepository(owner: string, company: string, repo: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_cloud_workspaces WHERE owner_id=$1 AND company_id=$2 AND repository_id=$3",
      [owner, company, repo],
    );
    return result.rows[0]
      ? CloudWorkspaceRecordSchema.parse(result.rows[0].record)
      : undefined;
  }
  async save(raw: CloudWorkspaceRecord, version: number) {
    const v = CloudWorkspaceRecordSchema.parse(raw);
    if (v.version !== version + 1) return false;
    const result = await this.pool.query(
      `UPDATE engineering_cloud_workspaces SET version=$5,state=$6,expires_at=$7,record=$8 WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND version=$4 AND repository_id=$9 AND record->>'registrationId'=$10`,
      [
        v.ownerId,
        v.companyId,
        v.id,
        version,
        v.version,
        v.state,
        v.expiresAt,
        v,
        v.repositoryId,
        v.registrationId,
      ],
    );
    return result.rowCount === 1;
  }
  async reconciliationCandidates(limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_cloud_workspaces WHERE state <> 'DESTROYED' ORDER BY record->>'updatedAt' LIMIT $1",
      [Math.min(limit, 100)],
    );
    return result.rows.map((r) => CloudWorkspaceRecordSchema.parse(r.record));
  }
  async cleanupCandidates(now: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_cloud_workspaces WHERE state <> 'DESTROYED' AND expires_at <= $1 ORDER BY expires_at LIMIT $2",
      [now, Math.min(limit, 100)],
    );
    return result.rows.map((r) => CloudWorkspaceRecordSchema.parse(r.record));
  }
}
