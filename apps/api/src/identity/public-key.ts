import { createHash } from "node:crypto";
import type { Ed25519PublicKey } from "@alexa-control/shared";
/** Public identity fingerprint shared with the isolated worker; no password dependency. */
export const fingerprintPublicKey = (key: Ed25519PublicKey) =>
  `SHA256:${createHash("sha256")
    .update(JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x }), "utf8")
    .digest("base64url")}`;
