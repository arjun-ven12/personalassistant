import {
  AllowedApplicationSchema,
  AllowedWorkspaceSchema,
  BLOCKED_WORKSPACE_PATTERNS,
  PolicyEvaluationSchema,
  RepositorySchema,
  RepositoryGenerationSchema,
  RepositoryIndexJobSchema,
  ValidationRecordSchema,
  UserSchema,
} from "@alexa-control/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BUILT_IN_TOOLS } from "../governance/defaults.js";
import { PostgresGovernanceStore } from "../governance/postgres-store.js";
import { PostgresIdentityStore } from "../identity/postgres-store.js";
import { PostgresSecurityStateStore } from "../security-state/store.js";
import { PostgresExecutionStore } from "../execution/postgres-store.js";
import { PostgresRepositoryStore } from "../repositories/postgres-store.js";
import { PostgresValidationStore } from "../validation/postgres-store.js";
import { PostgresNativeProviderStore } from "../native-providers/postgres-store.js";
import { NativeProviderRuntime } from "../native-providers/service.js";
import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import { PostgresDatabase } from "./database.js";
import { safeTestDatabaseUrl } from "./test-database.js";
import { PostgresCompanyStore } from "../companies/store.js";
import { CompanyService } from "../companies/service.js";
import { companyScope } from "../companies/scope.js";

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
    if (isolatedUrl.searchParams.get("sslmode") !== "disable")
      isolatedUrl.searchParams.set("sslmode", "verify-full");
    isolatedUrl.searchParams.set("options", `-c search_path=${testSchema}`);
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
    const company = await new CompanyService(
      new PostgresCompanyStore(database.pool),
      identity,
    ).ensureDefault(ownerId);
    companyScope.enter({
      ownerId,
      companyId: company.id,
      role: "OWNER",
      requestId: "postgres-integration-test",
    });
    const legacyApprovalActionId = crypto.randomUUID();
    const legacyApproval = {
      companyId: null,
      id: crypto.randomUUID(),
      ownerId,
      actionId: legacyApprovalActionId,
      actionDigest: "a".repeat(64),
      toolName: "workspace.validate_profile",
      riskLevel: "medium" as const,
      approvalRequirement: "explicit" as const,
      status: "PENDING" as const,
      humanSummary: "Validate the registered workspace.",
      requestedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      decidedAt: null,
      decidedBySessionId: null,
      rejectionReason: null,
      action: {
        actionId: legacyApprovalActionId,
        toolName: "workspace.validate_profile",
        workspaceId: "personalassistant",
        arguments: {},
      },
    };
    const storedApproval = await governance.createApproval(legacyApproval);
    expect(storedApproval.companyId).toBe(company.id);
    await governance.updateApproval({
      ...storedApproval,
      status: "APPROVED",
      decidedAt: now.toISOString(),
      decidedBySessionId: crypto.randomUUID(),
    });
    expect((await governance.findApprovalById(legacyApproval.id))?.status).toBe("APPROVED");
    await database.pool.query(
      "UPDATE approval_requests SET record=jsonb_set(record,'{companyId}',to_jsonb($2::text)) WHERE id=$1",
      [legacyApproval.id, crypto.randomUUID()],
    );
    await expect(governance.findApprovalById(legacyApproval.id)).rejects.toThrow(
      "Approval company scope is inconsistent.",
    );
    await database.pool.query(
      "UPDATE approval_requests SET record=jsonb_set(record,'{companyId}',to_jsonb($2::text)) WHERE id=$1",
      [legacyApproval.id, company.id],
    );

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
    const receiptNonce = `receipt-${crypto.randomUUID()}`;
    const receiptDigest = "d".repeat(64);
    const nonceExpiry = new Date(now.getTime() + 60_000);
    expect(
      await identity.consumeSignedResultNonce(
        device.id,
        receiptNonce,
        executionRequest.id,
        receiptDigest,
        nonceExpiry,
        now,
      ),
    ).toBe(true);
    expect(
      await identity.consumeSignedResultNonce(
        device.id,
        receiptNonce,
        executionRequest.id,
        receiptDigest,
        nonceExpiry,
        now,
      ),
    ).toBe(true);
    expect(
      await identity.consumeSignedResultNonce(
        device.id,
        receiptNonce,
        executionRequest.id,
        "e".repeat(64),
        nonceExpiry,
        now,
      ),
    ).toBe(false);
    expect(await identity.consumeNonce(device.id, receiptNonce, nonceExpiry, now)).toBe(
      false,
    );
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
      await execution.heartbeat(executionRequest.id, device.id, now.toISOString()),
    ).toBe(true);
    expect((await execution.find(executionRequest.id))?.agentLastHeartbeatAt).toBe(
      now.toISOString(),
    );
    expect(
      await execution.transition(
        executionRequest.id,
        device.id,
        ["PENDING"],
        "CLAIMED",
        now.toISOString(),
      ),
    ).toBeUndefined();
    expect(
      await execution.startWithDeadline(
        executionRequest.id,
        device.id,
        now.toISOString(),
        120,
      ),
    ).toMatchObject({ status: "RUNNING",
      expiresAt: new Date(now.getTime() + 120_000).toISOString() });
    const signedResult = {
      commandId: crypto.randomUUID(),
      executionRequestId: executionRequest.id,
      deviceId: device.id,
      toolName: "git.status" as const,
      status: "FAILED" as const,
      failureCode: "TEST_FAILURE",
      startedAt: now.toISOString(),
      completedAt: now.toISOString(),
      durationMs: 1,
      truncated: false,
      resultDigest: "f".repeat(64),
      nonce: crypto.randomUUID(),
      deviceSignature: "s".repeat(64),
    };
    expect(
      await execution.completeWithResult(
        ownerId,
        signedResult,
        new Date(now.getTime() + 60_000).toISOString(),
      ),
    ).toMatchObject({ status: "FAILED", failureCode: "TEST_FAILURE" });
    expect(await execution.getResult(executionRequest.id)).toMatchObject({
      commandId: signedResult.commandId,
    });
    expect((await execution.find(executionRequest.id))?.status).toBe("FAILED");
    expect(
      await execution.completeWithResult(
        ownerId,
        signedResult,
        new Date(now.getTime() + 60_000).toISOString(),
      ),
    ).toBeUndefined();
    const abandoned = { ...executionRequest, id: crypto.randomUUID(),
      actionId: crypto.randomUUID(), status: "PENDING" as const };
    await execution.create(abandoned);
    await execution.transition(abandoned.id, device.id, ["PENDING"], "CLAIMED", now.toISOString());
    await execution.startWithDeadline(abandoned.id, device.id, now.toISOString(), 240);
    expect((await execution.cleanupExpired(new Date(now.getTime() + 31_000).toISOString()))
      .expiredRequests).toBeGreaterThanOrEqual(1);
    expect(await execution.find(abandoned.id)).toMatchObject({
      status: "EXPIRED", failureCode: "AGENT_HEARTBEAT_LOST",
    });
    expect((await governance.getSecurityState()).emergencyStopActive).toBe(true);

    const repositories = new PostgresRepositoryStore(database.pool);
    const repository = await repositories.upsertRepository(
      RepositorySchema.parse({
        schemaVersion: "1",
        id: crypto.randomUUID(),
        ownerId,
        workspaceId: workspace.id,
        indexStatus: "INDEXING",
        activeGeneration: null,
        activeFingerprint: null,
        lastIndexedAt: null,
        lastFailureCode: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }),
    );
    const job = RepositoryIndexJobSchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      repositoryId: repository.id,
      ownerId,
      workspaceId: workspace.id,
      status: "RUNNING",
      reason: "manual",
      executionRequestId: executionRequest.id,
      createdAt: now.toISOString(),
      startedAt: now.toISOString(),
      completedAt: null,
      failureCode: null,
    });
    await repositories.createJob(job);
    const generation = RepositoryGenerationSchema.parse({
      schemaVersion: "1",
      id: crypto.randomUUID(),
      repositoryId: repository.id,
      ownerId,
      workspaceId: workspace.id,
      generation: 1,
      fingerprint: "a".repeat(64),
      executionRequestId: executionRequest.id,
      indexedAt: now.toISOString(),
      scannedAt: now.toISOString(),
      ignoreVersion: "phase-4.1-default-v1",
      statistics: {
        fileCount: 0,
        directoryCount: 0,
        totalBytes: 0,
        largestFiles: [],
        extensionStats: {},
        languageSummary: {},
        classificationSummary: {
          source: 0,
          test: 0,
          configuration: 0,
          documentation: 0,
          asset: 0,
          generated: 0,
          build_output: 0,
          unknown: 0,
        },
      },
      technologySummary: {
        detected: [],
        packageManagers: [],
        frameworks: [],
        databases: [],
        languages: [],
      },
    });
    const publication = {
      job: { ...job, status: "SUCCEEDED" as const, completedAt: now.toISOString() },
      repository: {
        ...repository,
        indexStatus: "INDEXED" as const,
        activeGeneration: 1,
        activeFingerprint: generation.fingerprint,
      },
      generation,
      files: [],
      directories: [],
      semanticIndex: {
        symbols: [],
        imports: [],
        exports: [],
        dependencies: [],
        references: [],
        relations: [],
        apiRoutes: [],
        databaseModels: [],
        architectureNodes: [],
        architectureEdges: [],
        insights: [],
      },
    };
    // Force the job write to fail after the inventory write; the transaction
    // must roll back both rather than leaving a saved generation to duplicate.
    await database.pool.query(`CREATE FUNCTION reject_test_index_completion() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.status='SUCCEEDED' THEN RAISE EXCEPTION 'test publication failure'; END IF;
        RETURN NEW;
      END $$`);
    await database.pool.query(`CREATE TRIGGER reject_test_index_completion
      BEFORE UPDATE ON repository_index_jobs FOR EACH ROW
      EXECUTE FUNCTION reject_test_index_completion()`);
    await expect(repositories.publishGeneration(publication)).rejects.toThrow("test publication failure");
    expect(await repositories.activeGeneration(repository.id)).toBeUndefined();
    expect((await repositories.findJobByExecutionRequestId(executionRequest.id))?.status).toBe("RUNNING");
    await database.pool.query("DROP TRIGGER reject_test_index_completion ON repository_index_jobs");
    await database.pool.query("DROP FUNCTION reject_test_index_completion()");
    // Real concurrent PostgreSQL callers can publish only one generation/job.
    const published = await Promise.all([
      repositories.publishGeneration(publication),
      repositories.publishGeneration(publication),
    ]);
    expect(published.filter(Boolean)).toHaveLength(1);
    expect(
      (await repositories.findJobByExecutionRequestId(executionRequest.id))?.status,
    ).toBe("SUCCEEDED");
    expect((await repositories.activeGeneration(repository.id))?.id).toBe(
      generation.id,
    );
    // A stale failure receipt cannot overwrite the successful job/repository.
    expect(
      await repositories.publishFailure(repository, { ...job, status: "FAILED" }),
    ).toBe(false);

    const validations = new PostgresValidationStore(database.pool);
    const validation = await validations.create(
      ValidationRecordSchema.parse({
        schemaVersion: "1",
        id: crypto.randomUUID(),
        ownerId,
        repositoryId: repository.id,
        workspaceId: workspace.id,
        patchId: null,
        repositoryGeneration: 1,
        status: "EXECUTION_REQUESTED",
        classification: null,
        profileIds: ["pnpm_typecheck"],
        planSummary: "Test signed publication",
        executionRequestId: executionRequest.id,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        startedAt: null,
        completedAt: null,
        steps: [],
        summary: "",
        failureCode: null,
      }),
    );
    const finalValidation = {
      ...validation,
      status: "PASSED" as const,
      classification: "PASSED" as const,
      completedAt: now.toISOString(),
    };
    const validationWrites = await Promise.all([
      validations.completeExecution(finalValidation),
      validations.completeExecution(finalValidation),
    ]);
    expect(validationWrites.filter(Boolean)).toHaveLength(1);
    expect(
      await validations.completeExecution({
        ...finalValidation,
        ownerId: crypto.randomUUID(),
      }),
    ).toBe(false);
    expect((await validations.find(validation.id))?.status).toBe("PASSED");

    const nativeStore = new PostgresNativeProviderStore(database.pool);
    const native = new NativeProviderRuntime(
      nativeStore,
      new InMemoryApplicationAdapterStore(),
      () => Promise.resolve(),
    );
    await native.dashboard(ownerId);
    const nativeReceipt = {
      ownerId,
      executionRequestId: executionRequest.id,
      request: {
        providerId: "provider.vscode",
        applicationId: "vscode",
        capability: "focus_explorer" as const,
        arguments: {},
      },
      result: null,
      status: "FAILED" as const,
      failureCode: "TEST_FAILURE",
      startedAt: now.toISOString(),
      completedAt: now.toISOString(),
    };
    await Promise.all([
      native.recordTransportResult(nativeReceipt),
      native.recordTransportResult(nativeReceipt),
    ]);
    expect(
      (await nativeStore.listExecution(ownerId, 100)).filter(
        (item) => item.executionRequestId === executionRequest.id,
      ),
    ).toHaveLength(1);
    expect(
      (await nativeStore.listDiagnostics(ownerId, 100)).filter(
        (item) => item.executionRequestId === executionRequest.id,
      ),
    ).toHaveLength(1);

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
