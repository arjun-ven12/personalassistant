import { describe, expect, it } from "vitest";

import {
  ElectronSafeStorageDeviceKeyStore,
  DeviceMetadataStore,
  type NarrowFileAdapter,
  type SafeStorageAdapter,
} from "./device-key-store.js";
import { generateLocalDeviceIdentity } from "./services.js";

const safeStorage: SafeStorageAdapter = {
  isEncryptionAvailable: () => true,
  encryptString: (plaintext) =>
    Buffer.from(Buffer.from(plaintext).toString("base64"), "utf8"),
  decryptString: (encrypted) =>
    Buffer.from(encrypted.toString("utf8"), "base64").toString("utf8"),
};

describe("persistent Mac device keys", () => {
  it("round-trips an Ed25519 identity without exposing plaintext storage", async () => {
    let stored: Buffer | undefined;
    const files: NarrowFileAdapter = {
      read: () => {
        if (!stored) {
          const error = new Error("missing") as NodeJS.ErrnoException;
          error.code = "ENOENT";
          return Promise.reject(error);
        }
        return Promise.resolve(stored);
      },
      writeAtomic: (_pathname, value) => {
        stored = Buffer.from(value);
        return Promise.resolve();
      },
      remove: () => {
        stored = undefined;
        return Promise.resolve();
      },
    };
    const store = new ElectronSafeStorageDeviceKeyStore(
      safeStorage,
      "/test/device.secure",
      files,
    );
    expect(await store.loadKeyPair()).toBeNull();
    const generated = await generateLocalDeviceIdentity();
    await store.saveKeyPair(generated);
    expect(stored?.toString("utf8")).not.toContain(generated.publicKey.x);
    const loaded = await store.loadKeyPair();
    expect(loaded).toMatchObject({
      fingerprint: generated.fingerprint,
      publicKey: generated.publicKey,
    });
    await store.deleteKeyPair();
    expect(await store.loadKeyPair()).toBeNull();
  });

  it("fails closed when secure encryption is unavailable", async () => {
    const files: NarrowFileAdapter = {
      read: () => Promise.resolve(Buffer.from("encrypted")),
      writeAtomic: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };
    const store = new ElectronSafeStorageDeviceKeyStore(
      { ...safeStorage, isEncryptionAvailable: () => false },
      "/test/device.secure",
      files,
    );
    await expect(store.loadKeyPair()).rejects.toThrow(/unavailable/i);
  });

  it("persists only bounded non-secret device metadata", async () => {
    let stored: Buffer | undefined;
    const files: NarrowFileAdapter = {
      read: () => Promise.resolve(stored!),
      writeAtomic: (_pathname, value) => {
        stored = value;
        return Promise.resolve();
      },
      remove: () => {
        stored = undefined;
        return Promise.resolve();
      },
    };
    const metadata = new DeviceMetadataStore("/test/device.json", files);
    await metadata.save({
      deviceId: "00000000-0000-4000-8000-000000000001",
      fingerprint: "SHA256:test",
      trustStatus: "TRUSTED",
    });
    expect(await metadata.load()).toMatchObject({ trustStatus: "TRUSTED" });
    expect(stored?.toString("utf8")).not.toContain("privateKey");
    expect(stored?.toString("utf8")).not.toContain("pairingRequestToken");
  });
});
