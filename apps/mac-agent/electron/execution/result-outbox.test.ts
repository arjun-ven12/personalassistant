import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { ReadOnlyExecutionResult } from "@alexa-control/shared";

import { EncryptedExecutionResultOutbox } from "./result-outbox.js";

const deviceId = "00000000-0000-4000-8000-000000000001";
const result: ReadOnlyExecutionResult = {
  commandId: "00000000-0000-4000-8000-000000000002",
  executionRequestId: "00000000-0000-4000-8000-000000000003",
  deviceId,
  toolName: "git.status",
  status: "FAILED",
  failureCode: "CAPABILITY_UNAVAILABLE",
  startedAt: "2026-09-28T00:00:00.000Z",
  completedAt: "2026-09-28T00:00:01.000Z",
  durationMs: 1_000,
  truncated: false,
  resultDigest: "a".repeat(64),
  nonce: "test-nonce-1234567890",
  deviceSignature: "b".repeat(64),
};
const storage = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(Buffer.from(value).map((byte) => byte ^ 0x5a)),
  decryptString: (value: Buffer) => Buffer.from(value.map((byte) => byte ^ 0x5a)).toString(),
};

describe("encrypted execution result outbox", () => {
  const directories: string[] = [];
  afterEach(async () => {
    for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
  });

  it("retains one signed receipt across client restarts and removes it only after exact acknowledgement", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "alexa-result-outbox-"));
    directories.push(directory);
    const pathname = path.join(directory, "execution-result.secure");
    const first = new EncryptedExecutionResultOutbox(storage, pathname, deviceId);
    await first.save(result);
    expect((await readFile(pathname)).toString()).not.toContain(result.commandId);

    const restarted = new EncryptedExecutionResultOutbox(storage, pathname, deviceId);
    await expect(restarted.load()).resolves.toEqual(result);
    await expect(restarted.save(result)).rejects.toThrow(/awaits acknowledgement/);
    await expect(restarted.clearAcknowledged({ ...result, commandId: crypto.randomUUID() }))
      .rejects.toThrow(/does not match/);
    await restarted.clearAcknowledged(result);
    await expect(restarted.load()).resolves.toBeNull();
  });

  it("fails closed when secure storage or device binding is unavailable", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "alexa-result-outbox-"));
    directories.push(directory);
    const pathname = path.join(directory, "execution-result.secure");
    await new EncryptedExecutionResultOutbox(storage, pathname, deviceId).save(result);
    await expect(new EncryptedExecutionResultOutbox(storage, pathname, crypto.randomUUID()).load())
      .rejects.toThrow(/another device/);
    await expect(new EncryptedExecutionResultOutbox({
      ...storage,
      isEncryptionAvailable: () => false,
    }, pathname, deviceId).load()).rejects.toThrow(/secure storage/);
    await expect(new EncryptedExecutionResultOutbox({
      ...storage,
      isEncryptionAvailable: () => false,
    }, path.join(directory, "missing.secure"), deviceId).load()).rejects.toThrow(/secure storage/);
  });
});
