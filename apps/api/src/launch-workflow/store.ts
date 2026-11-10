import { LaunchPackageSchema, type LaunchPackage } from "@alexa-control/shared";
import type { Pool } from "pg";

export interface LaunchPackageStore {
  find(
    ownerId: string,
    companyId: string,
    id: string,
  ): Promise<LaunchPackage | undefined>;
  findByObjective(
    ownerId: string,
    companyId: string,
    objectiveId: string,
  ): Promise<LaunchPackage | undefined>;
  findVersion(
    ownerId: string,
    companyId: string,
    id: string,
    version: number,
  ): Promise<LaunchPackage | undefined>;
  create(value: LaunchPackage): Promise<boolean>;
  update(value: LaunchPackage, expectedVersion: number): Promise<boolean>;
}

export class InMemoryLaunchPackageStore implements LaunchPackageStore {
  readonly #items = new Map<string, LaunchPackage>();
  readonly #versions = new Map<string, LaunchPackage>();
  private key(ownerId: string, companyId: string, objectiveId: string) {
    return `${ownerId}:${companyId}:${objectiveId}`;
  }
  find(ownerId: string, companyId: string, id: string) {
    const item = [...this.#items.values()].find(
      (value) =>
        value.ownerId === ownerId && value.companyId === companyId && value.id === id,
    );
    return Promise.resolve(item ? structuredClone(item) : undefined);
  }
  findByObjective(ownerId: string, companyId: string, objectiveId: string) {
    const item = this.#items.get(this.key(ownerId, companyId, objectiveId));
    return Promise.resolve(item ? structuredClone(item) : undefined);
  }
  findVersion(ownerId: string, companyId: string, id: string, version: number) {
    const item = this.#versions.get(`${ownerId}:${companyId}:${id}:${version}`);
    return Promise.resolve(item ? structuredClone(item) : undefined);
  }
  create(value: LaunchPackage) {
    const item = LaunchPackageSchema.parse(value),
      key = this.key(item.ownerId, item.companyId, item.objectiveId);
    if (this.#items.has(key)) return Promise.resolve(false);
    this.#items.set(key, structuredClone(item));
    this.#versions.set(
      `${item.ownerId}:${item.companyId}:${item.id}:${item.version}`,
      structuredClone(item),
    );
    return Promise.resolve(true);
  }
  update(value: LaunchPackage, expectedVersion: number) {
    const item = LaunchPackageSchema.parse(value),
      key = this.key(item.ownerId, item.companyId, item.objectiveId),
      current = this.#items.get(key);
    if (
      !current ||
      current.id !== item.id ||
      current.version !== expectedVersion ||
      item.version !== expectedVersion + 1
    )
      return Promise.resolve(false);
    this.#items.set(key, structuredClone(item));
    this.#versions.set(
      `${item.ownerId}:${item.companyId}:${item.id}:${item.version}`,
      structuredClone(item),
    );
    return Promise.resolve(true);
  }
}

export class PostgresLaunchPackageStore implements LaunchPackageStore {
  constructor(readonly pool: Pool) {}
  async find(ownerId: string, companyId: string, id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM launch_review_packages WHERE owner_id=$1 AND company_id=$2 AND id=$3",
      [ownerId, companyId, id],
    );
    return result.rows[0]
      ? LaunchPackageSchema.parse(result.rows[0].record)
      : undefined;
  }
  async findByObjective(ownerId: string, companyId: string, objectiveId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM launch_review_packages WHERE owner_id=$1 AND company_id=$2 AND objective_id=$3",
      [ownerId, companyId, objectiveId],
    );
    return result.rows[0]
      ? LaunchPackageSchema.parse(result.rows[0].record)
      : undefined;
  }
  async findVersion(ownerId: string, companyId: string, id: string, version: number) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM launch_review_package_versions WHERE owner_id=$1 AND company_id=$2 AND package_id=$3 AND version=$4",
      [ownerId, companyId, id, version],
    );
    return result.rows[0]
      ? LaunchPackageSchema.parse(result.rows[0].record)
      : undefined;
  }
  async create(value: LaunchPackage) {
    const item = LaunchPackageSchema.parse(value);
    const result = await this.pool.query(
      "WITH inserted AS (INSERT INTO launch_review_packages(id,owner_id,company_id,objective_id,version,status,record,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING owner_id,company_id,id,version,record) INSERT INTO launch_review_package_versions(owner_id,company_id,package_id,version,record) SELECT owner_id,company_id,id,version,record FROM inserted RETURNING version",
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.objectiveId,
        item.version,
        item.status,
        item,
        item.createdAt,
        item.updatedAt,
      ],
    );
    return result.rowCount === 1;
  }
  async update(value: LaunchPackage, expectedVersion: number) {
    const item = LaunchPackageSchema.parse(value);
    if (item.version !== expectedVersion + 1) return false;
    const result = await this.pool.query(
      "WITH updated AS (UPDATE launch_review_packages SET version=$5,status=$6,record=$7,updated_at=$8 WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND version=$4 RETURNING owner_id,company_id,id,version,record) INSERT INTO launch_review_package_versions(owner_id,company_id,package_id,version,record) SELECT owner_id,company_id,id,version,record FROM updated RETURNING version",
      [
        item.ownerId,
        item.companyId,
        item.id,
        expectedVersion,
        item.version,
        item.status,
        item,
        item.updatedAt,
      ],
    );
    return result.rowCount === 1;
  }
}
