import { mkdir, readFile, rename, rm, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { webcrypto } from "node:crypto";

import { Ed25519PublicKeySchema } from "@alexa-control/shared";
import { z } from "zod";

import type { LocalDeviceIdentity } from "./services.js";

export interface DeviceKeyStore {
  loadKeyPair(): Promise<LocalDeviceIdentity | null>;
  saveKeyPair(keyPair: LocalDeviceIdentity): Promise<void>;
  deleteKeyPair(): Promise<void>;
}

export const LocalDeviceMetadataSchema = z
  .object({
    deviceId: z.string().uuid(),
    fingerprint: z.string().min(1).max(200),
    trustStatus: z.enum(["PENDING", "TRUSTED", "REVOKED", "EXPIRED"]),
    deviceName: z.string().trim().min(1).max(160).optional(),
    serverExecutionPublicKey: z.string().min(32).max(256).optional(),
    serverExecutionKeyFingerprint: z.string().min(16).max(200).optional(),
    workspaceMappingsConfirmedAt: z.iso.datetime().nullable().optional(),
  })
  .strict();
export type LocalDeviceMetadata = z.infer<typeof LocalDeviceMetadataSchema>;

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export const assertDevicePairingStorage = (available: boolean, status: string) => {
  if (!available) {
    throw new Error(
      "macOS secure key storage is unavailable. Restore secure storage access, then choose Reconnect. Do not reset your existing identity.",
    );
  }
  if (status !== "AVAILABLE" && status !== "MISSING") {
    throw new Error(
      "The existing device identity must be recovered before pairing. Choose Reconnect after restoring secure storage access.",
    );
  }
};

// Re-read only the existing stores. Recovery must never generate or replace keys.
export const restoreStoredDeviceIdentity = async (
  keys: Pick<DeviceKeyStore, "loadKeyPair">,
  metadataStore: Pick<DeviceMetadataStore, "load">,
  encryptionAvailable: () => boolean,
) => {
  let metadata: LocalDeviceMetadata | null = null;
  try {
    metadata = await metadataStore.load();
    const identity = await keys.loadKeyPair();
    if (
      Boolean(identity) !== Boolean(metadata) ||
      (identity && metadata && identity.fingerprint !== metadata.fingerprint)
    ) {
      return { identity: null, metadata, status: "CORRUPT" as const };
    }
    return {
      identity,
      metadata,
      status: identity ? ("AVAILABLE" as const) : ("MISSING" as const),
    };
  } catch {
    return {
      identity: null,
      metadata,
      status: encryptionAvailable() ? ("CORRUPT" as const) : ("UNAVAILABLE" as const),
    };
  }
};

export interface NarrowFileAdapter {
  read(pathname: string): Promise<Buffer>;
  writeAtomic(pathname: string, value: Buffer): Promise<void>;
  remove(pathname: string): Promise<void>;
}

const nodeFiles: NarrowFileAdapter = {
  read: (pathname) => readFile(pathname),
  async writeAtomic(pathname, value) {
    await mkdir(path.dirname(pathname), { recursive: true, mode: 0o700 });
    const temporary = `${pathname}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, value, { mode: 0o600, flag: "wx" });
    await chmod(temporary, 0o600);
    await rename(temporary, pathname);
  },
  async remove(pathname) {
    await rm(pathname, { force: true });
  },
};

interface PersistedKeyPair {
  version: 1;
  privateKey: JsonWebKey;
  publicKey: JsonWebKey;
  fingerprint: string;
}

export class ElectronSafeStorageDeviceKeyStore implements DeviceKeyStore {
  constructor(
    private readonly safeStorage: SafeStorageAdapter,
    private readonly pathname: string,
    private readonly files: NarrowFileAdapter = nodeFiles,
  ) {}

  async loadKeyPair(): Promise<LocalDeviceIdentity | null> {
    let encrypted: Buffer;
    try {
      encrypted = await this.files.read(this.pathname);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    this.assertEncryptionAvailable();
    const payload = JSON.parse(
      this.safeStorage.decryptString(encrypted),
    ) as PersistedKeyPair;
    if (
      payload.version !== 1 ||
      payload.privateKey.kty !== "OKP" ||
      payload.privateKey.crv !== "Ed25519"
    ) {
      throw new Error("Stored device key is invalid.");
    }
    const privateKey = (await webcrypto.subtle.importKey(
      "jwk",
      payload.privateKey,
      { name: "Ed25519" },
      true,
      ["sign"],
    )) as unknown as CryptoKey;
    return {
      privateKey,
      publicKey: Ed25519PublicKeySchema.parse(payload.publicKey),
      fingerprint: payload.fingerprint,
    };
  }

  async saveKeyPair(identity: LocalDeviceIdentity) {
    this.assertEncryptionAvailable();
    const privateKey = await webcrypto.subtle.exportKey("jwk", identity.privateKey);
    const payload: PersistedKeyPair = {
      version: 1,
      privateKey,
      publicKey: {
        kty: identity.publicKey.kty,
        crv: identity.publicKey.crv,
        x: identity.publicKey.x,
        ext: true,
        key_ops: ["verify"],
      },
      fingerprint: identity.fingerprint,
    };
    const encrypted = this.safeStorage.encryptString(JSON.stringify(payload));
    await this.files.writeAtomic(this.pathname, encrypted);
  }

  async deleteKeyPair() {
    await this.files.remove(this.pathname);
  }

  private assertEncryptionAvailable() {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error("macOS secure key storage is unavailable.");
    }
  }
}

export class DeviceMetadataStore {
  constructor(
    private readonly pathname: string,
    private readonly files: NarrowFileAdapter = nodeFiles,
  ) {}

  async load(): Promise<LocalDeviceMetadata | null> {
    try {
      return LocalDeviceMetadataSchema.parse(
        JSON.parse((await this.files.read(this.pathname)).toString("utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async save(metadata: LocalDeviceMetadata) {
    await this.files.writeAtomic(
      this.pathname,
      Buffer.from(JSON.stringify(LocalDeviceMetadataSchema.parse(metadata))),
    );
  }

  async delete() {
    await this.files.remove(this.pathname);
  }
}
