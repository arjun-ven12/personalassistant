import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CloudWorkspaceRecordSchema,
  CLOUD_ENGINEERING_LIMITS,
  Ed25519PublicKeySchema,
  canonicalizeCloudWorkloadProof,
} from "@alexa-control/shared";
import {
  createIsolatedTestDatabase,
  safeTestDatabaseUrl,
} from "../persistence/test-database.js";
import { PostgresIdentityStore } from "../identity/postgres-store.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { InMemoryEngineeringRuntimeStore } from "../engineering-runtime/store.js";
import type { EngineeringGitHubService } from "./github.js";
import { PostgresCloudWorkspaceStore } from "./workspace-store.js";
import { WorkspaceProvisioningService } from "./provisioning.js";
import { createHash } from "node:crypto";
import type { CloudWorkspaceProvider } from "./provider.js";
const url = safeTestDatabaseUrl();
describe.skipIf(!url)("durable cloud workspace and workload bootstrap", () => {
  let isolated: Awaited<ReturnType<typeof createIsolatedTestDatabase>>;
  let store: PostgresCloudWorkspaceStore;
  const owner = crypto.randomUUID(),
    company = crypto.randomUUID(),
    repository = crypto.randomUUID(),
    workspace = crypto.randomUUID(),
    at = "2026-10-03T00:00:00.000Z",
    token = "a".repeat(43);
  const record = CloudWorkspaceRecordSchema.parse({
    schemaVersion: "1",
    id: workspace,
    ownerId: owner,
    companyId: company,
    registrationId: crypto.randomUUID(),
    repositoryId: repository,
    workspaceLocatorId: `cloud.${repository}`,
    workerId: crypto.randomUUID(),
    generation: 1,
    state: "BOOTING",
    provider: "test-only",
    providerResourceId: "test-vm",
    requestDigest: "a".repeat(64),
    version: 0,
    limits: CLOUD_ENGINEERING_LIMITS,
    credentialExpiresAt: "2026-10-03T00:03:00.000Z",
    bootstrapHash: createHash("sha256").update(token).digest("hex"),
    authenticatedAt: null,
    lastHeartbeatAt: null,
    expiresAt: "2026-10-03T01:00:00.000Z",
    failure: null,
    baseCommit: "a".repeat(40),
    milestones: { WORKER_REQUESTED: at },
    usage: null,
    createdAt: at,
    updatedAt: at,
  });
  beforeAll(async () => {
    isolated = await createIsolatedTestDatabase(url!, "cloud284a");
    const pool = isolated.database.pool;
    await pool.query(
      "INSERT INTO owners(id,email,password_hash,record,created_at,updated_at) VALUES($1,$2,'test-only',$3,$4,$4)",
      [owner, `cloud-${owner}@example.test`, { id: owner }, at],
    );
    await pool.query(
      "INSERT INTO companies(id,owner_id,slug,name,status,timezone,default_currency,record,created_at,updated_at) VALUES($1,$2,'cloud-test','Cloud Test','ACTIVE','UTC','USD',$3,$4,$4)",
      [company, owner, { id: company, ownerId: owner }, at],
    );
    store = new PostgresCloudWorkspaceStore(pool);
  }, 30_000);
  afterAll(async () => {
    await isolated?.cleanup();
  });
  it("claims one canonical repository across concurrent clients and rejects stale or cross-company writes", async () => {
    const claims = await Promise.all([
      store.create(record),
      store.create(record),
      store.create(record),
    ]);
    expect(claims.filter((v) => v.inserted)).toHaveLength(1);
    expect(await store.find(owner, crypto.randomUUID(), workspace)).toBeUndefined();
    expect(
      await store.save({ ...record, companyId: crypto.randomUUID(), version: 1 }, 0),
    ).toBe(false);
    expect(await store.reconciliationCandidates(100)).toHaveLength(1);
  });
  it("authenticates a real signed proof with PostgreSQL nonce foreign keys and denies replay", async () => {
    const identities = new PostgresIdentityStore(isolated.database.pool);
    const service = new WorkspaceProvisioningService(
      store,
      {} as CloudWorkspaceProvider,
      {} as EngineeringGitHubService,
      new InMemoryEngineeringRuntimeStore(),
      new InMemoryGovernanceStore([], false),
      identities,
      {
        ownerId: owner,
        companyId: company,
        backendOrigin: "http://personalassistant.railway.internal:3001/",
        serverPublicKeyX: "a".repeat(43),
        commandProfileId: "test",
        capabilityProfileId: "test",
        authorizedAgentIds: [owner],
      },
      () => new Date(at),
    );
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
    const proof = {
      workspaceId: workspace,
      companyId: company,
      repositoryId: repository,
      workerId: record.workerId,
      generation: 1,
      backendOrigin: service.config.backendOrigin,
      capability: "engineering.repository_capability" as const,
      publicKey,
      issuedAt: at,
      nonce: crypto.randomUUID(),
    };
    const signature = Buffer.from(
      await webcrypto.subtle.sign(
        "Ed25519",
        pair.privateKey,
        new TextEncoder().encode(canonicalizeCloudWorkloadProof(proof)),
      ),
    ).toString("base64url");
    expect((await service.authenticate({ ...proof, signature }, token)).state).toBe(
      "AUTHENTICATING",
    );
    expect((await identities.findDeviceById(record.workerId))?.trustStatus).toBe(
      "PENDING",
    );
    await expect(
      service.authenticate({ ...proof, signature }, token),
    ).rejects.toThrow();
    expect(await store.save({ ...record, version: 1 }, 0)).toBe(false);
  });
});
