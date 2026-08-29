import { canonicalizeSignedCommand } from "@alexa-control/shared";
import type { Ed25519PublicKey, SignedCommandEnvelope } from "@alexa-control/shared";
import argon2 from "argon2";
import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
  webcrypto,
} from "node:crypto";

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const hashPassword = (password: string) =>
  argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

export const verifyPassword = (hash: string, password: string) =>
  argon2.verify(hash, password);

export const createSecretToken = () => randomBytes(32).toString("base64url");

export const hashSecret = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("base64url");

export const secretsMatch = (leftHash: string, rightHash: string) => {
  const left = Buffer.from(leftHash);
  const right = Buffer.from(rightHash);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const createPairingCode = () =>
  Array.from(
    { length: 8 },
    () => PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)],
  ).join("");

export const fingerprintPublicKey = (key: Ed25519PublicKey) =>
  `SHA256:${hashSecret(JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x }))}`;

export const verifyEnvelopeSignature = async (
  publicKey: Ed25519PublicKey,
  envelope: SignedCommandEnvelope,
) => {
  const { signature, ...unsignedEnvelope } = envelope;
  const publicJwk: JsonWebKey = {
    kty: publicKey.kty,
    crv: publicKey.crv,
    x: publicKey.x,
    ...(publicKey.ext === undefined ? {} : { ext: publicKey.ext }),
    ...(publicKey.key_ops === undefined ? {} : { key_ops: [...publicKey.key_ops] }),
  };
  const key = await webcrypto.subtle.importKey(
    "jwk",
    publicJwk,
    { name: "Ed25519" },
    false,
    ["verify"],
  );

  return webcrypto.subtle.verify(
    "Ed25519",
    key,
    Buffer.from(signature, "base64url"),
    new TextEncoder().encode(canonicalizeSignedCommand(unsignedEnvelope)),
  );
};

export const verifyEd25519Signature = async (
  publicKey: Ed25519PublicKey,
  value: string,
  signature: string,
) => {
  const key = await webcrypto.subtle.importKey(
    "jwk",
    {
      kty: publicKey.kty,
      crv: publicKey.crv,
      x: publicKey.x,
      ...(publicKey.ext === undefined ? {} : { ext: publicKey.ext }),
      ...(publicKey.key_ops === undefined ? {} : { key_ops: [...publicKey.key_ops] }),
    },
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  return webcrypto.subtle.verify(
    "Ed25519",
    key,
    Buffer.from(signature, "base64url"),
    new TextEncoder().encode(value),
  );
};
