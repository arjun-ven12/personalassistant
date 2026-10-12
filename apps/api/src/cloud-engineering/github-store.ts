import type { Awaitable } from "../identity/store.js";
import {
  EngineeringGitHubRegistrationSchema,
  type EngineeringGitHubRegistration,
} from "@alexa-control/shared";
import type { Pool } from "pg";

export interface EngineeringGitHubStore {
  findByProviderId(
    ownerId: string,
    companyId: string,
    providerRepositoryId: number,
  ): Awaitable<EngineeringGitHubRegistration | undefined>;
  list(ownerId: string, companyId: string): Awaitable<EngineeringGitHubRegistration[]>;
  create(
    value: EngineeringGitHubRegistration,
  ): Awaitable<EngineeringGitHubRegistration>;
  save(value: EngineeringGitHubRegistration): Awaitable<void>;
  claimCreation(input: {
    ownerId: string;
    companyId: string;
    idempotencyKey: string;
    requestDigest: string;
    createdAt: string;
  }): Awaitable<{
    status: "CLAIMED" | "COMPLETE" | "UNCERTAIN";
    requestDigest: string;
    registrationId: string | null;
  }>;
  completeCreation(input: {
    ownerId: string;
    companyId: string;
    idempotencyKey: string;
    registrationId: string;
  }): Awaitable<void>;
  findCreation(
    ownerId: string,
    companyId: string,
    idempotencyKey: string,
  ): Awaitable<
    | {
        status: "COMPLETE" | "UNCERTAIN";
        requestDigest: string;
        registrationId: string | null;
      }
    | undefined
  >;
}

const key = (ownerId: string, companyId: string, id: number) =>
  `${ownerId}:${companyId}:${id}`;

export class InMemoryEngineeringGitHubStore implements EngineeringGitHubStore {
  readonly #items = new Map<string, EngineeringGitHubRegistration>();
  readonly #creations = new Map<
    string,
    {
      status: "COMPLETE" | "UNCERTAIN";
      requestDigest: string;
      registrationId: string | null;
    }
  >();
  findByProviderId(ownerId: string, companyId: string, providerRepositoryId: number) {
    const found = this.#items.get(key(ownerId, companyId, providerRepositoryId));
    return found ? structuredClone(found) : undefined;
  }
  list(ownerId: string, companyId: string) {
    return [...this.#items.values()]
      .filter((value) => value.ownerId === ownerId && value.companyId === companyId)
      .map((value) => structuredClone(value));
  }
  create(value: EngineeringGitHubRegistration) {
    const parsed = EngineeringGitHubRegistrationSchema.parse(value);
    const existing = this.findByProviderId(
      parsed.ownerId,
      parsed.companyId,
      parsed.repository.providerRepositoryId,
    );
    if (existing) return existing;
    this.#items.set(
      key(parsed.ownerId, parsed.companyId, parsed.repository.providerRepositoryId),
      structuredClone(parsed),
    );
    return parsed;
  }
  save(value: EngineeringGitHubRegistration) {
    const parsed = EngineeringGitHubRegistrationSchema.parse(value);
    if (
      !this.findByProviderId(
        parsed.ownerId,
        parsed.companyId,
        parsed.repository.providerRepositoryId,
      )
    )
      throw Error("GitHub registration does not exist.");
    this.#items.set(
      key(parsed.ownerId, parsed.companyId, parsed.repository.providerRepositoryId),
      structuredClone(parsed),
    );
  }
  claimCreation(input: {
    ownerId: string;
    companyId: string;
    idempotencyKey: string;
    requestDigest: string;
  }) {
    const locator = `${input.ownerId}:${input.companyId}:${input.idempotencyKey}`;
    const existing = this.#creations.get(locator);
    if (existing) return { ...existing };
    this.#creations.set(locator, {
      status: "UNCERTAIN",
      requestDigest: input.requestDigest,
      registrationId: null,
    });
    return {
      status: "CLAIMED" as const,
      requestDigest: input.requestDigest,
      registrationId: null,
    };
  }
  completeCreation(input: {
    ownerId: string;
    companyId: string;
    idempotencyKey: string;
    registrationId: string;
  }) {
    const locator = `${input.ownerId}:${input.companyId}:${input.idempotencyKey}`;
    const existing = this.#creations.get(locator);
    if (!existing || existing.status !== "UNCERTAIN")
      throw Error("GitHub creation claim is missing.");
    this.#creations.set(locator, {
      ...existing,
      status: "COMPLETE",
      registrationId: input.registrationId,
    });
  }
  findCreation(ownerId: string, companyId: string, idempotencyKey: string) {
    const value = this.#creations.get(`${ownerId}:${companyId}:${idempotencyKey}`);
    return value ? { ...value } : undefined;
  }
}

