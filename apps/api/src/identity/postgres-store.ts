import type { User } from "@alexa-control/shared";
import type pg from "pg";

import type { IdentityStore } from "./store.js";
import type {
  CreateAuditRecord,
  PairingIntent,
  StoredAuditRecord,
  StoredDevice,
  StoredSession,
} from "./types.js";
import { companyScope } from "../companies/scope.js";

const record = <T>(row: { record: T } | undefined) =>
  row ? structuredClone(row.record) : undefined;

export class PostgresIdentityStore implements IdentityStore {
  constructor(private readonly pool: pg.Pool) {}

  async countUsers() {
    const result = await this.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM owners",
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async createUser(user: User) {
    await this.pool.query(
      `INSERT INTO owners(id, email, password_hash, record, created_at, updated_at)
       VALUES ($1, lower($2), $3, $4, $5, $6)`,
      [user.id, user.email, user.passwordHash, user, user.createdAt, user.updatedAt],
    );
  }

  async findUserByEmail(email: string) {
    const result = await this.pool.query<{ record: User }>(
      "SELECT record FROM owners WHERE email = lower($1)",
      [email],
    );
    return record(result.rows[0]);
  }

  async findUserById(id: string) {
    const result = await this.pool.query<{ record: User }>(
      "SELECT record FROM owners WHERE id = $1",
      [id],
    );
    return record(result.rows[0]);
  }

  async updateUser(user: User) {
    const result = await this.pool.query(
      `UPDATE owners SET email = lower($2), password_hash = $3, record = $4,
       updated_at = $5 WHERE id = $1`,
      [user.id, user.email, user.passwordHash, user, user.updatedAt],
    );
    if (result.rowCount !== 1) throw new Error("User does not exist.");
  }

  async createSession(session: StoredSession) {
    await this.pool.query(
      `INSERT INTO sessions(
        id, owner_id, token_hash, record, created_at, last_seen_at,
        idle_expires_at, absolute_expires_at, revoked_at, active_company_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        session.id,
        session.userId,
        session.tokenHash,
        session,
        session.createdAt,
        session.lastSeenAt,
        session.idleExpiresAt,
        session.absoluteExpiresAt,
        session.revokedAt,
        session.activeCompanyId ?? null,
      ],
    );
  }

  async findSessionByTokenHash(tokenHash: string) {
    const result = await this.pool.query<{ record: StoredSession }>(
      "SELECT record FROM sessions WHERE token_hash = $1",
      [tokenHash],
    );
    return record(result.rows[0]);
  }

  async findSessionById(id: string) {
    const result = await this.pool.query<{ record: StoredSession }>(
      "SELECT record FROM sessions WHERE id = $1",
      [id],
    );
    return record(result.rows[0]);
  }

  async listSessions(userId: string) {
    const result = await this.pool.query<{ record: StoredSession }>(
      "SELECT record FROM sessions WHERE owner_id = $1 ORDER BY created_at DESC",
      [userId],
    );
    return result.rows.map((row) => structuredClone(row.record));
  }

  async updateSession(session: StoredSession) {
    const result = await this.pool.query(
      `UPDATE sessions SET record=$2, last_seen_at=$3, idle_expires_at=$4,
       absolute_expires_at=$5, revoked_at=$6, active_company_id=$7, version=version+1 WHERE id=$1`,
      [
        session.id,
        session,
        session.lastSeenAt,
        session.idleExpiresAt,
        session.absoluteExpiresAt,
        session.revokedAt,
        session.activeCompanyId ?? null,
      ],
    );
    if (result.rowCount !== 1) throw new Error("Session does not exist.");
  }

  async createPairingIntent(intent: PairingIntent) {
    await this.pool.query(
      `INSERT INTO pairing_intents(id,owner_id,code_hash,record,expires_at,used_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        intent.id,
        intent.ownerId,
        intent.codeHash,
        intent,
        intent.expiresAt,
        intent.usedAt,
      ],
    );
  }

  async consumePairingIntent(codeHash: string, now: Date) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<{ record: PairingIntent }>(
        `SELECT record FROM pairing_intents
         WHERE code_hash=$1 AND used_at IS NULL AND expires_at>$2 FOR UPDATE`,
        [codeHash, now.toISOString()],
      );
      const intent = record(selected.rows[0]);
      if (!intent) {
        await client.query("ROLLBACK");
        return undefined;
      }
      const consumed = { ...intent, usedAt: now.toISOString() };
      await client.query(
        "UPDATE pairing_intents SET record=$2, used_at=$3 WHERE id=$1",
        [intent.id, consumed, consumed.usedAt],
      );
      await client.query("COMMIT");
      return consumed;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createDevice(device: StoredDevice) {
    await this.pool.query(
      `INSERT INTO devices(
        id,owner_id,pairing_polling_token_hash,fingerprint,trust_status,record,created_at,revoked_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        device.id,
        device.ownerId,
        device.pairingRequestTokenHash,
        device.fingerprint,
        device.trustStatus,
        device,
        device.createdAt,
        device.revokedAt,
      ],
    );
  }

  async findDeviceById(id: string) {
    const result = await this.pool.query<{ record: StoredDevice }>(
      "SELECT record FROM devices WHERE id=$1",
      [id],
    );
    return record(result.rows[0]);
  }

  async listDevices(ownerId: string) {
    const result = await this.pool.query<{ record: StoredDevice }>(
      "SELECT record FROM devices WHERE owner_id=$1 ORDER BY created_at DESC",
      [ownerId],
    );
    return result.rows.map((row) => structuredClone(row.record));
  }

  async updateDevice(device: StoredDevice) {
    const result = await this.pool.query(
      `UPDATE devices SET trust_status=$2, record=$3, revoked_at=$4,
       version=version+1 WHERE id=$1`,
      [device.id, device.trustStatus, device, device.revokedAt],
    );
    if (result.rowCount !== 1) throw new Error("Device does not exist.");
  }

  async consumeNonce(deviceId: string, nonce: string, expiresAt: Date, now: Date) {
    await this.pool.query("DELETE FROM used_nonces WHERE expires_at <= $1", [
      now.toISOString(),
    ]);
    const result = await this.pool.query(
      `INSERT INTO used_nonces(device_id,nonce,expires_at) VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING`,
      [deviceId, nonce, expiresAt.toISOString()],
    );
    return result.rowCount === 1;
  }

  async appendAudit(input: CreateAuditRecord) {
    const stored: StoredAuditRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      userId: input.userId ?? null,
      companyId: input.companyId ?? null,
      deviceId: input.deviceId ?? null,
      ...input,
    };
    await this.pool.query(
      `INSERT INTO audit_events(
        id,owner_id,company_id,device_id,event_type,outcome,request_id,occurred_at,record
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        stored.id,
        stored.userId,
        stored.companyId,
        stored.deviceId,
        stored.eventType,
        stored.outcome,
        stored.requestId,
        stored.timestamp,
        stored,
      ],
    );
    return stored;
  }

  async listAudit(userId: string, limit: number) {
    const result = await this.pool.query<{ record: StoredAuditRecord }>(
      `SELECT record FROM audit_events WHERE owner_id=$1
       AND ($3::uuid IS NULL OR company_id=$3)
       ORDER BY occurred_at DESC LIMIT $2`,
      [userId, limit, companyScope.companyId(userId) ?? null],
    );
    return result.rows.map((row) => structuredClone(row.record));
  }
}
