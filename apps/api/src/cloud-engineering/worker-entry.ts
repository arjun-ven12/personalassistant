import { createPrivateKey, createPublicKey, createHash, webcrypto } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, realpath } from "node:fs/promises";
import { z } from "zod";
import { Ed25519PublicKeySchema } from "@alexa-control/shared";
import {
  NativeEngineeringRuntime,
  DockerEngineeringRunner,
  DockerEngineeringDependencyRunner,
} from "../../../mac-agent/electron/engineering-runtime/runtime.js";
import { CloudEngineeringWorker } from "./worker.js";

// Operator bootstrap only. No HTTP registration or client-selected paths.
const Configuration = z
  .object({
    schemaVersion: z.literal("1"),
    isolation: z.literal("DEDICATED_COMPANY_LINUX_VM"),
    apiBaseUrl: z.url().refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash
      );
    }),
    deviceId: z.string().uuid(),
    companyId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    workspaceLocatorId: z.string().regex(/^[a-z][a-z0-9_.:-]{2,119}$/),
    serverPublicKeyX: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    publicKeyX: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();

async function ephemeralKey() {
  // The workload secret manager supplies DER PKCS8 on fd 3. Never env/JSON/disk.
  const stream = createReadStream("", { fd: 3, autoClose: true });
  const timeout = setTimeout(
    () => stream.destroy(Error("Workload key unavailable.")),
    5_000,
  );
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > 16_384) {
        bytes.fill(0);
        throw Error("Invalid workload key.");
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timeout);
    stream.destroy();
    for (const chunk of chunks) chunk.fill(0);
  }
}

async function start() {
  if (process.platform !== "linux") throw Error("Dedicated Linux worker required.");
  const file = "/run/athena/engineering-worker.json";
  const info = await lstat(file);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size > 16_384 ||
    (info.mode & 0o022) !== 0 ||
    info.uid !== 0
  )
    throw Error("Trusted bootstrap configuration unavailable.");
  const config = Configuration.parse(
    JSON.parse(await readFile(file, "utf8")) as unknown,
  );
  const repositoryRoot = `/workspace/repositories/${config.repositoryId}`;
  if ((await realpath(repositoryRoot)) !== repositoryRoot)
    throw Error("Canonical workspace unavailable.");
  const key = await ephemeralKey();
  const identity = await (async () => {
    try {
      const publicJwk = createPublicKey(
        createPrivateKey({ key, type: "pkcs8", format: "der" }),
      ).export({ format: "jwk" });
      const publicKey = Ed25519PublicKeySchema.parse({
        ...publicJwk,
        ext: true,
        key_ops: ["verify"],
      });
      if (publicKey.x !== config.publicKeyX)
        throw Error("Workload key does not match the registered worker.");
      const privateKey = (await webcrypto.subtle.importKey(
        "pkcs8",
        key,
        { name: "Ed25519" },
        false,
        ["sign"],
      )) as CryptoKey;
      return {
        privateKey,
        publicKey,
        fingerprint: `SHA256:${createHash("sha256")
          .update(
            JSON.stringify({ crv: publicKey.crv, kty: publicKey.kty, x: publicKey.x }),
          )
          .digest("base64url")}`,
      };
    } finally {
      key.fill(0);
    }
  })();
  const runtime = new NativeEngineeringRuntime(
    "/workspace/worktrees",
    new DockerEngineeringRunner("/usr/bin/docker"),
    new DockerEngineeringDependencyRunner("/usr/bin/docker"),
    "/usr/bin/docker",
  );
  const worker = new CloudEngineeringWorker({
    ...config,
    identity,
    repositoryRoot,
    runtime,
  });
  process.once("SIGTERM", () => {
    worker.stop();
    process.exitCode = 0;
  });
  process.once("SIGINT", () => {
    worker.stop();
    process.exitCode = 0;
  });
  worker.start();
}
start().catch(() => {
  process.stderr.write(
    "Cloud Engineering worker bootstrap failed closed. Check trusted workload configuration and registration.\n",
  );
  process.exitCode = 1;
});
