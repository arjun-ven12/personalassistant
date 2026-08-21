import {
  AllowedApplicationSchema,
  AllowedWorkspaceSchema,
  BLOCKED_WORKSPACE_PATTERNS,
  PolicyEvaluationSchema,
  UserSchema,
} from "@alexa-control/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { PostgresGovernanceStore } from "../governance/postgres-store.js";
import { PostgresIdentityStore } from "../identity/postgres-store.js";
import { PostgresSecurityStateStore } from "../security-state/store.js";
import { PostgresExecutionStore } from "../execution/postgres-store.js";
import { PostgresDatabase } from "./database.js";
import { safeTestDatabaseUrl } from "./test-database.js";

const connectionString = safeTestDatabaseUrl();

describe.skipIf(!connectionString)("PostgreSQL store adapters", () => {
  let database: PostgresDatabase;
  let administrationDatabase: PostgresDatabase;
  let testSchema: string;
  let identity: PostgresIdentityStore;
  let governance: PostgresGovernanceStore;
  let security: PostgresSecurityStateStore;
  let execution: PostgresExecutionStore;
  let ownerId: string;

  beforeAll(async () => {
    administrationDatabase = new PostgresDatabase(connectionString!);
    testSchema = `phase23_${crypto.randomUUID().replaceAll("-", "")}`;
    await administrationDatabase.pool.query(`CREATE SCHEMA "${testSchema}"`);
    const isolatedUrl = new URL(connectionString!);
    isolatedUrl.hostname = isolatedUrl.hostname.replace("-pooler.", ".");
    isolatedUrl.searchParams.set("sslmode", "verify-full");
    isolatedUrl.searchParams.set("options", `-c search_path=${testSchema},public`);
    database = new PostgresDatabase(isolatedUrl.toString());
    await database.migrate();
    ownerId = crypto.randomUUID();
    identity = new PostgresIdentityStore(database.pool);
    governance = new PostgresGovernanceStore(database.pool, BUILT_IN_TOOLS);
    security = new PostgresSecurityStateStore(database.pool);
    execution = new PostgresExecutionStore(database.pool);
    await governance.initialise();
  }, 60_000);

  afterAll(async () => {
    await database?.close();
    if (administrationDatabase && testSchema) {
      await administrationDatabase.pool.query(`DROP SCHEMA "${testSchema}" CASCADE`);
      await administrationDatabase.close();
    }
  });

  it("persists identity, hashed sessions, replay nonces, governance, and security state", async () => {
    const now = new Date();
    const hashSeed = ownerId.replaceAll("-", "");
    const tokenHash = `${hashSeed}${hashSeed}`;
    const csrfHash = `${hashSeed.split("").reverse().join("")}${hashSeed}`;
    const user = UserSchema.parse({
      id: ownerId,
      email: `database-${ownerId}@example.com`,
      displayName: "Database Owner",
      passwordHash: "$argon2id$test-hash-only",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastLoginAt: null,
      accountStatus: "ACTIVE",
    });
    await identity.createUser(user);
    expect(await identity.findUserByEmail(user.email)).toEqual(user);
    await expect(identity.createUser(user)).rejects.toThrow();

    const session = {
      id: crypto.randomUUID(),
      userId: ownerId,
      tokenHash,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      idleExpiresAt: new Date(now.getTime() + 30_000).toISOString(),
      absoluteExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
      lastSeenAt: now.toISOString(),
      revokedAt: null,
      revocationReason: null,
      ipAddress: "100.100.10.20",
      userAgent: "integration-test",
    };
    await identity.createSession(session);
    expect(await identity.findSessionByTokenHash(session.tokenHash)).toEqual(session);

    const device = {
      id: crypto.randomUUID(),
      deviceName: "Integration Mac",
      deviceType: "MAC_AGENT" as const,
      trustStatus: "TRUSTED" as const,
      publicKey: {
        kty: "OKP" as const,
        crv: "Ed25519" as const,
        x: "A".repeat(43),
        ext: true,
        key_ops: ["verify" as const],
      },
      fingerprint: "SHA256:test",
      pairedAt: now.toISOString(),
      lastSeen: null,
      revokedAt: null,
      ownerId,
      createdAt: now.toISOString(),
      capabilities: [],
      metadata: {},
      pairingRequestTokenHash: tokenHash.replaceAll("a", "b"),
    };
    await identity.createDevice(device);
    expect(
      await identity.consumeNonce(
        device.id,
        `nonce-${ownerId}`,
        new Date(now.getTime() + 60_000),
        now,
      ),
    ).toBe(true);
    expect(
      await identity.consumeNonce(
        device.id,
        `nonce-${ownerId}`,
        new Date(now.getTime() + 60_000),
        now,
      ),
    ).toBe(false);

    const application = AllowedApplicationSchema.parse({
      id: `example.editor.${ownerId}`,
      ownerId,
      displayName: "Editor",
      macBundleId: "com.example.editor",
      enabled: false,
      permissions: {},
      riskOverrides: {},
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    await governance.createApplication(application);
    expect(await governance.findApplicationById(application.id)).toEqual(application);

    const workspace = AllowedWorkspaceSchema.parse({
      id: `integration-workspace-${ownerId}`,
      ownerId,
      displayName: "Integration workspace",
      rootPath: "/Users/test/integration-workspace",
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
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    await governance.createWorkspace(workspace);
    const policyEvaluation = PolicyEvaluationSchema.parse({
      id: crypto.randomUUID(),
      actionId: crypto.randomUUID(),
      ownerId,
      deviceId: device.id,
      reasonCode: "POLICY_ALLOWED",
      humanReadableReason: "Integration test read-only policy.",
      matchedRules: ["integration"],
      riskLevel: "read_only",
      approvalRequirement: "session",
      executionAllowed: false,
      evaluatedAt: now.toISOString(),
      decision: "allow",
    });
    await governance.appendPolicyEvaluation(policyEvaluation);
    const policy = await governance.listPolicyEvaluations(ownerId, 1);
    const executionRequest = {
      id: crypto.randomUUID(),
      ownerId,
      deviceId: device.id,
      actionId: crypto.randomUUID(),
      policyEvaluationId: policy[0]!.id,
      toolName: "git.status" as const,
      workspaceId: workspace.id,
      arguments: { workspaceId: workspace.id },
      workspaceRootPath: workspace.rootPath,
      blockedPatterns: workspace.blockedPatterns,
      actionDigest: "e".repeat(64),
      status: "PENDING" as const,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      claimedAt: null,
      startedAt: null,
      completedAt: null,
      cancellationRequestedAt: null,
      failureCode: null,
      attemptCount: 0,
    };
    await execution.create(executionRequest);
    expect(
      await execution.transition(
        executionRequest.id,
        device.id,
        ["PENDING"],
        "CLAIMED",
        now.toISOString(),
      ),
    ).toMatchObject({ status: "CLAIMED", attemptCount: 1 });
    expect(
      await execution.transition(
        executionRequest.id,
        device.id,
        ["PENDING"],
        "CLAIMED",
        now.toISOString(),
      ),
    ).toBeUndefined();
    expect((await governance.getSecurityState()).emergencyStopActive).toBe(true);

    await security.putCsrfToken({
      sessionId: session.id,
      tokenHash: csrfHash.slice(0, 64),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    });
    expect(await security.findCsrfToken(session.id)).toMatchObject({
      tokenHash: csrfHash.slice(0, 64),
    });
  });
});
