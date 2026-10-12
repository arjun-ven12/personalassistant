import { describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  canonicalizeCloudWorkloadProof,
  Ed25519PublicKeySchema,
} from "@alexa-control/shared";
import { WorkspaceProvisioningService } from "./provisioning.js";
import { InMemoryCloudWorkspaceStore } from "./workspace-store.js";
import { InMemoryEngineeringRuntimeStore } from "../engineering-runtime/store.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { InMemoryIdentityStore } from "../identity/store.js";
import { InMemoryEngineeringGitHubStore } from "./github-store.js";
import type { EngineeringGitHubService } from "./github.js";
import type { CloudWorkspaceProvider, WorkspaceProvisionRequest } from "./provider.js";
const owner = crypto.randomUUID(),
  company = crypto.randomUUID(),
  registrationId = crypto.randomUUID(),
  credential = crypto.randomUUID(),
  base = "a".repeat(40),
  at = "2026-10-03T00:00:00.000Z";
function fixture() {
  const store = new InMemoryCloudWorkspaceStore(),
    runtime = new InMemoryEngineeringRuntimeStore(),
    governance = new InMemoryGovernanceStore([], false),
    identities = new InMemoryIdentityStore(),
    githubStore = new InMemoryEngineeringGitHubStore();
  let clock = new Date(at);
  const registration = {
    schemaVersion: "1" as const,
    id: registrationId,
    ownerId: owner,
    companyId: company,
    credentialReferenceId: credential,
    repository: {
      provider: "github" as const,
      providerRepositoryId: 42,
      owner: "owner",
      name: "site",
      fullName: "owner/site",
      defaultBranch: "main",
      private: true,
      archived: false,
      disabled: false,
      permissions: { pull: true, push: true, admin: true },
    },
    engineeringRepositoryId: null,
    status: "ACTIVE" as const,
    createdAt: at,
    updatedAt: at,
  };
  githubStore.create(registration);
  vi.spyOn(runtime, "findCommandProfile").mockResolvedValue({
    status: "ACTIVE",
  } as never);
  const provider = {
    id: "fake-for-test",
    provision: vi.fn<CloudWorkspaceProvider["provision"]>(
      (_input: WorkspaceProvisionRequest) => {
        void _input;
        return Promise.resolve({
          resourceId: "test-resource",
          state: "RUNNING" as const,
        });
      },
    ),
    reconcile: vi.fn(() => Promise.resolve(null)),
    getStatus: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    getUsage: vi.fn(),
    getConnectionInfo: vi.fn(),
  } satisfies CloudWorkspaceProvider;
  const github = {
    store: githubStore,
    requireRegistration: vi.fn(() =>
      Promise.resolve({
        registration,
        repository: registration.repository,
      }),
    ),
    expectedCommit: vi.fn(() => Promise.resolve(base)),
  } as unknown as EngineeringGitHubService;
  const service = new WorkspaceProvisioningService(
    store,
    provider,
    github,
    runtime,
    governance,
    identities,
    {
      ownerId: owner,
      companyId: company,
      backendOrigin: "https://athena.example/",
      serverPublicKeyX: "a".repeat(43),
      commandProfileId: "reviewed",
      capabilityProfileId: "reviewed",
      authorizedAgentIds: [crypto.randomUUID()],
    },
    () => clock,
  );
  const prepare = () => service.prepare(owner, company, registrationId);
  async function handshake(
    v: Awaited<ReturnType<typeof prepare>>,
    overrides: Record<string, unknown> = {},
  ) {
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
      workspaceId: v.id,
      companyId: company,
      repositoryId: v.repositoryId,
      workerId: v.workerId,
      generation: v.generation,
      backendOrigin: service.config.backendOrigin,
      capability: "engineering.repository_capability" as const,
      publicKey,
      issuedAt: clock.toISOString(),
      nonce: crypto.randomUUID(),
      ...overrides,
    };
    const signature = Buffer.from(
      await webcrypto.subtle.sign(
        "Ed25519",
        pair.privateKey,
        new TextEncoder().encode(canonicalizeCloudWorkloadProof(proof)),
      ),
    ).toString("base64url");
    return { ...proof, signature };
  }
  return {
    store,
    runtime,
    governance,
    identities,
    provider,
    github,
    githubStore,
    service,
    prepare,
    handshake,
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
    token: () => provider.provision.mock.calls[0]![0].bootstrap.token,
  };
}
describe("durable cloud infrastructure authority", () => {
  it("keeps a running provider below READY until authentication and exact repo proof", async () => {
    const f = fixture();
    const v = await f.prepare();
    expect(v.state).toBe("BOOTING");
    expect(f.runtime.findRepository(owner, company, v.repositoryId)?.status).toBe(
      "INITIALIZING",
    );
    const auth = await f.service.authenticate(await f.handshake(v), f.token());
    expect(auth.state).toBe("AUTHENTICATING");
    expect(f.identities.findDeviceById(v.workerId)?.trustStatus).toBe("PENDING");
    const ready = await f.service.repositoryReady(auth, base);
    expect(ready.state).toBe("READY");
    expect(ready.bootstrapHash).toBeNull();
    expect(f.identities.findDeviceById(v.workerId)?.trustStatus).toBe("TRUSTED");
    expect(f.runtime.listRepositories(owner, company)).toHaveLength(1);
  });
  it("does not promote a signed worker when provider containment proof fails", async () => {
    const f = fixture(),
      v = await f.prepare();
    const auth = await f.service.authenticate(await f.handshake(v), f.token());
    f.service.provider.attest = vi.fn(() => Promise.reject(Error("containment unavailable")));
    await expect(f.service.repositoryReady(auth, base)).rejects.toThrow(
      "containment unavailable",
    );
    expect(f.identities.findDeviceById(v.workerId)?.trustStatus).toBe("PENDING");
    expect((await f.store.find(owner, company, v.id))?.state).toBe("AUTHENTICATING");
  });
  it("uses one canonical repo and durable provision claim under concurrent retries", async () => {
    const f = fixture();
    const values = await Promise.all([f.prepare(), f.prepare(), f.prepare()]);
    expect(new Set(values.map((v) => v.repositoryId)).size).toBe(1);
    expect(f.provider.provision).toHaveBeenCalledTimes(1);
    expect(f.runtime.listRepositories(owner, company)).toHaveLength(1);
  });
  it("reconciles uncertain creates without blindly issuing another provision", async () => {
    const f = fixture();
    f.provider.provision.mockRejectedValueOnce(Error("timeout"));
    const v = await f.prepare();
    expect(v.failure).toBe("PROVISION_UNCERTAIN");
    expect((await f.prepare()).id).toBe(v.id);
    expect(f.provider.provision).toHaveBeenCalledTimes(1);
  });
  it.each(["companyId", "repositoryId", "workspaceId", "workerId"])(
    "rejects wrong %s workload binding",
    async (field) => {
      const f = fixture();
      const v = await f.prepare();
      await expect(
        f.service.authenticate(
          await f.handshake(v, { [field]: crypto.randomUUID() }),
          f.token(),
        ),
      ).rejects.toThrow();
      expect(f.identities.listDevices(owner)).toHaveLength(0);
    },
  );
  it("denies stale proof, expired credential and wrong backend", async () => {
    for (const override of [
      { issuedAt: "2026-09-01T00:00:00.000Z" },
      { backendOrigin: "https://other.example/" },
      { generation: 2 },
    ]) {
      const f = fixture();
      const v = await f.prepare();
      await expect(
        f.service.authenticate(await f.handshake(v, override), f.token()),
      ).rejects.toThrow();
    }
    const f = fixture();
    const v = await f.prepare();
    f.advance(181_000);
    await expect(
      f.service.authenticate(await f.handshake(v), f.token()),
    ).rejects.toThrow("credential");
  });
  it("denies identity replay and broader capabilities", async () => {
    const f = fixture();
    const v = await f.prepare();
    const proof = await f.handshake(v);
    await f.service.authenticate(proof, f.token());
    await expect(f.service.authenticate(proof, f.token())).rejects.toThrow();
    const g = fixture();
    const w = await g.prepare();
    await expect(
      g.service.authenticate(
        await g.handshake(w, { capability: "native.provider_capability" }),
        g.token(),
      ),
    ).rejects.toThrow();
  });
  it("denies unapproved commit and revoked GitHub access before READY", async () => {
    const f = fixture();
    const v = await f.prepare();
    const auth = await f.service.authenticate(await f.handshake(v), f.token());
    await expect(f.service.repositoryReady(auth, "b".repeat(40))).rejects.toThrow(
      "proof",
    );
    vi.spyOn(f.github, "requireRegistration").mockRejectedValueOnce(Error("revoked"));
    await expect(f.service.repositoryReady(auth, base)).rejects.toThrow("revoked");
    expect(f.identities.findDeviceById(v.workerId)?.trustStatus).toBe("PENDING");
  });
  it("detects authentication timeout and lost lease without replaying task mutations", async () => {
    const f = fixture();
    const v = await f.prepare();
    f.advance(181_000);
    expect((await f.service.reconcile(v)).failure).toBe("AUTHENTICATION_TIMEOUT");
    const g = fixture();
    const w = await g.prepare();
    const auth = await g.service.authenticate(await g.handshake(w), g.token());
    const ready = await g.service.repositoryReady(auth, base);
    g.advance(46_000);
    expect((await g.service.reconcile(ready)).failure).toBe("WORKER_LOST");
    expect(g.identities.findDeviceById(w.workerId)?.trustStatus).toBe("REVOKED");
    expect(g.provider.provision).toHaveBeenCalledTimes(1);
  });
  it("preserves durable state and revokes execution when provider destruction fails", async () => {
    const f = fixture();
    const v = await f.prepare();
    f.provider.destroy.mockRejectedValueOnce(Error("provider unavailable"));
    const failed = await f.service.destroy(v);
    expect(failed.failure).toBe("CLEANUP_FAILED");
    expect((await f.store.find(owner, company, v.id))?.state).toBe("SUSPENDING");
  });
  it("keeps tenant reads isolated and rejects stale compare-and-swap", async () => {
    const f = fixture();
    const v = await f.prepare();
    expect(await f.store.find(owner, crypto.randomUUID(), v.id)).toBeUndefined();
    expect(await f.store.save({ ...v, version: v.version + 1 }, v.version - 1)).toBe(
      false,
    );
    await expect(
      f.service.prepare(owner, crypto.randomUUID(), registrationId),
    ).rejects.toThrow("scope");
  });
  it("never persists the raw bootstrap secret", async () => {
    const f = fixture();
    const v = await f.prepare();
    expect(JSON.stringify(await f.store.find(owner, company, v.id))).not.toContain(
      f.token(),
    );
  });
});

