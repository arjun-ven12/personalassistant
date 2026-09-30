import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ReadOnlyExecutionClient } from "./execution-client.js";
import { EncryptedExecutionResultOutbox } from "./result-outbox.js";

const pendingClient = async () => {
  const keys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  if (!("privateKey" in keys)) throw new Error("Expected an Ed25519 key pair.");
  const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
  let release!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const fetchImplementation = vi.fn<typeof fetch>().mockReturnValue(pending);
  const client = new ReadOnlyExecutionClient(
    "https://agent.test",
    "00000000-0000-4000-8000-000000000001",
    {
      privateKey: keys.privateKey,
      publicKey: { kty: "OKP", crv: "Ed25519", x: publicKey.x! },
      fingerprint: "test",
    },
    publicKey.x!,
    60_000,
    { maxFileReadBytes: 1_024, maxGitOutputBytes: 1_024, maxGitEntries: 10 },
    undefined,
    fetchImplementation,
  );
  return {
    client,
    fetchImplementation,
    release: () =>
      release(
        Response.json({
          envelope: null,
          emergencyStopActive: false,
          cancellations: [],
        }),
      ),
  };
};

describe("Mac execution transport single-flight polling", () => {
  it("submits a saved signed result before requesting any new work", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "alexa-result-replay-"));
    const deviceId = "00000000-0000-4000-8000-000000000001";
    const outbox = new EncryptedExecutionResultOutbox({
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(value),
      decryptString: (value) => value.toString(),
    }, path.join(directory, "receipt.secure"), deviceId);
    await outbox.save({
      commandId: crypto.randomUUID(), executionRequestId: crypto.randomUUID(), deviceId,
      toolName: "git.status", status: "FAILED", failureCode: "CAPABILITY_UNAVAILABLE",
      startedAt: "2026-09-28T00:00:00.000Z", completedAt: "2026-09-28T00:00:01.000Z",
      durationMs: 1_000, truncated: false, resultDigest: "a".repeat(64),
      nonce: "pending-nonce-1234567890", deviceSignature: "b".repeat(64),
    });
    const keys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    if (!("privateKey" in keys)) throw new Error("Expected an Ed25519 key pair.");
    const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
    const operations: string[] = [];
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      if (typeof init?.body !== "string") throw new Error("Expected a JSON request body.");
      const envelope = JSON.parse(init.body) as { payload: { operation: string } };
      operations.push(envelope.payload.operation);
      return Promise.resolve(Response.json(envelope.payload.operation === "poll"
        ? { envelope: null, emergencyStopActive: false, cancellations: [] }
        : { accepted: true }));
    });
    const client = new ReadOnlyExecutionClient(
      "https://agent.test", deviceId,
      { privateKey: keys.privateKey, publicKey: { kty: "OKP", crv: "Ed25519", x: publicKey.x! }, fingerprint: "test" },
      publicKey.x!, 60_000,
      { maxFileReadBytes: 1_024, maxGitOutputBytes: 1_024, maxGitEntries: 10 },
      undefined, fetchImplementation, undefined, undefined, outbox,
    );
    try {
      client.start();
      await vi.waitFor(() => expect(operations).toEqual(["result", "poll"]));
      await expect(outbox.load()).resolves.toBeNull();
    } finally {
      client.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not open overlapping loops when reconnect is requested during a poll", async () => {
    const { client, fetchImplementation, release } = await pendingClient();
    try {
      client.start();
      await vi.waitFor(() => expect(fetchImplementation).toHaveBeenCalledTimes(1));
      client.reconnectNow();
      client.resume();
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
      release();
      await vi.waitFor(() =>
        expect(client.status.lastSuccessfulConnectionAt).not.toBeNull(),
      );
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
    } finally {
      client.stop();
    }
  });

  it.each(["stop", "suspend"] as const)(
    "does not consume a late response after %s",
    async (action) => {
      const { client, fetchImplementation, release } = await pendingClient();
      try {
        client.start();
        await vi.waitFor(() => expect(fetchImplementation).toHaveBeenCalledTimes(1));
        client[action]();
        release();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(client.status.lastSuccessfulConnectionAt).toBeNull();
        expect(fetchImplementation).toHaveBeenCalledTimes(1);
      } finally {
        client.stop();
      }
    },
  );
});
