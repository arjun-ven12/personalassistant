import { webcrypto } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFileSync, renameSync } from "node:fs";
import { lstat, readFile, mkdir, unlink, realpath } from "node:fs/promises";
import { z } from "zod";
import {
  CloudBackendOriginSchema,
  canonicalizeCloudWorkloadProof,
  canonicalizeSignedCommand,
  CloudResourceLimitsSchema,
  Ed25519PublicKeySchema,
  Ec2WorkloadScopeSchema,
} from "@alexa-control/shared";
import {
  NativeEngineeringRuntime,
  DockerEngineeringRunner,
  DockerEngineeringDependencyRunner,
} from "../../../mac-agent/electron/engineering-runtime/runtime.js";
import { fingerprintPublicKey } from "../identity/public-key.js";
import { createCloudPreviewGate, readCloudPreviewGrant } from "./preview-gate.js";
import {
  verifyCloudRuntime,
  isEc2Runtime,
  verifyEc2LocalRuntime,
} from "./runtime-preflight.js";
import { CloudEngineeringWorker } from "./worker.js";
import { measureEc2Evidence } from "./ec2-image-runtime.js";
const Bootstrap = z
  .object({
    schemaVersion: z.literal("2"),
    previewEnabled: z.boolean().default(true),
    backendOrigin: CloudBackendOriginSchema,
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    expiresAt: z.iso.datetime(),
    serverPublicKeyX: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    baseCommit: z.string().regex(/^[a-f0-9]{40}$/),
    defaultBranch: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/),
    workspaceLocatorId: z.string().regex(/^cloud\.[a-f0-9-]{36}$/),
    workspaceId: z.string().uuid(),
    companyId: z.string().uuid(),
    repositoryId: z.string().uuid(),
    workerId: z.string().uuid(),
    generation: z.number().int().positive(),
    limits: CloudResourceLimitsSchema,
  })
  .strict();