describe("provider boot ordering and revocation", () => {
  it("persists BOOTING before a fast worker authenticates and preserves its READY state", async () => {
    const f = fixture();
    f.provider.provision.mockImplementation(async (_input, onBooting) => {
      const result = { resourceId: "test-resource", state: "RUNNING" as const };
      await onBooting?.(result);
      const v = await f.store.findByRepository(owner, company, _input.repositoryId);
      expect(v?.state).toBe("BOOTING");
      const auth = await f.service.authenticate(await f.handshake(v!), f.token());
      await f.service.repositoryReady(auth, base);
      return result;
    });
    expect((await f.prepare()).state).toBe("READY");
  });
  it("revokes a worker when the reviewed company provider binding is revoked", async () => {
    const f = fixture();
    const v = await f.prepare();
    const auth = await f.service.authenticate(await f.handshake(v), f.token());
    const ready = await f.service.repositoryReady(auth, base);
    vi.spyOn(f.service, "authorizeProvider").mockRejectedValue(Error("revoked"));
    await expect(f.service.heartbeat(ready)).rejects.toThrow("revoked");
    expect((await f.service.reconcile(ready)).failure).toBe("PROVIDER_UNAVAILABLE");
    expect(f.identities.findDeviceById(v.workerId)?.trustStatus).toBe("REVOKED");
  });
});
