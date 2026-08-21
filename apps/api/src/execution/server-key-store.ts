import {
  canonicalizeExecutionPayload,
  type ServerExecutionEnvelope,
} from "@alexa-control/shared";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, webcrypto } from "node:crypto";

interface StoredServerKey {
  privateKey: JsonWebKey;
  publicKey: JsonWebKey;
}
type NodeCryptoKey = Awaited<ReturnType<typeof webcrypto.subtle.importKey>>;

export class ServerExecutionSigner {
  private constructor(
    readonly privateKey: NodeCryptoKey,
    readonly publicKeyX: string,
    readonly fingerprint: string,
  ) {}

  static async load(keyPath: string, allowCreate: boolean) {
    let stored: StoredServerKey;
    try {
      stored = JSON.parse(await readFile(keyPath, "utf8")) as StoredServerKey;
    } catch {
      if (!allowCreate)
        throw new Error("Persistent server execution key is unavailable.");
      const pair = (await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, [
        "sign",
        "verify",
      ])) as unknown as webcrypto.CryptoKeyPair;
      stored = {
        privateKey: await webcrypto.subtle.exportKey("jwk", pair.privateKey),
        publicKey: await webcrypto.subtle.exportKey("jwk", pair.publicKey),
      };
      await mkdir(path.dirname(keyPath), { recursive: true, mode: 0o700 });
      await writeFile(keyPath, `${JSON.stringify(stored)}\n`, {
        mode: 0o600,
        flag: "wx",
      });
      await chmod(keyPath, 0o600);
    }
    if (!stored.publicKey.x) throw new Error("Server execution public key is invalid.");
    const privateKey = await webcrypto.subtle.importKey(
      "jwk",
      stored.privateKey,
      { name: "Ed25519" },
      false,
      ["sign"],
    );
    const fingerprint = `SHA256:${createHash("sha256")
      .update(
        JSON.stringify({
          crv: "Ed25519",
          kty: "OKP",
          x: stored.publicKey.x,
        }),
      )
      .digest("base64url")}`;
    return new ServerExecutionSigner(privateKey, stored.publicKey.x, fingerprint);
  }

  async sign(
    envelope: Omit<ServerExecutionEnvelope, "signature" | "signatureAlgorithm">,
  ): Promise<ServerExecutionEnvelope> {
    const signature = await webcrypto.subtle.sign(
      "Ed25519",
      this.privateKey,
      new TextEncoder().encode(canonicalizeExecutionPayload(envelope)),
    );
    return {
      ...envelope,
      signature: Buffer.from(signature).toString("base64url"),
      signatureAlgorithm: "Ed25519",
    };
  }
}
