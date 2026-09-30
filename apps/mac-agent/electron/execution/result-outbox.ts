import { constants } from "node:fs";
import { link, mkdir, open, rm } from "node:fs/promises";
import path from "node:path";

import { ReadOnlyExecutionResultSchema, type ReadOnlyExecutionResult } from "@alexa-control/shared";
import { z } from "zod";

import type { SafeStorageAdapter } from "../device-key-store.js";

const OutboxRecordSchema = z.object({
  version: z.literal(1),
  deviceId: z.string().uuid(),
  result: ReadOnlyExecutionResultSchema,
}).strict();

/** One encrypted, device-bound receipt. An unacknowledged result fences new work. */
export class EncryptedExecutionResultOutbox {
  constructor(
    private readonly storage: SafeStorageAdapter,
    private readonly pathname: string,
    private readonly deviceId: string,
  ) {}

  async load(): Promise<ReadOnlyExecutionResult | null> {
    this.assertStorage();
    let handle;
    try {
      handle = await open(this.pathname, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 2_000_000)
        throw new Error("The pending execution receipt is invalid.");
      const encrypted = await handle.readFile();
      const record = OutboxRecordSchema.parse(
        JSON.parse(this.storage.decryptString(encrypted)) as unknown,
      );
      if (record.deviceId !== this.deviceId || record.result.deviceId !== this.deviceId)
        throw new Error("The pending execution receipt belongs to another device.");
      return record.result;
    } finally {
      await handle.close();
    }
  }

  async save(result: ReadOnlyExecutionResult): Promise<void> {
    if (result.deviceId !== this.deviceId)
      throw new Error("The execution result belongs to another device.");
    if (await this.load())
      throw new Error("A signed execution receipt still awaits acknowledgement.");
    this.assertStorage();
    const encrypted = this.storage.encryptString(JSON.stringify({
      version: 1,
      deviceId: this.deviceId,
      result: ReadOnlyExecutionResultSchema.parse(result),
    }));
    if (encrypted.length > 2_000_000)
      throw new Error("The execution receipt exceeds the local limit.");
    await mkdir(path.dirname(this.pathname), { recursive: true, mode: 0o700 });
    const temporary = `${this.pathname}.${crypto.randomUUID()}.tmp`;
    try {
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(encrypted);
        await file.sync();
      } finally {
        await file.close();
      }
      // link fails if another Agent process already owns the receipt path.
      // Never replace a different signed result after a reconnect race.
      await link(temporary, this.pathname);
      await rm(temporary);
      const directory = await open(path.dirname(this.pathname), "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async clearAcknowledged(result: ReadOnlyExecutionResult): Promise<void> {
    const pending = await this.load();
    if (!pending || pending.commandId !== result.commandId ||
        pending.deviceSignature !== result.deviceSignature)
      throw new Error("The acknowledged execution receipt does not match local state.");
    await rm(this.pathname);
  }

  private assertStorage() {
    if (!this.storage.isEncryptionAvailable())
      throw new Error("macOS secure storage is unavailable for execution results.");
  }
}
