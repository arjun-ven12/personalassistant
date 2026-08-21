import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BLOCKED_WORKSPACE_PATTERNS,
  canonicalizeExecutionPayload,
  canonicalizeSignedCommand,
} from "@alexa-control/shared";
import { createHash, webcrypto } from "node:crypto";
import { ApprovalService } from "../governance/approval-service.js";
import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { GovernanceService } from "../governance/service.js";
import { PolicyEngine } from "../governance/policy-engine.js";
import { RegistryService } from "../governance/registry-service.js";
import { RiskEngine } from "../governance/risk-engine.js";
import { InMemoryGovernanceStore } from "../governance/store.js";
import { InMemoryIdentityStore } from "../identity/store.js";
import { ExecutionService } from "./service.js";
import { ServerExecutionSigner } from "./server-key-store.js";
import { InMemoryExecutionStore } from "./store.js";

const setup = async (emergencyStopActive = false) => {
  const identity = new InMemoryIdentityStore();
  const governanceStore = new InMemoryGovernanceStore(
    BUILT_IN_TOOLS,
    emergencyStopActive,
  );
  const audit = () => undefined;
  const approvals = new ApprovalService(governanceStore, audit);
  const registry = new RegistryService(governanceStore);
  const governance = new GovernanceService(
    governanceStore,
    registry,
    approvals,
    new PolicyEngine(governanceStore, new RiskEngine(), approvals, audit),
  );
  const ownerId = crypto.randomUUID();
  const deviceId = crypto.randomUUID();
  const deviceKeys = (await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as unknown as webcrypto.CryptoKeyPair;
  const devicePublicKey = await webcrypto.subtle.exportKey("jwk", deviceKeys.publicKey);
  identity.createDevice({
    id: deviceId,
    ownerId,
    deviceName: "Test Mac",
    deviceType: "MAC_AGENT",
    trustStatus: "TRUSTED",
    publicKey: {
      kty: "OKP",
      crv: "Ed25519",
      x: devicePublicKey.x!,
      ext: true,
      key_ops: ["verify"],
    },
    fingerprint: "SHA256:test",
    pairingRequestTokenHash: "a".repeat(64),
    pairedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    lastSeen: null,
    revokedAt: null,
    capabilities: [],
    metadata: {},
  });
  await registry.createWorkspace(ownerId, {
    id: "project",
    displayName: "Project",
    rootPath: "/Users/test/project",
    enabled: true,
    permissions: {
      read: true,
      write: false,
      createFile: false,
      modifyFile: false,
      moveFile: false,
      deleteFile: false,
      runScripts: false,
    },
    blockedPatterns: [...BLOCKED_WORKSPACE_PATTERNS],
    allowedScripts: [],
    gitPermissions: {
      status: true,
      diff: true,
      createBranch: false,
      commit: false,
      push: false,
    },
  });
  const keyDirectory = await mkdtemp(path.join(os.tmpdir(), "assistant-server-key-"));
  const signer = await ServerExecutionSigner.load(
    path.join(keyDirectory, "key.json"),
    true,
  );
  const store = new InMemoryExecutionStore();
  return {
    identity,
    ownerId,
    deviceId,
    devicePrivateKey: deviceKeys.privateKey,
    governanceStore,
    store,
    service: new ExecutionService(store, identity, governance, audit, signer, true, {
      requestTtlSeconds: 120,
      resultRetentionSeconds: 300,
      maxFileReadBytes: 1_024,
      maxExecutionResultBytes: 16_384,
      maxRepositoryScanResultBytes: 524_288,
    }),
  };
};

describe("ExecutionService policy integration", () => {
  it("creates only policy-authorized, device-bound read-only requests", async () => {
    const { service, store, ownerId, deviceId, devicePrivateKey } = await setup();
    const request = await service.create({
      ownerId,
      sessionId: crypto.randomUUID(),
      request: {
        toolName: "git.status",
        deviceId,
        arguments: { workspaceId: "project" },
      },
      networkState: "PRIVATE_NETWORK",
      ipAddress: "100.100.1.2",
      requestId: crypto.randomUUID(),
    });
    expect(request).toMatchObject({
      ownerId,
      deviceId,
      toolName: "git.status",
      status: "PENDING",
    });
    expect(request.workspaceRootPath).toBe("/Users/test/project");
    store.transition(
      request.id,
      deviceId,
      ["PENDING"],
      "CLAIMED",
      new Date().toISOString(),
    );
    store.transition(
      request.id,
      deviceId,
      ["CLAIMED"],
      "RUNNING",
      new Date().toISOString(),
    );
    const startedAt = new Date();
    const resultPayload = {
      workspaceId: "project",
      branch: {
        head: "main",
        upstream: null,
        ahead: 0,
        behind: 0,
        detached: false,
      },
      entries: [],
      truncated: false,
      durationMs: 1,
    };
    const unsignedResult = {
      commandId: crypto.randomUUID(),
      executionRequestId: request.id,
      deviceId,
      toolName: "git.status" as const,
      status: "SUCCEEDED" as const,
      result: resultPayload,
      startedAt: startedAt.toISOString(),
      completedAt: new Date(startedAt.getTime() + 1).toISOString(),
      durationMs: 1,
      truncated: false,
      resultDigest: createHash("sha256")
        .update(canonicalizeExecutionPayload(resultPayload))
        .digest("hex"),
      nonce: crypto.randomUUID(),
    };
    const wrapper = {
      commandId: unsignedResult.commandId,
      deviceId,
      issuedAt: unsignedResult.startedAt,
      expiresAt: new Date(
        new Date(unsignedResult.completedAt).getTime() + 120_000,
      ).toISOString(),
      nonce: unsignedResult.nonce,
      payload: unsignedResult,
      signatureAlgorithm: "Ed25519" as const,
      protocolVersion: "1" as const,
    };
    const signature = await webcrypto.subtle.sign(
      "Ed25519",
      devicePrivateKey,
      new TextEncoder().encode(canonicalizeSignedCommand(wrapper)),
    );
    expect(
      await service.acceptResult(ownerId, {
        ...unsignedResult,
        deviceSignature: Buffer.from(signature).toString("base64url"),
      }),
    ).toMatchObject({ status: "SUCCEEDED" });
    await expect(
      service.acceptResult(ownerId, {
        ...unsignedResult,
        deviceSignature: Buffer.from(signature).toString("base64url"),
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_NONCE" });
  });

  it("fails closed for emergency stop, public network, and blocked files", async () => {
    const active = await setup(true);
    await expect(
      active.service.create({
        ownerId: active.ownerId,
        sessionId: crypto.randomUUID(),
        request: {
          toolName: "git.status",
          arguments: { workspaceId: "project" },
        },
        networkState: "PRIVATE_NETWORK",
        ipAddress: "100.100.1.2",
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "EMERGENCY_STOP_ACTIVE" });
    const normal = await setup();
    await expect(
      normal.service.create({
        ownerId: normal.ownerId,
        sessionId: crypto.randomUUID(),
        request: {
          toolName: "workspace.read_file",
          arguments: { workspaceId: "project", relativePath: ".env" },
        },
        networkState: "PRIVATE_NETWORK",
        ipAddress: "100.100.1.2",
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "WORKSPACE_PATH_BLOCKED" });
  });

  it("rejects direct patch execution outside the patch approval service", async () => {
    const normal = await setup();
    await expect(
      normal.service.create({
        ownerId: normal.ownerId,
        sessionId: crypto.randomUUID(),
        request: {
          toolName: "workspace.apply_patch",
          arguments: {
            workspaceId: "project",
            patchId: crypto.randomUUID(),
            patchDigest: "a".repeat(64),
            approvalToken: "owner-approved-token-with-enough-entropy",
            repositoryGeneration: null,
            operations: [
              {
                operationId: crypto.randomUUID(),
                kind: "create",
                relativePath: "docs/example.md",
                expectedOriginalSha256: null,
                expectedOriginalContent: null,
                newContent: "hello\n",
              },
            ],
          },
        },
        networkState: "PRIVATE_NETWORK",
        ipAddress: "100.100.1.2",
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "PATCH_SERVICE_REQUIRED" });
  });

  it("rejects direct validation execution outside the validation service", async () => {
    const normal = await setup();
    await expect(
      normal.service.create({
        ownerId: normal.ownerId,
        sessionId: crypto.randomUUID(),
        request: {
          toolName: "workspace.validate_profile",
          arguments: {
            workspaceId: "project",
            validationRunId: crypto.randomUUID(),
            repositoryGeneration: null,
            profiles: [
              {
                id: "pnpm_typecheck",
                label: "TypeScript type check",
                category: "typecheck",
                commandDisplay: "pnpm typecheck",
                timeoutMs: 90_000,
                network: "disabled",
                immutable: true,
              },
            ],
          },
        },
        networkState: "PRIVATE_NETWORK",
        ipAddress: "100.100.1.2",
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_SERVICE_REQUIRED" });
  });

  it("queues native provider capabilities with an inert sentinel workspace", async () => {
    const normal = await setup();
    const request = await normal.service.createNativeProviderExecution({
      ownerId: normal.ownerId,
      sessionId: crypto.randomUUID(),
      request: {
        providerId: "provider.vscode",
        applicationId: "vscode",
        capability: "launch",
        arguments: {},
      },
      networkState: "PRIVATE_NETWORK",
      ipAddress: "127.0.0.1",
      requestId: crypto.randomUUID(),
      policyApplication: {
        id: "vscode",
        ownerId: normal.ownerId,
        displayName: "VS Code",
        macBundleId: "com.microsoft.VSCode",
        enabled: true,
        permissions: {
          open: true,
          focus: true,
          inspectWindow: false,
          captureWindow: false,
          automate: false,
          sendKeyboardShortcuts: false,
          readSemanticStructure: false,
          navigate: true,
          interact: false,
          editText: false,
          openFiles: false,
          createDocuments: false,
          deleteContent: false,
          executeCommands: false,
          clipboardAccess: false,
        },
        riskOverrides: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    expect(request).toMatchObject({
      toolName: "native.provider_capability",
      status: "PENDING",
    });
    expect(request.workspaceId).toMatch(/^native-provider-[a-f0-9]{12}$/);
    expect(request.workspaceRootPath).toContain("/__native_provider__/");
    const sentinel = normal.governanceStore.findWorkspaceById(request.workspaceId);
    expect(sentinel).toMatchObject({
      enabled: true,
      permissions: {
        read: false,
        write: false,
        runScripts: false,
      },
      gitPermissions: {
        status: false,
        diff: false,
      },
    });
  });

  it("maps reviewed browser native capabilities to browser navigation policy", async () => {
    const normal = await setup();
    const request = await normal.service.createNativeProviderExecution({
      ownerId: normal.ownerId,
      sessionId: crypto.randomUUID(),
      request: {
        providerId: "provider.chrome",
        applicationId: "chrome",
        capability: "new_tab",
        arguments: {},
      },
      networkState: "PRIVATE_NETWORK",
      ipAddress: "127.0.0.1",
      requestId: crypto.randomUUID(),
      policyApplication: {
        id: "chrome",
        ownerId: normal.ownerId,
        displayName: "Chrome",
        macBundleId: "com.google.Chrome",
        enabled: true,
        permissions: {
          open: true,
          focus: true,
          inspectWindow: false,
          captureWindow: false,
          automate: false,
          sendKeyboardShortcuts: false,
          readSemanticStructure: true,
          navigate: true,
          interact: true,
          editText: false,
          openFiles: false,
          createDocuments: false,
          deleteContent: false,
          executeCommands: false,
          clipboardAccess: false,
        },
        riskOverrides: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    expect(request).toMatchObject({
      toolName: "native.provider_capability",
      status: "PENDING",
      arguments: {
        providerId: "provider.chrome",
        capability: "new_tab",
      },
    });
  });

  it("targets the recently polling trusted Mac agent for native provider execution", async () => {
    const normal = await setup();
    const currentDevice = normal.identity.findDeviceById(normal.deviceId);
    if (!currentDevice) throw new Error("Expected setup device.");
    normal.identity.updateDevice({
      ...currentDevice,
      createdAt: "2026-08-05T00:00:00.000Z",
      lastSeen: "2026-08-05T12:00:00.000Z",
    });
    normal.identity.createDevice({
      ...currentDevice,
      id: crypto.randomUUID(),
      fingerprint: "SHA256:stale-newer-device",
      pairingRequestTokenHash: "b".repeat(64),
      createdAt: "2026-08-06T00:00:00.000Z",
      lastSeen: null,
    });

    const request = await normal.service.createNativeProviderExecution({
      ownerId: normal.ownerId,
      sessionId: crypto.randomUUID(),
      request: {
        providerId: "provider.vscode",
        applicationId: "vscode",
        capability: "launch",
        arguments: {},
      },
      networkState: "PRIVATE_NETWORK",
      ipAddress: "127.0.0.1",
      requestId: crypto.randomUUID(),
      policyApplication: {
        id: "vscode",
        ownerId: normal.ownerId,
        displayName: "VS Code",
        macBundleId: "com.microsoft.VSCode",
        enabled: true,
        permissions: {
          open: true,
          focus: true,
          inspectWindow: false,
          captureWindow: false,
          automate: false,
          sendKeyboardShortcuts: false,
          readSemanticStructure: false,
          navigate: true,
          interact: false,
          editText: false,
          openFiles: false,
          createDocuments: false,
          deleteContent: false,
          executeCommands: false,
          clipboardAccess: false,
        },
        riskOverrides: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    expect(request.deviceId).toBe(normal.deviceId);
  });
});