export class PostgresEngineeringGitHubStore implements EngineeringGitHubStore {
  constructor(readonly pool: Pool) {}
  async findByProviderId(
    ownerId: string,
    companyId: string,
    providerRepositoryId: number,
  ) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_github_repositories WHERE owner_id=$1 AND company_id=$2 AND provider_repository_id=$3",
      [ownerId, companyId, providerRepositoryId],
    );
    return result.rows[0]
      ? EngineeringGitHubRegistrationSchema.parse(result.rows[0].record)
      : undefined;
  }
  async list(ownerId: string, companyId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM engineering_github_repositories WHERE owner_id=$1 AND company_id=$2 ORDER BY updated_at DESC",
      [ownerId, companyId],
    );
    return result.rows.map((row) =>
      EngineeringGitHubRegistrationSchema.parse(row.record),
    );
  }
  async create(value: EngineeringGitHubRegistration) {
    const item = EngineeringGitHubRegistrationSchema.parse(value);
    const result = await this.pool.query<{ record: unknown }>(
      `INSERT INTO engineering_github_repositories(id,owner_id,company_id,provider_repository_id,credential_reference_id,status,created_at,updated_at,record)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(owner_id,company_id,provider_repository_id) DO UPDATE SET provider_repository_id=EXCLUDED.provider_repository_id
       RETURNING record`,
      [
        item.id,
        item.ownerId,
        item.companyId,
        item.repository.providerRepositoryId,
        item.credentialReferenceId,
        item.status,
        item.createdAt,
        item.updatedAt,
        item,
      ],
    );
    return EngineeringGitHubRegistrationSchema.parse(result.rows[0]!.record);
  }
  async save(value: EngineeringGitHubRegistration) {
    const item = EngineeringGitHubRegistrationSchema.parse(value);
    const result = await this.pool.query(
      `UPDATE engineering_github_repositories SET status=$5,updated_at=$6,record=$7
       WHERE owner_id=$1 AND company_id=$2 AND id=$3 AND provider_repository_id=$4`,
      [
        item.ownerId,
        item.companyId,
        item.id,
        item.repository.providerRepositoryId,
        item.status,
        item.updatedAt,
        item,
      ],
    );
    if (result.rowCount !== 1) throw Error("GitHub registration does not exist.");
  }
  async claimCreation(input: {
    ownerId: string;
    companyId: string;
    idempotencyKey: string;
    requestDigest: string;
    createdAt: string;
  }) {
    const result = await this.pool.query<{
      request_digest: string;
      status: "UNCERTAIN" | "COMPLETE";
      registration_id: string | null;
      inserted: boolean;
    }>(
      `INSERT INTO engineering_github_creations(owner_id,company_id,idempotency_key,request_digest,status,registration_id,created_at)
       VALUES($1,$2,$3,$4,'UNCERTAIN',NULL,$5)
       ON CONFLICT(owner_id,company_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
       RETURNING request_digest,status,registration_id,(xmax = 0) AS inserted`,
      [
        input.ownerId,
        input.companyId,
        input.idempotencyKey,
        input.requestDigest,
        input.createdAt,
      ],
    );
    const row = result.rows[0]!;
    return {
      status: row.inserted ? ("CLAIMED" as const) : row.status,
      requestDigest: row.request_digest,
      registrationId: row.registration_id,
    };
  }
  async completeCreation(input: {
    ownerId: string;
    companyId: string;
    idempotencyKey: string;
    registrationId: string;
  }) {
    const result = await this.pool.query(
      `UPDATE engineering_github_creations SET status='COMPLETE',registration_id=$4
       WHERE owner_id=$1 AND company_id=$2 AND idempotency_key=$3 AND status='UNCERTAIN'`,
      [input.ownerId, input.companyId, input.idempotencyKey, input.registrationId],
    );
    if (result.rowCount !== 1) throw Error("GitHub creation claim is missing.");
  }
  async findCreation(ownerId: string, companyId: string, idempotencyKey: string) {
    const result = await this.pool.query<{
      status: "COMPLETE" | "UNCERTAIN";
      request_digest: string;
      registration_id: string | null;
    }>(
      "SELECT status,request_digest,registration_id FROM engineering_github_creations WHERE owner_id=$1 AND company_id=$2 AND idempotency_key=$3",
      [ownerId, companyId, idempotencyKey],
    );
    const row = result.rows[0];
    return row
      ? {
          status: row.status,
          requestDigest: row.request_digest,
          registrationId: row.registration_id,
        }
      : undefined;
  }
}
