import type { RecentAuthPurpose } from "@alexa-control/shared";
import type pg from "pg";

import type { Awaitable } from "../identity/store.js";

export interface StoredCsrfToken {
  sessionId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface StoredRecentAuthChallenge {
  id: string;
  ownerId: string;
  sessionId: string;
  tokenHash: string;
  purpose: RecentAuthPurpose;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface StoredRecentAuthGrant {
  id: string;
  ownerId: string;
  sessionId: string;
  purpose: RecentAuthPurpose;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
}

export interface StoredRecoveryCode {
  id: string;
  ownerId: string;
  codeHash: string;
  generatedAt: string;
  consumedAt: string | null;
  invalidatedAt: string | null;
}

export interface SecurityStateStore {
  putCsrfToken(token: StoredCsrfToken): Awaitable<void>;
  findCsrfToken(sessionId: string): Awaitable<StoredCsrfToken | undefined>;
  deleteCsrfToken(sessionId: string): Awaitable<void>;
  createRecentAuthChallenge(challenge: StoredRecentAuthChallenge): Awaitable<void>;
  findRecentAuthChallenge(id: string): Awaitable<StoredRecentAuthChallenge | undefined>;
  updateRecentAuthChallenge(challenge: StoredRecentAuthChallenge): Awaitable<void>;
  createRecentAuthGrant(grant: StoredRecentAuthGrant): Awaitable<void>;
  findRecentAuthGrant(
    ownerId: string,
    sessionId: string,
    purpose: RecentAuthPurpose,
    now: Date,
  ): Awaitable<StoredRecentAuthGrant | undefined>;
  updateRecentAuthGrant(grant: StoredRecentAuthGrant): Awaitable<void>;
  consumeRecentAuthGrant(id: string, at: string): Awaitable<boolean>;
  revokeSessionSecurity(sessionId: string, at: string): Awaitable<void>;
  createRecoveryCodes(codes: StoredRecoveryCode[]): Awaitable<void>;
  listRecoveryCodes(ownerId: string): Awaitable<StoredRecoveryCode[]>;
  invalidateRecoveryCodes(ownerId: string, at: string): Awaitable<number>;
  updateRecoveryCode(code: StoredRecoveryCode): Awaitable<void>;
  consumeRecoveryCode(id: string, at: string): Awaitable<boolean>;
}

export class InMemorySecurityStateStore implements SecurityStateStore {
  readonly #csrf = new Map<string, StoredCsrfToken>();
  readonly #challenges = new Map<string, StoredRecentAuthChallenge>();
  readonly #grants = new Map<string, StoredRecentAuthGrant>();
  readonly #recovery = new Map<string, StoredRecoveryCode>();

  putCsrfToken(token: StoredCsrfToken) {
    this.#csrf.set(token.sessionId, structuredClone(token));
  }
  findCsrfToken(sessionId: string) {
    const value = this.#csrf.get(sessionId);
    return value ? structuredClone(value) : undefined;
  }
  deleteCsrfToken(sessionId: string) {
    this.#csrf.delete(sessionId);
  }
  createRecentAuthChallenge(challenge: StoredRecentAuthChallenge) {
    this.#challenges.set(challenge.id, structuredClone(challenge));
  }
  findRecentAuthChallenge(id: string) {
    const value = this.#challenges.get(id);
    return value ? structuredClone(value) : undefined;
  }
  updateRecentAuthChallenge(challenge: StoredRecentAuthChallenge) {
    this.#challenges.set(challenge.id, structuredClone(challenge));
  }
  createRecentAuthGrant(grant: StoredRecentAuthGrant) {
    this.#grants.set(grant.id, structuredClone(grant));
  }
  findRecentAuthGrant(
    ownerId: string,
    sessionId: string,
    purpose: RecentAuthPurpose,
    now: Date,
  ) {
    const value = [...this.#grants.values()]
      .filter(
        (grant) =>
          grant.ownerId === ownerId &&
          grant.sessionId === sessionId &&
          grant.purpose === purpose &&
          grant.consumedAt === null &&
          grant.revokedAt === null &&
          new Date(grant.expiresAt).getTime() > now.getTime(),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    return value ? structuredClone(value) : undefined;
  }
  updateRecentAuthGrant(grant: StoredRecentAuthGrant) {
    this.#grants.set(grant.id, structuredClone(grant));
  }
  consumeRecentAuthGrant(id: string, at: string) {
    const grant = this.#grants.get(id);
    if (
      !grant ||
      grant.consumedAt !== null ||
      grant.revokedAt !== null ||
      new Date(grant.expiresAt).getTime() <= new Date(at).getTime()
    ) {
      return false;
    }
    this.#grants.set(id, { ...grant, consumedAt: at });
    return true;
  }
  revokeSessionSecurity(sessionId: string, at: string) {
    this.#csrf.delete(sessionId);
    for (const [id, grant] of this.#grants) {
      if (grant.sessionId === sessionId && grant.revokedAt === null) {
        this.#grants.set(id, { ...grant, revokedAt: at });
      }
    }
  }
  createRecoveryCodes(codes: StoredRecoveryCode[]) {
    for (const code of codes) this.#recovery.set(code.id, structuredClone(code));
  }
  listRecoveryCodes(ownerId: string) {
    return [...this.#recovery.values()]
      .filter((code) => code.ownerId === ownerId)
      .map((code) => structuredClone(code));
  }
  invalidateRecoveryCodes(ownerId: string, at: string) {
    let count = 0;
    for (const [id, code] of this.#recovery) {
      if (
        code.ownerId === ownerId &&
        code.consumedAt === null &&
        code.invalidatedAt === null
      ) {
        this.#recovery.set(id, { ...code, invalidatedAt: at });
        count += 1;
      }
    }
    return count;
  }
  updateRecoveryCode(code: StoredRecoveryCode) {
    this.#recovery.set(code.id, structuredClone(code));
  }
  consumeRecoveryCode(id: string, at: string) {
    const code = this.#recovery.get(id);
    if (!code || code.consumedAt !== null || code.invalidatedAt !== null) return false;
    this.#recovery.set(id, { ...code, consumedAt: at });
    return true;
  }
}

export class PostgresSecurityStateStore implements SecurityStateStore {
  constructor(private readonly pool: pg.Pool) {}

  async putCsrfToken(token: StoredCsrfToken) {
    await this.pool.query(
      `INSERT INTO csrf_tokens(session_id,token_hash,created_at,expires_at)
       VALUES ($1,$2,$3,$4) ON CONFLICT(session_id) DO UPDATE SET
       token_hash=excluded.token_hash,created_at=excluded.created_at,expires_at=excluded.expires_at`,
      [token.sessionId, token.tokenHash, token.createdAt, token.expiresAt],
    );
  }
  async findCsrfToken(sessionId: string) {
    const result = await this.pool.query<{
      session_id: string;
      token_hash: string;
      created_at: Date;
      expires_at: Date;
    }>("SELECT * FROM csrf_tokens WHERE session_id=$1", [sessionId]);
    const row = result.rows[0];
    return row
      ? {
          sessionId: row.session_id,
          tokenHash: row.token_hash,
          createdAt: row.created_at.toISOString(),
          expiresAt: row.expires_at.toISOString(),
        }
      : undefined;
  }
  async deleteCsrfToken(sessionId: string) {
    await this.pool.query("DELETE FROM csrf_tokens WHERE session_id=$1", [sessionId]);
  }
  async createRecentAuthChallenge(challenge: StoredRecentAuthChallenge) {
    await this.pool.query(
      `INSERT INTO recent_auth_challenges(
        id,owner_id,session_id,token_hash,purpose,created_at,expires_at,used_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        challenge.id,
        challenge.ownerId,
        challenge.sessionId,
        challenge.tokenHash,
        challenge.purpose,
        challenge.createdAt,
        challenge.expiresAt,
        challenge.usedAt,
      ],
    );
  }
  async findRecentAuthChallenge(id: string) {
    const result = await this.pool.query<{
      id: string;
      owner_id: string;
      session_id: string;
      token_hash: string;
      purpose: RecentAuthPurpose;
      created_at: Date;
      expires_at: Date;
      used_at: Date | null;
    }>("SELECT * FROM recent_auth_challenges WHERE id=$1", [id]);
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          ownerId: row.owner_id,
          sessionId: row.session_id,
          tokenHash: row.token_hash,
          purpose: row.purpose,
          createdAt: row.created_at.toISOString(),
          expiresAt: row.expires_at.toISOString(),
          usedAt: row.used_at?.toISOString() ?? null,
        }
      : undefined;
  }
  async updateRecentAuthChallenge(challenge: StoredRecentAuthChallenge) {
    await this.pool.query("UPDATE recent_auth_challenges SET used_at=$2 WHERE id=$1", [
      challenge.id,
      challenge.usedAt,
    ]);
  }
  async createRecentAuthGrant(grant: StoredRecentAuthGrant) {
    await this.pool.query(
      `INSERT INTO recent_auth_grants(
        id,owner_id,session_id,purpose,created_at,expires_at,consumed_at,revoked_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        grant.id,
        grant.ownerId,
        grant.sessionId,
        grant.purpose,
        grant.createdAt,
        grant.expiresAt,
        grant.consumedAt,
        grant.revokedAt,
      ],
    );
  }
  async findRecentAuthGrant(
    ownerId: string,
    sessionId: string,
    purpose: RecentAuthPurpose,
    now: Date,
  ) {
    const result = await this.pool.query<{
      id: string;
      owner_id: string;
      session_id: string;
      purpose: RecentAuthPurpose;
      created_at: Date;
      expires_at: Date;
      consumed_at: Date | null;
      revoked_at: Date | null;
    }>(
      `SELECT * FROM recent_auth_grants WHERE owner_id=$1 AND session_id=$2
       AND purpose=$3 AND expires_at>$4 AND consumed_at IS NULL AND revoked_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [ownerId, sessionId, purpose, now.toISOString()],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          ownerId: row.owner_id,
          sessionId: row.session_id,
          purpose: row.purpose,
          createdAt: row.created_at.toISOString(),
          expiresAt: row.expires_at.toISOString(),
          consumedAt: row.consumed_at?.toISOString() ?? null,
          revokedAt: row.revoked_at?.toISOString() ?? null,
        }
      : undefined;
  }
  async updateRecentAuthGrant(grant: StoredRecentAuthGrant) {
    await this.pool.query(
      "UPDATE recent_auth_grants SET consumed_at=$2,revoked_at=$3 WHERE id=$1",
      [grant.id, grant.consumedAt, grant.revokedAt],
    );
  }
  async consumeRecentAuthGrant(id: string, at: string) {
    const result = await this.pool.query(
      `UPDATE recent_auth_grants SET consumed_at=$2 WHERE id=$1
       AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>$2`,
      [id, at],
    );
    return result.rowCount === 1;
  }
  async revokeSessionSecurity(sessionId: string, at: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM csrf_tokens WHERE session_id=$1", [sessionId]);
      await client.query(
        `UPDATE recent_auth_grants SET revoked_at=$2
         WHERE session_id=$1 AND revoked_at IS NULL`,
        [sessionId, at],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async createRecoveryCodes(codes: StoredRecoveryCode[]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const code of codes) {
        await client.query(
          `INSERT INTO recovery_codes(
            id,owner_id,code_hash,generated_at,consumed_at,invalidated_at
          ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            code.id,
            code.ownerId,
            code.codeHash,
            code.generatedAt,
            code.consumedAt,
            code.invalidatedAt,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async listRecoveryCodes(ownerId: string) {
    const result = await this.pool.query<{
      id: string;
      owner_id: string;
      code_hash: string;
      generated_at: Date;
      consumed_at: Date | null;
      invalidated_at: Date | null;
    }>("SELECT * FROM recovery_codes WHERE owner_id=$1", [ownerId]);
    return result.rows.map((row) => ({
      id: row.id,
      ownerId: row.owner_id,
      codeHash: row.code_hash,
      generatedAt: row.generated_at.toISOString(),
      consumedAt: row.consumed_at?.toISOString() ?? null,
      invalidatedAt: row.invalidated_at?.toISOString() ?? null,
    }));
  }
  async invalidateRecoveryCodes(ownerId: string, at: string) {
    const result = await this.pool.query(
      `UPDATE recovery_codes SET invalidated_at=$2 WHERE owner_id=$1
       AND consumed_at IS NULL AND invalidated_at IS NULL`,
      [ownerId, at],
    );
    return result.rowCount ?? 0;
  }
  async updateRecoveryCode(code: StoredRecoveryCode) {
    await this.pool.query(
      `UPDATE recovery_codes SET consumed_at=$2,invalidated_at=$3
       WHERE id=$1 AND owner_id=$4`,
      [code.id, code.consumedAt, code.invalidatedAt, code.ownerId],
    );
  }
  async consumeRecoveryCode(id: string, at: string) {
    const result = await this.pool.query(
      `UPDATE recovery_codes SET consumed_at=$2 WHERE id=$1
       AND consumed_at IS NULL AND invalidated_at IS NULL`,
      [id, at],
    );
    return result.rowCount === 1;
  }
}
