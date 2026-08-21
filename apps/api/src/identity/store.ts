import type { User } from "@alexa-control/shared";

import type {
  CreateAuditRecord,
  PairingIntent,
  StoredAuditRecord,
  StoredDevice,
  StoredSession,
} from "./types.js";

export type Awaitable<T> = T | Promise<T>;

export interface IdentityStore {
  countUsers(): Awaitable<number>;
  createUser(user: User): Awaitable<void>;
  findUserByEmail(email: string): Awaitable<User | undefined>;
  findUserById(id: string): Awaitable<User | undefined>;
  updateUser(user: User): Awaitable<void>;
  createSession(session: StoredSession): Awaitable<void>;
  findSessionByTokenHash(tokenHash: string): Awaitable<StoredSession | undefined>;
  findSessionById(id: string): Awaitable<StoredSession | undefined>;
  listSessions(userId: string): Awaitable<StoredSession[]>;
  updateSession(session: StoredSession): Awaitable<void>;
  createPairingIntent(intent: PairingIntent): Awaitable<void>;
  consumePairingIntent(
    codeHash: string,
    now: Date,
  ): Awaitable<PairingIntent | undefined>;
  createDevice(device: StoredDevice): Awaitable<void>;
  findDeviceById(id: string): Awaitable<StoredDevice | undefined>;
  listDevices(ownerId: string): Awaitable<StoredDevice[]>;
  updateDevice(device: StoredDevice): Awaitable<void>;
  consumeNonce(
    deviceId: string,
    nonce: string,
    expiresAt: Date,
    now: Date,
  ): Awaitable<boolean>;
  appendAudit(record: CreateAuditRecord): Awaitable<StoredAuditRecord>;
  listAudit(userId: string, limit: number): Awaitable<StoredAuditRecord[]>;
}

export class InMemoryIdentityStore implements IdentityStore {
  readonly #users = new Map<string, User>();
  readonly #userIdsByEmail = new Map<string, string>();
  readonly #sessions = new Map<string, StoredSession>();
  readonly #sessionIdsByTokenHash = new Map<string, string>();
  readonly #pairingIntents = new Map<string, PairingIntent>();
  readonly #devices = new Map<string, StoredDevice>();
  readonly #nonces = new Map<string, number>();
  readonly #audit: StoredAuditRecord[] = [];

  countUsers() {
    return this.#users.size;
  }

  createUser(user: User) {
    if (this.#userIdsByEmail.has(user.email)) {
      throw new Error("User email already exists.");
    }
    this.#users.set(user.id, structuredClone(user));
    this.#userIdsByEmail.set(user.email, user.id);
  }

  findUserByEmail(email: string) {
    const id = this.#userIdsByEmail.get(email);
    const user = id ? this.#users.get(id) : undefined;
    return user ? structuredClone(user) : undefined;
  }

  findUserById(id: string) {
    const user = this.#users.get(id);
    return user ? structuredClone(user) : undefined;
  }

  updateUser(user: User) {
    if (!this.#users.has(user.id)) {
      throw new Error("User does not exist.");
    }
    this.#users.set(user.id, structuredClone(user));
  }

  createSession(session: StoredSession) {
    this.#sessions.set(session.id, structuredClone(session));
    this.#sessionIdsByTokenHash.set(session.tokenHash, session.id);
  }

  findSessionByTokenHash(tokenHash: string) {
    const id = this.#sessionIdsByTokenHash.get(tokenHash);
    const session = id ? this.#sessions.get(id) : undefined;
    return session ? structuredClone(session) : undefined;
  }

  findSessionById(id: string) {
    const session = this.#sessions.get(id);
    return session ? structuredClone(session) : undefined;
  }

  listSessions(userId: string) {
    return [...this.#sessions.values()]
      .filter((session) => session.userId === userId)
      .map((session) => structuredClone(session));
  }

  updateSession(session: StoredSession) {
    if (!this.#sessions.has(session.id)) {
      throw new Error("Session does not exist.");
    }
    this.#sessions.set(session.id, structuredClone(session));
  }

  createPairingIntent(intent: PairingIntent) {
    this.#pairingIntents.set(intent.codeHash, structuredClone(intent));
  }

  consumePairingIntent(codeHash: string, now: Date) {
    const intent = this.#pairingIntents.get(codeHash);
    if (
      !intent ||
      intent.usedAt !== null ||
      new Date(intent.expiresAt).getTime() <= now.getTime()
    ) {
      return undefined;
    }
    const consumed = { ...intent, usedAt: now.toISOString() };
    this.#pairingIntents.set(codeHash, consumed);
    return structuredClone(consumed);
  }

  createDevice(device: StoredDevice) {
    this.#devices.set(device.id, structuredClone(device));
  }

  findDeviceById(id: string) {
    const device = this.#devices.get(id);
    return device ? structuredClone(device) : undefined;
  }

  listDevices(ownerId: string) {
    return [...this.#devices.values()]
      .filter((device) => device.ownerId === ownerId)
      .map((device) => structuredClone(device));
  }

  updateDevice(device: StoredDevice) {
    if (!this.#devices.has(device.id)) {
      throw new Error("Device does not exist.");
    }
    this.#devices.set(device.id, structuredClone(device));
  }

  consumeNonce(deviceId: string, nonce: string, expiresAt: Date, now: Date) {
    for (const [key, expiry] of this.#nonces.entries()) {
      if (expiry <= now.getTime()) {
        this.#nonces.delete(key);
      }
    }

    const key = `${deviceId}:${nonce}`;
    if (this.#nonces.has(key)) {
      return false;
    }
    this.#nonces.set(key, expiresAt.getTime());
    return true;
  }

  appendAudit(record: CreateAuditRecord) {
    const stored: StoredAuditRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      userId: record.userId ?? null,
      deviceId: record.deviceId ?? null,
      ...record,
    };
    this.#audit.push(stored);
    return structuredClone(stored);
  }

  listAudit(userId: string, limit: number) {
    return this.#audit
      .filter((record) => record.userId === userId)
      .slice(-limit)
      .reverse()
      .map((record) => structuredClone(record));
  }
}
