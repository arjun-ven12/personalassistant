import {
  CrossDeviceClientInstanceSchema,
  CrossDeviceCommandSchema,
  type CrossDeviceClientInstance,
  type CrossDeviceCommand,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { Awaitable } from "../identity/store.js";

export interface CrossDeviceStore {
  saveClient(client: CrossDeviceClientInstance): Awaitable<void>;
  getClient(id: string): Awaitable<CrossDeviceClientInstance | undefined>;
  listClients(ownerId: string): Awaitable<CrossDeviceClientInstance[]>;
  createCommand(command: CrossDeviceCommand): Awaitable<CrossDeviceCommand>;
  saveCommand(command: CrossDeviceCommand): Awaitable<void>;
  getCommand(id: string): Awaitable<CrossDeviceCommand | undefined>;
  findIdempotentCommand(
    ownerId: string,
    sourceClientInstanceId: string,
    idempotencyKey: string,
  ): Awaitable<CrossDeviceCommand | undefined>;
  listSourceCommands(ownerId: string, sourceClientInstanceId: string, limit: number): Awaitable<CrossDeviceCommand[]>;
  listTargetCommands(ownerId: string, targetId: string, limit: number): Awaitable<CrossDeviceCommand[]>;
  findConversationTarget(ownerId: string, conversationId: string): Awaitable<CrossDeviceCommand | undefined>;
}

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryCrossDeviceStore implements CrossDeviceStore {
  readonly #clients = new Map<string, CrossDeviceClientInstance>();
  readonly #commands = new Map<string, CrossDeviceCommand>();

  saveClient(client: CrossDeviceClientInstance) {
    this.#clients.set(client.id, clone(CrossDeviceClientInstanceSchema.parse(client)));
  }

  getClient(id: string) {
    const value = this.#clients.get(id);
    return value ? clone(value) : undefined;
  }

  listClients(ownerId: string) {
    return [...this.#clients.values()]
      .filter((item) => item.ownerId === ownerId)
      .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
      .map(clone);
  }

  saveCommand(command: CrossDeviceCommand) {
    this.#commands.set(command.id, clone(CrossDeviceCommandSchema.parse(command)));
  }

  createCommand(command: CrossDeviceCommand) {
    const parsed = CrossDeviceCommandSchema.parse(command);
    const existing = [...this.#commands.values()].find(
      (item) =>
        item.ownerId === parsed.ownerId &&
        item.sourceClientInstanceId === parsed.sourceClientInstanceId &&
        item.idempotencyKey === parsed.idempotencyKey,
    );
    if (existing) return clone(existing);
    this.#commands.set(parsed.id, clone(parsed));
    return clone(parsed);
  }

  getCommand(id: string) {
    const value = this.#commands.get(id);
    return value ? clone(value) : undefined;
  }

  findIdempotentCommand(ownerId: string, sourceClientInstanceId: string, idempotencyKey: string) {
    const value = [...this.#commands.values()].find(
      (item) =>
        item.ownerId === ownerId &&
        item.sourceClientInstanceId === sourceClientInstanceId &&
        item.idempotencyKey === idempotencyKey,
    );
    return value ? clone(value) : undefined;
  }

  listSourceCommands(ownerId: string, sourceClientInstanceId: string, limit: number) {
    return [...this.#commands.values()]
      .filter((item) => item.ownerId === ownerId && item.sourceClientInstanceId === sourceClientInstanceId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map(clone);
  }

  listTargetCommands(ownerId: string, targetId: string, limit: number) {
    return [...this.#commands.values()]
      .filter((item) => item.ownerId === ownerId && item.targetId === targetId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit)
      .map(clone);
  }

  findConversationTarget(ownerId: string, conversationId: string) {
    const value = [...this.#commands.values()]
      .filter(
        (item) =>
          item.ownerId === ownerId &&
          item.conversationId === conversationId &&
          item.targetId !== null &&
          !["REJECTED", "TARGET_OFFLINE", "EXPIRED", "CANCELLED"].includes(item.status),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    return value ? clone(value) : undefined;
  }
}

export class PostgresCrossDeviceStore implements CrossDeviceStore {
  constructor(readonly pool: Pool) {}

  async saveClient(client: CrossDeviceClientInstance) {
    const parsed = CrossDeviceClientInstanceSchema.parse(client);
    await this.pool.query(
      `INSERT INTO cross_device_clients(id,owner_id,session_id,client_type,record,lease_expires_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(id) DO UPDATE SET owner_id=EXCLUDED.owner_id,session_id=EXCLUDED.session_id,
       client_type=EXCLUDED.client_type,record=EXCLUDED.record,
       lease_expires_at=EXCLUDED.lease_expires_at,updated_at=EXCLUDED.updated_at`,
      [parsed.id, parsed.ownerId, parsed.sessionId, parsed.clientType, parsed, parsed.leaseExpiresAt, parsed.lastSeenAt],
    );
  }

  async getClient(id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM cross_device_clients WHERE id=$1",
      [id],
    );
    return result.rows[0] ? CrossDeviceClientInstanceSchema.parse(result.rows[0].record) : undefined;
  }

  async listClients(ownerId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM cross_device_clients WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 100",
      [ownerId],
    );
    return result.rows.map((row) => CrossDeviceClientInstanceSchema.parse(row.record));
  }

  async saveCommand(command: CrossDeviceCommand) {
    const parsed = CrossDeviceCommandSchema.parse(command);
    await this.pool.query(
      `INSERT INTO cross_device_commands
       (id,owner_id,source_client_instance_id,target_id,status,idempotency_key,record,created_at,updated_at,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(id) DO UPDATE SET target_id=EXCLUDED.target_id,status=EXCLUDED.status,
       record=EXCLUDED.record,updated_at=EXCLUDED.updated_at,expires_at=EXCLUDED.expires_at`,
      [parsed.id, parsed.ownerId, parsed.sourceClientInstanceId, parsed.targetId, parsed.status, parsed.idempotencyKey, parsed, parsed.createdAt, parsed.updatedAt, parsed.expiresAt],
    );
  }

  async createCommand(command: CrossDeviceCommand) {
    const parsed = CrossDeviceCommandSchema.parse(command);
    const inserted = await this.pool.query<{ record: unknown }>(
      `INSERT INTO cross_device_commands
       (id,owner_id,source_client_instance_id,target_id,status,idempotency_key,record,created_at,updated_at,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(owner_id,source_client_instance_id,idempotency_key) DO NOTHING
       RETURNING record`,
      [parsed.id, parsed.ownerId, parsed.sourceClientInstanceId, parsed.targetId, parsed.status, parsed.idempotencyKey, parsed, parsed.createdAt, parsed.updatedAt, parsed.expiresAt],
    );
    if (inserted.rows[0]) return CrossDeviceCommandSchema.parse(inserted.rows[0].record);
    const existing = await this.findIdempotentCommand(
      parsed.ownerId,
      parsed.sourceClientInstanceId,
      parsed.idempotencyKey,
    );
    if (!existing) throw new Error("Idempotent cross-device command was not persisted.");
    return existing;
  }

  async getCommand(id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM cross_device_commands WHERE id=$1",
      [id],
    );
    return result.rows[0] ? CrossDeviceCommandSchema.parse(result.rows[0].record) : undefined;
  }

  async findIdempotentCommand(ownerId: string, sourceClientInstanceId: string, idempotencyKey: string) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM cross_device_commands
       WHERE owner_id=$1 AND source_client_instance_id=$2 AND idempotency_key=$3 LIMIT 1`,
      [ownerId, sourceClientInstanceId, idempotencyKey],
    );
    return result.rows[0] ? CrossDeviceCommandSchema.parse(result.rows[0].record) : undefined;
  }

  async listSourceCommands(ownerId: string, sourceClientInstanceId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM cross_device_commands
       WHERE owner_id=$1 AND source_client_instance_id=$2 ORDER BY created_at DESC LIMIT $3`,
      [ownerId, sourceClientInstanceId, limit],
    );
    return result.rows.map((row) => CrossDeviceCommandSchema.parse(row.record));
  }

  async listTargetCommands(ownerId: string, targetId: string, limit: number) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM cross_device_commands
       WHERE owner_id=$1 AND target_id=$2 ORDER BY created_at ASC LIMIT $3`,
      [ownerId, targetId, limit],
    );
    return result.rows.map((row) => CrossDeviceCommandSchema.parse(row.record));
  }

  async findConversationTarget(ownerId: string, conversationId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM cross_device_commands
       WHERE owner_id=$1 AND record->>'conversationId'=$2 AND target_id IS NOT NULL
       AND status NOT IN ('REJECTED','TARGET_OFFLINE','EXPIRED','CANCELLED')
       ORDER BY updated_at DESC LIMIT 1`,
      [ownerId, conversationId],
    );
    return result.rows[0] ? CrossDeviceCommandSchema.parse(result.rows[0].record) : undefined;
  }
}
