import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  BLOCKED_WORKSPACE_PATTERNS,
  EngineeringRepositorySchema,
  canonicalizeExecutionPayload,
  canonicalizeSignedCommand,
  type JsonValue,
} from "@alexa-control/shared";
import { createHash, webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";

import { NativeEngineeringRuntime } from "../../../mac-agent/electron/engineering-runtime/runtime.js";
import { dispatchReadOnlyCapability } from "../../../mac-agent/electron/execution/dispatcher.js";
import {
  ServerExecutionReplayGuard,
  verifyServerExecutionEnvelope,
} from "../../../mac-agent/electron/execution/execution-client.js";
import { ApprovalService } from "../governance/approval-service.js";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { GovernanceService } from "../governance/service.js";
import { PolicyEngine } from "../governance/policy-engine.js";
import { RegistryService } from "../governance/registry-service.js";
import { RiskEngine } from "../governance/risk-engine.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { ExecutionService } from "../execution/service.js";
import { ServerExecutionSigner } from "../execution/server-key-store.js";
import { InMemoryExecutionStore } from "../execution/store.js";
import { InMemoryIdentityStore } from "../identity/store.js";
import { EngineeringTransportScopeVerifier } from "./transport.js";
import { InMemoryEngineeringRuntimeStore } from "./store.js";

const execute = promisify(execFile);

describe("signed engineering execution transport", () => {
  it("runs API/Agent OS -> signed envelope -> Mac Agent -> engineering runtime -> signed structured result", async () => {
    const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "engineering-e2e-repo-"));
    const worktreeRoot = await mkdtemp(path.join(os.tmpdir(), "engineering-e2e-worktrees-"));
    await execute("/usr/bin/git", ["init", "-b", "main", repositoryRoot]);
    await execute("/usr/bin/git", ["-C", repositoryRoot, "config", "user.email", "test@example.test"]);
    await execute("/usr/bin/git", ["-C", repositoryRoot, "config", "user.name", "Test"]);
    await execute("/usr/bin/git", ["-C", repositoryRoot, "commit", "--allow-empty", "-m", "initial"]);

    const ownerId = crypto.randomUUID();
    const companyId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    const repositoryId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const now = new Date();
    const identity = new InMemoryIdentityStore();
    const deviceKeys = (await webcrypto.subtle.generateKey(
      { name: "Ed25519" },
      true,
      ["sign", "verify"],
    )) as unknown as webcrypto.CryptoKeyPair;
    const devicePublicKey = await webcrypto.subtle.exportKey(
      "jwk",
      deviceKeys.publicKey,
    );
    identity.createDevice({
      id: deviceId,
      ownerId,
      deviceName: "Engineering Mac",
      deviceType: "MAC_AGENT",
      trustStatus: "TRUSTED",
      publicKey: {
        kty: "OKP",
        crv: "Ed25519",
        x: devicePublicKey.x!,
        ext: true,
        key_ops: ["verify"],
      },
      fingerprint: "SHA256:engineering-e2e",
      pairingRequestTokenHash: "a".repeat(64),
      pairedAt: now.toISOString(),
      createdAt: now.toISOString(),
      lastSeen: null,
      revokedAt: null,
      capabilities: [],
      metadata: {},
    });

    const governanceStore = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);
    const audit = () => undefined;
    const approvals = new ApprovalService(governanceStore, audit);
    const registry = new RegistryService(governanceStore);
    const governance = new GovernanceService(
      governanceStore,
      registry,
      approvals,
      new PolicyEngine(governanceStore, new RiskEngine(), approvals, audit),
    );
    await registry.createWorkspace(ownerId, {
      id: "engineering-project",
      displayName: "Engineering project",
      rootPath: repositoryRoot,
      enabled: true,
      permissions: {
        read: true,
        write: true,
        createFile: true,
        modifyFile: true,
        moveFile: false,
        deleteFile: false,
        runScripts: true,
      },
      blockedPatterns: [...BLOCKED_WORKSPACE_PATTERNS],
      allowedScripts: [],
      gitPermissions: {
        status: true,
        diff: true,
        createBranch: true,
        commit: false,
        push: false,
      },
    });

    const engineeringStore = new InMemoryEngineeringRuntimeStore();
    engineeringStore.saveRepository(
      EngineeringRepositorySchema.parse({
        schemaVersion: "1",
        id: repositoryId,
        ownerId,
        companyId,
        displayName: "Engineering project",
        workspaceLocatorId: "engineering-project",
        defaultBranch: "main",
        protectedBranches: ["main"],
        protectedPaths: [],
        generatedPaths: [],
        commandProfileId: "node-default",
        capabilityProfileId: "engineering-default",
        authorizedAgentIds: [],
        metadata: {
          languages: [],
          packageManagers: [],
          frameworks: [],
          importantFiles: [],
        },
        status: "ACTIVE",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }),
    );
    const keyDirectory = await mkdtemp(path.join(os.tmpdir(), "engineering-server-key-"));
    const signer = await ServerExecutionSigner.load(
      path.join(keyDirectory, "key.json"),
      true,
    );
    const executionStore = new InMemoryExecutionStore();
    const service = new ExecutionService(
      executionStore,
      identity,
      governance,
      audit,
      signer,
      true,
      {
        requestTtlSeconds: 120,
        resultRetentionSeconds: 300,
        maxFileReadBytes: 32_768,
        maxExecutionResultBytes: 524_288,
        maxRepositoryScanResultBytes: 524_288,
      },
      undefined,
      undefined,
      true,
      new EngineeringTransportScopeVerifier(engineeringStore),
    );
    const transportRequest = {
      schemaVersion: "1" as const,
      companyId,
      repositoryId,
      engineeringWorkspaceId: null,
      workspaceLocatorId: "engineering-project",
      worktreeLocator: null,
      taskId: null,
      agentId: null,
      operationId,
      idempotencyKey: operationId,
      requestId,
      capability: "repository.inspect" as const,
      input: {},
    };
    expect(() =>
      service.createEngineeringExecution({
        ownerId,
        sessionId: crypto.randomUUID(),
        request: transportRequest,
        networkState: "PRIVATE_NETWORK",
        ipAddress: "100.100.1.2",
        requestId: crypto.randomUUID(),
        deviceId,
      }),
    ).toThrowError("The engineering payload must remain bound");
    const scopeVerifier = new EngineeringTransportScopeVerifier(engineeringStore);
    await expect(
      scopeVerifier.verify({
        ownerId,
        request: { ...transportRequest, companyId: crypto.randomUUID() },
      }),
    ).resolves.toBe(false);
    await expect(
      scopeVerifier.verify({
        ownerId,
        request: { ...transportRequest, idempotencyKey: "different-operation" },
      }),
    ).resolves.toBe(false);
    const queued = await service.createEngineeringExecution({
      ownerId,
      sessionId: crypto.randomUUID(),
      request: transportRequest,
      networkState: "PRIVATE_NETWORK",
      ipAddress: "100.100.1.2",
      requestId,
      deviceId,
    });
    const replayedCreate = await service.createEngineeringExecution({
      ownerId,
      sessionId: crypto.randomUUID(),
      request: transportRequest,
      networkState: "PRIVATE_NETWORK",
      ipAddress: "100.100.1.2",
      requestId,
      deviceId,
    });
    expect(replayedCreate.id).toBe(queued.id);

    const envelope = await service.poll(deviceId);
    expect(envelope).not.toBeNull();
    const replayGuard = new ServerExecutionReplayGuard();
    await expect(
      verifyServerExecutionEnvelope({
        envelope: {
          ...envelope!,
          request: {
            ...envelope!.request,
            arguments: {
              ...envelope!.request.arguments,
              repositoryId: crypto.randomUUID(),
            },
          },
        },
        deviceId,
        serverPublicKeyX: signer.publicKeyX,
      }),
    ).rejects.toMatchObject({ code: "AGENT_SERVER_SIGNATURE_FAILED" });
    await expect(
      verifyServerExecutionEnvelope({
        envelope,
        deviceId: crypto.randomUUID(),
        serverPublicKeyX: signer.publicKeyX,
      }),
    ).rejects.toMatchObject({ code: "AGENT_SERVER_SIGNATURE_FAILED" });
    const expiredAt = new Date(Date.now() - 1_000);
    const expiredEnvelope = await signer.sign({
      request: {
        ...envelope!.request,
        createdAt: new Date(expiredAt.getTime() - 1_000).toISOString(),
        expiresAt: expiredAt.toISOString(),
      },
      issuedAt: new Date(expiredAt.getTime() - 1_000).toISOString(),
      expiresAt: expiredAt.toISOString(),
      nonce: crypto.randomUUID(),
      securityStateVersion: envelope!.securityStateVersion,
    });
    await expect(
      verifyServerExecutionEnvelope({
        envelope: expiredEnvelope,
        deviceId,
        serverPublicKeyX: signer.publicKeyX,
      }),
    ).rejects.toMatchObject({ code: "AGENT_SERVER_SIGNATURE_FAILED" });
    const verifiedRequest = await verifyServerExecutionEnvelope({
      envelope,
      deviceId,
      serverPublicKeyX: signer.publicKeyX,
      replayGuard,
    });
    await expect(
      verifyServerExecutionEnvelope({
        envelope,
        deviceId,
        serverPublicKeyX: signer.publicKeyX,
        replayGuard,
      }),
    ).rejects.toMatchObject({ code: "AGENT_SERVER_ENVELOPE_REPLAYED" });

    executionStore.transition(
      queued.id,
      deviceId,
      ["PENDING"],
      "CLAIMED",
      new Date().toISOString(),
    );
    executionStore.transition(
      queued.id,
      deviceId,
      ["CLAIMED"],
      "RUNNING",
      new Date().toISOString(),
    );
    const startedAt = new Date();
    const result = await dispatchReadOnlyCapability(
      verifiedRequest,
      { maxFileReadBytes: 32_768, maxGitOutputBytes: 262_144, maxGitEntries: 1_000 },
      undefined,
      new NativeEngineeringRuntime(worktreeRoot),
    );
    expect(result).toMatchObject({
      operationId,
      capability: "repository.inspect",
      output: { branch: "main", dirty: false },
    });
    const completedAt = new Date();
    const unsignedResult = {
      commandId: crypto.randomUUID(),
      executionRequestId: queued.id,
      deviceId,
      toolName: "engineering.repository_capability" as const,
      status: "SUCCEEDED" as const,
      result,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      truncated: false,
      resultDigest: createHash("sha256")
        .update(canonicalizeExecutionPayload(result))
        .digest("hex"),
      nonce: crypto.randomUUID(),
    };
    const signedWrapper = {
      commandId: unsignedResult.commandId,
      deviceId,
      issuedAt: unsignedResult.startedAt,
      expiresAt: new Date(completedAt.getTime() + 120_000).toISOString(),
      nonce: unsignedResult.nonce,
      payload: JSON.parse(JSON.stringify(unsignedResult)) as Record<
        string,
        JsonValue
      >,
      signatureAlgorithm: "Ed25519" as const,
      protocolVersion: "1" as const,
    };
    const deviceSignature = await webcrypto.subtle.sign(
      "Ed25519",
      deviceKeys.privateKey,
      new TextEncoder().encode(canonicalizeSignedCommand(signedWrapper)),
    );
    const accepted = await service.acceptResult(ownerId, {
      ...unsignedResult,
      deviceSignature: Buffer.from(deviceSignature).toString("base64url"),
    });
    expect(accepted).toMatchObject({ status: "SUCCEEDED" });
    expect(executionStore.getResult(queued.id)).toMatchObject({
      result: { operationId, capability: "repository.inspect" },
    });
  });
});
