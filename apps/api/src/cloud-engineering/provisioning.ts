import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  CloudBackendOriginSchema,
  canonicalizeCloudWorkloadProof,
  AllowedWorkspaceSchema,
  BLOCKED_WORKSPACE_PATTERNS,
  CLOUD_ENGINEERING_LIMITS,
  CloudWorkspaceRecordSchema,
  CloudWorkloadHandshakeSchema,
  EngineeringRepositorySchema,
  RegisteredDeviceSchema,
  type CloudWorkspaceRecord,
  type CloudMilestone,
} from "@alexa-control/shared";
import { fingerprintPublicKey, verifyEd25519Signature } from "../identity/crypto.js";
import type { IdentityStore } from "../identity/store.js";
import type { GovernanceStore } from "../governance/store.js";
import type { EngineeringRuntimeStore } from "../engineering-runtime/store.js";
import type { EngineeringGitHubService } from "./github.js";
import type { CloudWorkspaceStore } from "./workspace-store.js";
import type { CloudWorkspaceProvider } from "./provider.js";
import { companyScope } from "../companies/scope.js";
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
const stableId = (v: string) => {
  const h = digest(v);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export const CloudCompanyConfigurationSchema = z
  .object({
    ownerId: z.string().uuid(),
    companyId: z.string().uuid(),
    backendOrigin: CloudBackendOriginSchema,
    serverPublicKeyX: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    commandProfileId: z.string().min(1).max(128),
    capabilityProfileId: z.string().min(1).max(128),
    authorizedAgentIds: z.array(z.string().uuid()).min(1).max(100),
  })
  .strict();
export type CloudCompanyConfiguration = z.infer<typeof CloudCompanyConfigurationSchema>;
/** Invoked only after the finite prepare_workspace Tool Gateway authority. */
export class WorkspaceProvisioningService {
  constructor(
    readonly store: CloudWorkspaceStore,
    readonly provider: CloudWorkspaceProvider,
    readonly github: EngineeringGitHubService,
    readonly runtime: EngineeringRuntimeStore,
    readonly governance: GovernanceStore,
    readonly identities: IdentityStore,
    readonly config: CloudCompanyConfiguration,
    readonly now: () => Date = () => new Date(),
    readonly authorizeProvider: () => Promise<void> = () => Promise.resolve(),
  ) {
    CloudCompanyConfigurationSchema.parse(config);
  }
  private scope(owner: string, company: string) {
    if (owner !== this.config.ownerId || company !== this.config.companyId)
      throw Error("Cloud workspace company scope denied.");
  }
  async prepare(owner: string, company: string, registrationId: string) {
    this.scope(owner, company);
    await this.authorizeProvider();
    if ((await this.governance.getSecurityState()).emergencyStopActive)
      throw Error("Emergency stop is active.");
    const registration = (await this.github.store.list(owner, company)).find(
      (v) => v.id === registrationId,
    );
    if (!registration) throw Error("Authorized GitHub registration unavailable.");
    const checked = await this.github.requireRegistration(
      owner,
      company,
      registration.repository.providerRepositoryId,
    );
    const profile = await this.runtime.findCommandProfile(
      owner,
      company,
      this.config.commandProfileId,
    );
    if (!profile || profile.status !== "ACTIVE")
      throw Error("Reviewed cloud command profile unavailable.");
    const repositoryId =
      registration.engineeringRepositoryId ??
      stableId(`${owner}:${company}:${registration.id}`);
    const existing = await this.store.findByRepository(owner, company, repositoryId);
    if (existing) return this.reconcile(existing);
    const baseCommit = await this.github.expectedCommit(
      owner,
      company,
      registration.repository.providerRepositoryId,
    );
    const at = this.now();
    const token = randomBytes(32).toString("base64url");
    const value = CloudWorkspaceRecordSchema.parse({
      schemaVersion: "1",
      id: stableId(`cloud:${owner}:${company}:${registration.id}`),
      ownerId: owner,
      companyId: company,
      registrationId,
      repositoryId,
      workspaceLocatorId: `cloud.${repositoryId}`,
      workerId: crypto.randomUUID(),
      generation: 1,
      state: "PROVISIONING",
      provider: this.provider.id,
      providerResourceId: null,
      requestDigest: digest(
        JSON.stringify({
          registrationId,
          repositoryId,
          baseCommit,
          limits: CLOUD_ENGINEERING_LIMITS,
        }),
      ),
      version: 0,
      limits: CLOUD_ENGINEERING_LIMITS,
      credentialExpiresAt: new Date(at.getTime() + 180_000).toISOString(),
      bootstrapHash: digest(token),
      authenticatedAt: null,
      lastHeartbeatAt: null,
      expiresAt: new Date(at.getTime() + 3_600_000).toISOString(),
      failure: null,
      baseCommit,
      milestones: { WORKER_REQUESTED: at.toISOString() },
      usage: null,
      createdAt: at.toISOString(),
      updatedAt: at.toISOString(),
    });
    const claim = await this.store.create(value);
    if (!claim.inserted) return this.reconcile(claim.value);
    // Canonical IDs are deterministic, even across crash/retry. No duplicate repo.
    const repo = await this.runtime.findRepository(owner, company, repositoryId);
    if (
      repo &&
      (repo.workspaceLocatorId !== value.workspaceLocatorId ||
        repo.ownerId !== owner ||
        repo.companyId !== company)
    )
      throw Error("Canonical repository linkage conflict.");
    if (!repo)
      await this.runtime.saveRepository(
        EngineeringRepositorySchema.parse({
          schemaVersion: "1",
          id: repositoryId,
          ownerId: owner,
          companyId: company,
          displayName: checked.repository.fullName,
          workspaceLocatorId: value.workspaceLocatorId,
          defaultBranch: checked.repository.defaultBranch,
          protectedBranches: [checked.repository.defaultBranch],
          protectedPaths: [...BLOCKED_WORKSPACE_PATTERNS],
          generatedPaths: ["dist/**", "build/**"],
          commandProfileId: this.config.commandProfileId,
          capabilityProfileId: this.config.capabilityProfileId,
          authorizedAgentIds: this.config.authorizedAgentIds,
          metadata: {
            languages: [],
            packageManagers: [],
            frameworks: [],
            importantFiles: [],
          },
          status: "INITIALIZING",
          createdAt: value.createdAt,
          updatedAt: value.createdAt,
        }),
      );
    await this.github.store.save({
      ...registration,
      engineeringRepositoryId: repositoryId,
      updatedAt: value.createdAt,
    });
    try {
      const result = await this.provider.provision(
        {
          workspaceId: value.id,
          ownerId: owner,
          companyId: company,
          repositoryId,
          workerId: value.workerId,
          generation: value.generation,
          limits: value.limits,
          bootstrap: {
            backendOrigin: this.config.backendOrigin,
            token,
            expiresAt: value.credentialExpiresAt,
            serverPublicKeyX: this.config.serverPublicKeyX,
            baseCommit,
            defaultBranch: checked.repository.defaultBranch,
            workspaceLocatorId: value.workspaceLocatorId,
          },
        },
        async (result) => {
          await this.update(value, {
            providerResourceId: result.resourceId,
            state: "BOOTING",
            milestones: {
              ...value.milestones,
              PROVIDER_PROVISIONED: this.now().toISOString(),
            },
          });
        },
      );
      const current = await this.store.find(owner, company, value.id);
      if (!current) throw Error("Durable cloud workspace unavailable.");
      if (current.state !== "PROVISIONING") return current;
      return await this.update(current, {
        providerResourceId: result.resourceId,
        state: "BOOTING",
        milestones: {
          ...value.milestones,
          PROVIDER_PROVISIONED: this.now().toISOString(),
        },
      });
    } catch {
      const current = await this.store.find(owner, company, value.id);
      if (!current) throw Error("Durable cloud workspace unavailable.");
      if (["READY", "BUSY", "AUTHENTICATING"].includes(current.state)) return current;
      return this.update(current, { failure: "PROVISION_UNCERTAIN" });
    }
  }
  async update(value: CloudWorkspaceRecord, patch: Partial<CloudWorkspaceRecord>) {
    const next = CloudWorkspaceRecordSchema.parse({
      ...value,
      ...patch,
      version: value.version + 1,
      updatedAt: this.now().toISOString(),
    });
    if (!(await this.store.save(next, value.version)))
      throw Error("Cloud workspace changed; reconcile before retry.");
    return next;
  }
  async reconcile(value: CloudWorkspaceRecord) {
    this.scope(value.ownerId, value.companyId);
    try {
      await this.authorizeProvider();
    } catch {
      await this.revokeWorker(value);
      return this.update(value, {
        state: "FAILED",
        failure: "PROVIDER_UNAVAILABLE",
        bootstrapHash: null,
      });
    }
    if (
      ["BOOTING", "AUTHENTICATING"].includes(value.state) &&
      value.credentialExpiresAt <= this.now().toISOString()
    ) {
      await this.revokeWorker(value);
      return this.update(value, {
        state: "FAILED",
        failure: "AUTHENTICATION_TIMEOUT",
        bootstrapHash: null,
      });
    }
    if (
      ["READY", "BUSY"].includes(value.state) &&
      value.lastHeartbeatAt &&
      this.now().getTime() - Date.parse(value.lastHeartbeatAt) > 45_000
    ) {
      await this.revokeWorker(value);
      return this.update(value, {
        state: "FAILED",
        failure: "WORKER_LOST",
        bootstrapHash: null,
      });
    }
    const found = await this.provider.reconcile({
      workspaceId: value.id,
      companyId: value.companyId,
      generation: value.generation,
    });
    if (!found) return value; // Absence after uncertain create does not authorize a second create.
    if (value.providerResourceId && value.providerResourceId !== found.resourceId)
      throw Error("Cloud resource identity conflict.");
    if (value.state === "PROVISIONING")
      return this.update(value, {
        providerResourceId: found.resourceId,
        state: "BOOTING",
        failure: null,
        milestones: {
          ...value.milestones,
          PROVIDER_PROVISIONED: this.now().toISOString(),
        },
      });
    if (
      ["FAILED", "DESTROYED", "STOPPED"].includes(found.state) &&
      ["READY", "BUSY", "BOOTING", "AUTHENTICATING"].includes(value.state)
    ) {
      await this.revokeWorker(value);
      return this.update(value, { state: "FAILED", failure: "WORKER_LOST" });
    }
    return value;
  }
  async bootstrapCredential(workspaceId: string, token: string) {
    await this.authorizeProvider();
    const value = await this.store.find(
      this.config.ownerId,
      this.config.companyId,
      workspaceId,
    );
    const hash = digest(token);
    if (
      !value?.bootstrapHash ||
      !timingSafeEqual(Buffer.from(value.bootstrapHash), Buffer.from(hash)) ||
      this.now().toISOString() >= value.credentialExpiresAt ||
      !["BOOTING", "AUTHENTICATING"].includes(value.state) ||
      this.now().toISOString() >= value.expiresAt
    )
      throw Error("Workload credential denied.");
    if ((await this.governance.getSecurityState()).emergencyStopActive)
      throw Error("Emergency stop is active.");
    return value;
  }
  async authenticate(raw: unknown, token: string) {
    const h = CloudWorkloadHandshakeSchema.parse(raw);
    const value = await this.bootstrapCredential(h.workspaceId, token);
    if (
      value.state !== "BOOTING" ||
      value.authenticatedAt ||
      h.companyId !== value.companyId ||
      h.repositoryId !== value.repositoryId ||
      h.workerId !== value.workerId ||
      h.generation !== value.generation ||
      h.backendOrigin !== this.config.backendOrigin ||
      Math.abs(this.now().getTime() - Date.parse(h.issuedAt)) > 30_000
    )
      throw Error("Workload identity scope or freshness denied.");
    const { signature, ...proof } = h;
    if (
      !(await verifyEd25519Signature(
        h.publicKey,
        canonicalizeCloudWorkloadProof(proof),
        signature,
      ))
    )
      throw Error("Workload signature denied.");
    const at = this.now().toISOString();
    const claimed = await this.update(value, {
      state: "AUTHENTICATING",
      authenticatedAt: null,
    });
    const device = RegisteredDeviceSchema.parse({
      id: h.workerId,
      deviceName: "Cloud Engineering workload",
      deviceType: "CLOUD_WORKER",
      trustStatus: "PENDING",
      publicKey: h.publicKey,
      fingerprint: fingerprintPublicKey(h.publicKey),
      pairedAt: at,
      lastSeen: at,
      revokedAt: null,
      ownerId: value.ownerId,
      createdAt: at,
      capabilities: [],
      metadata: {
        companyId: value.companyId,
        repositoryId: value.repositoryId,
        workspaceLocatorId: value.workspaceLocatorId,
        executionScope: "ENGINEERING_ONLY",
        cloudWorkspaceId: value.id,
        generation: value.generation,
        workloadExpiresAt: value.expiresAt,
      },
    });
    await this.identities.createDevice({
      ...device,
      pairingRequestTokenHash: "server-workload-no-pairing",
    });
    if (
      !(await this.identities.consumeNonce(
        h.workerId,
        h.nonce,
        new Date(value.credentialExpiresAt),
        this.now(),
      ))
    )
      throw Error("Workload identity replay denied.");
    const authenticated = await this.update(claimed, {
      authenticatedAt: at,
      milestones: { ...claimed.milestones, WORKER_AUTHENTICATED: at },
    });
    await this.audit(
      authenticated,
      "Workload authenticated with exact Engineering scope.",
    );
    return authenticated;
  }
  async repositoryReady(value: CloudWorkspaceRecord, head: string) {
    await this.authorizeProvider();
    if (
      value.state !== "AUTHENTICATING" ||
      head !== value.baseCommit ||
      !value.authenticatedAt
    )
      throw Error("Repository preparation proof denied.");
    if (this.provider.attest) {
      if (!value.providerResourceId)
        throw Error("Provider resource evidence unavailable.");
      const proof = await this.provider.attest(value.providerResourceId, {
        companyId: value.companyId,
        workspaceId: value.id,
        repositoryId: value.repositoryId,
        workerId: value.workerId,
        generation: value.generation,
      });
      await this.identities.appendAudit({
        eventType: "CLOUD_WORKSPACE_LIFECYCLE",
        userId: value.ownerId,
        companyId: value.companyId,
        deviceId: value.workerId,
        ipAddress: "cloud-workload",
        outcome: "SUCCESS",
        reason: "Provider containment verified before worker trust.",
        requestId: value.id,
        metadata: {
          workspaceId: value.id,
          generation: value.generation,
          provider: this.provider.id,
          resourceId: value.providerResourceId,
          evidence: z.json().parse(proof),
        },
      });
    }
    const registration = (
      await this.github.store.list(value.ownerId, value.companyId)
    ).find((v) => v.id === value.registrationId);
    if (!registration) throw Error("Repository registration missing.");
    await this.github.requireRegistration(
      value.ownerId,
      value.companyId,
      registration.repository.providerRepositoryId,
    );
    const repo = await this.runtime.findRepository(
      value.ownerId,
      value.companyId,
      value.repositoryId,
    );
    const device = await this.identities.findDeviceById(value.workerId);
    if (!repo || !device || device.trustStatus !== "PENDING")
      throw Error("Canonical repository or worker unavailable.");
    await companyScope.run(
      {
        ownerId: value.ownerId,
        companyId: value.companyId,
        role: "OWNER",
        requestId: value.id,
      },
      async () => {
        const old = await this.governance.findWorkspaceById(value.workspaceLocatorId);
        const workspace = AllowedWorkspaceSchema.parse({
          id: value.workspaceLocatorId,
          ownerId: value.ownerId,
          displayName: "Cloud Engineering repository",
          rootPath: `/workspace/repositories/${value.repositoryId}`,
          enabled: true,
          permissions: {
            read: true,
            write: true,
            createFile: true,
            modifyFile: true,
            moveFile: false,
            deleteFile: false,
            runScripts: false,
          },
          blockedPatterns: BLOCKED_WORKSPACE_PATTERNS,
          allowedScripts: [],
          gitPermissions: {
            status: true,
            diff: true,
            createBranch: true,
            commit: true,
            push: false,
          },
          createdAt: value.createdAt,
          updatedAt: this.now().toISOString(),
        });
        if (
          old &&
          (old.ownerId !== workspace.ownerId || old.rootPath !== workspace.rootPath)
        )
          throw Error("Registered workspace conflict.");
        if (!old) await this.governance.createWorkspace(workspace);
      },
    );
    await this.runtime.saveRepository({
      ...repo,
      status: "ACTIVE",
      updatedAt: this.now().toISOString(),
    });
    const ready = await this.update(value, {
      state: "READY",
      bootstrapHash: null,
      lastHeartbeatAt: this.now().toISOString(),
      milestones: { ...value.milestones, REPO_READY: this.now().toISOString() },
    });
    await this.audit(
      ready,
      "Cloud workspace ready after authenticated worker and exact commit preparation.",
    );
    await this.identities.updateDevice({ ...device, trustStatus: "TRUSTED" });
    return ready;
  }
  async refreshUsage(value: CloudWorkspaceRecord) {
    this.scope(value.ownerId, value.companyId);
    if (!value.providerResourceId) return value;
    const usage = await this.provider.getUsage(value.providerResourceId);
    return this.update(value, { usage });
  }
  async recordMilestone(value: CloudWorkspaceRecord, milestone: CloudMilestone) {
    return this.update(value, {
      milestones: {
        ...value.milestones,
        [milestone]: value.milestones[milestone] ?? this.now().toISOString(),
      },
    });
  }
  async heartbeat(value: CloudWorkspaceRecord) {
    await this.authorizeProvider();
    if (
      !["READY", "BUSY"].includes(value.state) ||
      this.now().toISOString() >= value.expiresAt
    )
      throw Error("Worker lease expired.");
    return this.update(value, { lastHeartbeatAt: this.now().toISOString() });
  }
  async revokeWorker(value: CloudWorkspaceRecord) {
    const d = await this.identities.findDeviceById(value.workerId);
    if (d && d.ownerId === value.ownerId)
      await this.identities.updateDevice({
        ...d,
        trustStatus: "REVOKED",
        revokedAt: this.now().toISOString(),
      });
  }
  async destroy(value: CloudWorkspaceRecord) {
    await this.revokeWorker(value);
    const claimed = await this.update(value, {
      state: "SUSPENDING",
      bootstrapHash: null,
    });
    try {
      if (value.providerResourceId) {
        await this.provider.stop(value.providerResourceId);
        await this.provider.destroy(value.providerResourceId);
      }
      return await this.update(claimed, { state: "DESTROYED", failure: null });
    } catch {
      return this.update(claimed, { failure: "CLEANUP_FAILED" });
    }
  }
  async cleanup() {
    for (const value of await this.store.cleanupCandidates(
      this.now().toISOString(),
      100,
    )) {
      if (
        value.ownerId !== this.config.ownerId ||
        value.companyId !== this.config.companyId
      )
        continue;
      await this.destroy(value);
    }
  }
  private audit(v: CloudWorkspaceRecord, reason: string) {
    return this.identities.appendAudit({
      eventType: "CLOUD_WORKSPACE_LIFECYCLE",
      userId: v.ownerId,
      companyId: v.companyId,
      deviceId: v.workerId,
      ipAddress: "cloud-workload",
      outcome: "SUCCESS",
      reason,
      requestId: v.id,
      metadata: { workspaceId: v.id, generation: v.generation },
    });
  }
}