async function git(args: string[], env: Record<string, string>) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("/usr/bin/git", ["-c", "core.hooksPath=/dev/null", ...args], {
      env,
      stdio: ["ignore", "pipe", "ignore"],
      shell: false,
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(Error("Governed repository preparation timed out."));
    }, 90_000);
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.length > 4096) {
        child.kill("SIGKILL");
        reject(Error("Repository metadata output exceeded its limit."));
      }
    });
    child.once("error", () => {
      clearTimeout(timer);
      reject(Error("Governed Git process unavailable."));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output.trim());
      else reject(Error("Governed repository preparation failed."));
    });
  });
}
export async function startProvisionedWorker() {
  if (process.platform !== "linux") throw Error("Isolated Linux VM required.");
  const ec2 = await isEc2Runtime();
  let measuredScope: unknown;
  if (ec2) {
    await verifyEc2LocalRuntime();
    const evidence = await measureEc2Evidence();
    measuredScope = Object.fromEntries(
      Object.keys(Ec2WorkloadScopeSchema.shape).map((k) => [
        k,
        evidence[k as keyof typeof evidence],
      ]),
    );
  } else await verifyCloudRuntime();
  const file = "/run/athena/bootstrap.json";
  const info = await lstat(file);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.uid !== 0 ||
    info.size > 16_384 ||
    (info.mode & 0o077) !== 0
  )
    throw Error("Trusted bootstrap unavailable.");
  const config = Bootstrap.parse(JSON.parse(await readFile(file, "utf8")) as unknown);
  if (
    ec2 &&
    JSON.stringify(Ec2WorkloadScopeSchema.parse(measuredScope)) !==
      JSON.stringify(
        Ec2WorkloadScopeSchema.parse(
          Object.fromEntries(
            Object.keys(Ec2WorkloadScopeSchema.shape).map((k) => [
              k,
              config[k as keyof typeof config],
            ]),
          ),
        ),
      )
  )
    throw Error("Measured workload scope mismatch.");
  await unlink(file);
  if (Date.now() >= Date.parse(config.expiresAt))
    throw Error("Workload credential expired.");
  const pair = (await webcrypto.subtle.generateKey("Ed25519", false, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const publicKey = Ed25519PublicKeySchema.parse({
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    ext: true,
    key_ops: ["verify"],
  });
  const identity = {
    privateKey: pair.privateKey,
    publicKey,
    fingerprint: fingerprintPublicKey(publicKey),
  };
  const post = async (path: string, body: unknown, token?: string) => {
    const response = await fetch(new URL(path, config.backendOrigin), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw Error("Athena workload verification failed.");
    return z
      .object({ state: z.string(), expiresAt: z.iso.datetime() })
      .passthrough()
      .parse(await response.json());
  };
  const proof = {
    workspaceId: config.workspaceId,
    companyId: config.companyId,
    repositoryId: config.repositoryId,
    workerId: config.workerId,
    generation: config.generation,
    backendOrigin: config.backendOrigin,
    capability: "engineering.repository_capability" as const,
    publicKey,
    issuedAt: new Date().toISOString(),
    nonce: crypto.randomUUID(),
  };
  const signature = Buffer.from(
    await webcrypto.subtle.sign(
      "Ed25519",
      pair.privateKey,
      new TextEncoder().encode(canonicalizeCloudWorkloadProof(proof)),
    ),
  ).toString("base64url");
  await post(
    `/api/cloud-workloads/${config.workspaceId}/authenticate`,
    { ...proof, signature },
    config.token,
  );
  const lifecycle = async (payload: Record<string, string>) => {
    const at = Date.now();
    const e = {
      protocolVersion: "1" as const,
      signatureAlgorithm: "Ed25519" as const,
      commandId: crypto.randomUUID(),
      deviceId: config.workerId,
      issuedAt: new Date(at).toISOString(),
      expiresAt: new Date(at + 30_000).toISOString(),
      nonce: crypto.randomUUID(),
      payload,
    };
    const signature = Buffer.from(
      await webcrypto.subtle.sign(
        "Ed25519",
        pair.privateKey,
        new TextEncoder().encode(canonicalizeSignedCommand(e)),
      ),
    ).toString("base64url");
    return post(`/api/cloud-workloads/${config.workspaceId}/lifecycle`, {
      ...e,
      signature,
    });
  };
  const repositoryRoot = `/workspace/repositories/${config.repositoryId}`;
  const env: Record<string, string> = {
    PATH: "/usr/local/bin:/usr/bin:/bin",
    HOME: "/var/empty",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ALLOW_PROTOCOL:
      new URL(config.backendOrigin).protocol === "http:" ? "http:https" : "https",
  };
  try {
    await mkdir("/workspace/repositories", { recursive: true });
    // One immutable remote target: a scoped, read-only Athena Git broker.
    const remote = new URL(
      `/api/cloud-workloads/${config.workspaceId}/git`,
      config.backendOrigin,
    ).href;
    const authEnv = {
      ...env,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: `http.${config.backendOrigin}.extraHeader`,
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`${config.workerId}:${config.token}`).toString("base64")}`,
    };
    try {
      await git(
        [
          "clone",
          "--no-checkout",
          "--no-recurse-submodules",
          "--",
          remote,
          repositoryRoot,
        ],
        authEnv,
      );
    } finally {
      authEnv.GIT_CONFIG_VALUE_0 = "";
    }
    // Do not retain the broker credential or any GitHub credential on disk.
    config.token = "";
    if ((await realpath(repositoryRoot)) !== repositoryRoot)
      throw Error("Canonical repository root denied.");
    await git(
      ["-C", repositoryRoot, "checkout", "-B", config.defaultBranch, config.baseCommit],
      env,
    );
    const head = await git(["-C", repositoryRoot, "rev-parse", "HEAD"], env);
    if (head !== config.baseCommit)
      throw Error("Expected repository head unavailable.");
    const tree = await git(["-C", repositoryRoot, "status", "--porcelain"], env);
    if (tree) throw Error("Prepared checkout is dirty.");
    // Use the exact registered default branch, resolved by the server.
    await lifecycle({ operation: "repository_ready", head });
  } catch {
    config.token = "";
    await lifecycle({ operation: "failure", code: "REPO_FAILED" }).catch(
      () => undefined,
    );
    throw Error("Repository preparation failed closed.");
  }
  const runtime = new NativeEngineeringRuntime(
    "/workspace/worktrees",
    new DockerEngineeringRunner("/usr/bin/docker", ec2),
    new DockerEngineeringDependencyRunner("/usr/bin/docker", ec2),
    "/usr/bin/docker",
    ec2,
  );
  const worker = new CloudEngineeringWorker({
    apiBaseUrl: config.backendOrigin,
    deviceId: config.workerId,
    companyId: config.companyId,
    serverPublicKeyX: config.serverPublicKeyX,
    identity,
    repositoryRoot,
    workspaceLocatorId: config.workspaceLocatorId,
    repositoryId: config.repositoryId,
    runtime,
    ...(ec2
      ? {
          onAuthorizedWork: () => {
            writeFileSync(
              "/run/athena/activity.json.next",
              JSON.stringify({ at: new Date().toISOString() }),
              { mode: 0o600, flag: "wx" },
            );
            renameSync("/run/athena/activity.json.next", "/run/athena/activity.json");
          },
        }
      : {}),
  });
  const gate = createCloudPreviewGate(
    {
      workspaceId: config.workspaceId,
      companyId: config.companyId,
      generation: config.generation,
    },
    readCloudPreviewGrant,
  );
  if (config.previewEnabled) gate.listen(8080, "0.0.0.0");
  let lastSuccess = Date.now();
  let stopped = false;
  const stop = () => {
    stopped = true;
    clearInterval(heartbeat);
    clearTimeout(expiry);
    worker.stop();
    if (gate.listening) gate.close();
  };
  const heartbeat = setInterval(() => {
    if (stopped) return;
    void lifecycle({ operation: "heartbeat" })
      .then(() => {
        lastSuccess = Date.now();
      })
      .catch(() => {
        if (Date.now() - lastSuccess > 45_000) stop();
      });
  }, 10_000);
  heartbeat.unref();
  const expiry = setTimeout(stop, config.limits.runtimeSeconds * 1000);
  expiry.unref();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  worker.start();
}
startProvisionedWorker().catch(() => {
  process.stderr.write("Provisioned Engineering worker failed closed.\n");
  process.exitCode = 1;
});
