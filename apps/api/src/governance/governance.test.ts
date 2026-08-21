import {
  AllowedApplicationSchema,
  AllowedWorkspaceSchema,
  BLOCKED_WORKSPACE_PATTERNS,
  ToolDefinitionSchema,
  type ProposedAction,
} from "@alexa-control/shared";
import { describe, expect, it } from "vitest";

import { ApprovalService, type GovernanceAuditInput } from "./approval-service.js";
import { BUILT_IN_TOOLS } from "./defaults.js";
import { digestProposedAction } from "./digest.js";
import { GovernanceError } from "./errors.js";
import { PolicyEngine } from "./policy-engine.js";
import { RegistryService } from "./registry-service.js";
import { RiskEngine } from "./risk-engine.js";
import { InMemoryGovernanceStore } from "./store.js";
import type { GovernanceStore } from "./store.js";
import type { TrustedPolicyInput } from "./types.js";

const ownerId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
const now = "2026-07-28T00:00:00.000Z";

const application = AllowedApplicationSchema.parse({
  id: "example.editor",
  ownerId,
  displayName: "Editor",
  macBundleId: "com.example.editor",
  enabled: true,
  permissions: { open: true },
  riskOverrides: {},
  createdAt: now,
  updatedAt: now,
});

const workspace = AllowedWorkspaceSchema.parse({
  id: "project.main",
  ownerId,
  displayName: "Project",
  rootPath: "/Users/owner/project",
  enabled: true,
  permissions: { read: true },
  blockedPatterns: [...BLOCKED_WORKSPACE_PATTERNS],
  allowedScripts: [],
  gitPermissions: { status: true, diff: true },
  createdAt: now,
  updatedAt: now,
});

const action = (
  toolName: string,
  extra: Partial<ProposedAction> = {},
): ProposedAction => ({
  actionId: crypto.randomUUID(),
  toolName,
  arguments: {},
  ...extra,
});

describe("InMemoryGovernanceStore and RegistryService", () => {
  it("scopes, updates, disables, and defensively clones registry records", async () => {
    const store = new InMemoryGovernanceStore(BUILT_IN_TOOLS);
    const registry = new RegistryService(store);
    store.createApplication(application);
    store.createWorkspace(workspace);

    const read = (await registry.listApplications(ownerId))[0];
    expect(read).toMatchObject({ id: application.id, ownerId });
    if (read) read.displayName = "mutated";
    expect((await registry.getApplication(ownerId, application.id)).displayName).toBe(
      "Editor",
    );
    expect(await registry.listApplications(crypto.randomUUID())).toHaveLength(0);
    expect((await registry.disableApplication(ownerId, application.id)).enabled).toBe(
      false,
    );
    expect((await registry.disableWorkspace(ownerId, workspace.id)).enabled).toBe(
      false,
    );
    expect(() => store.createApplication(application)).toThrow();
    expect(() => store.createWorkspace(workspace)).toThrow();
  });

  it("merges mandatory patterns and rejects risk downgrades", async () => {
    const registry = new RegistryService(new InMemoryGovernanceStore(BUILT_IN_TOOLS));
    const created = await registry.createWorkspace(ownerId, {
      id: "project.safe",
      displayName: "Safe",
      rootPath: "/Users/owner/safe",
      enabled: false,
      permissions: {
        read: false,
        write: false,
        createFile: false,
        modifyFile: false,
        moveFile: false,
        deleteFile: false,
        runScripts: false,
      },
      blockedPatterns: ["custom.secret"],
      allowedScripts: [],
      gitPermissions: {
        status: false,
        diff: false,
        createBranch: false,
        commit: false,
        push: false,
      },
    });
    expect(created.blockedPatterns).toEqual(
      expect.arrayContaining([...BLOCKED_WORKSPACE_PATTERNS, "custom.secret"]),
    );
    await expect(
      registry.createApplication(ownerId, {
        id: "example.unsafe",
        displayName: "Unsafe",
        macBundleId: "com.example.unsafe",
        enabled: true,
        permissions: {
          open: true,
          focus: false,
          inspectWindow: false,
          captureWindow: false,
          automate: false,
          sendKeyboardShortcuts: false,
          readSemanticStructure: false,
          navigate: false,
          interact: false,
          editText: false,
          openFiles: false,
          createDocuments: false,
          deleteContent: false,
          executeCommands: false,
          clipboardAccess: false,
        },
        riskOverrides: { "app.open": "read_only" },
      }),
    ).rejects.toThrowError(GovernanceError);
  });
});

describe("RiskEngine", () => {
  const engine = new RiskEngine();

  it.each([
    ["security.view", "read_only", "none"],
    ["app.open", "low", "session"],
    ["governance.update_registry", "medium", "explicit"],
    ["security.modify", "high", "recent_authentication"],
    ["shell.execute_arbitrary", "prohibited", "prohibited"],
  ] as const)("preserves %s baseline and approval", (name, risk, approval) => {
    const tool = BUILT_IN_TOOLS.find((entry) => entry.name === name);
    expect(tool).toBeDefined();
    const result = engine.evaluate({
      tool: tool!,
      action: action(name),
    });
    expect(result.riskLevel).toBe(risk);
    expect(result.approvalRequirement).toBe(approval);
  });

  it("rejects unregistered capabilities and permission gaps", () => {
    const view = BUILT_IN_TOOLS.find((tool) => tool.name === "security.view")!;
    expect(
      engine.evaluate({
        tool: view,
        action: action("security.view", {
          requestedCapabilities: ["security.modify"],
        }),
      }).denial?.code,
    ).toBe("INVALID_POLICY_REQUEST");

    const git = BUILT_IN_TOOLS.find((tool) => tool.name === "git.status")!;
    expect(
      engine.evaluate({
        tool: git,
        action: action("git.status", { workspaceId: workspace.id }),
        workspace: {
          ...workspace,
          gitPermissions: { ...workspace.gitPermissions, status: false },
        },
      }).denial?.code,
    ).toBe("GIT_PERMISSION_DENIED");
  });

  it("never downgrades elevated or prohibited risk", () => {
    const open = {
      ...application,
      riskOverrides: { "app.open": "high" as const },
    };
    const appTool = {
      ...BUILT_IN_TOOLS.find((tool) => tool.name === "app.open")!,
      enabled: true,
    };
    const elevated = engine.evaluate({
      tool: appTool,
      action: action("app.open", { applicationId: application.id }),
      application: open,
    });
    expect(elevated.riskLevel).toBe("high");
    expect(elevated.approvalRequirement).toBe("recent_authentication");

    const permanentDelete = ToolDefinitionSchema.parse({
      ...appTool,
      name: "filesystem.delete_test",
      riskLevel: "medium",
      approvalRequirement: "explicit",
      requiredCapabilities: ["filesystem.delete_permanently"],
      targetType: "none",
    });
    expect(
      engine.evaluate({
        tool: permanentDelete,
        action: action(permanentDelete.name),
      }),
    ).toMatchObject({
      riskLevel: "prohibited",
      approvalRequirement: "prohibited",
      denial: { prohibited: true },
    });

    const weakenedEmail = ToolDefinitionSchema.parse({
      ...BUILT_IN_TOOLS.find((tool) => tool.name === "email.send")!,
      approvalRequirement: "none",
    });
    expect(
      engine.evaluate({
        tool: weakenedEmail,
        action: action("email.send"),
      }).approvalRequirement,
    ).toBe("recent_authentication");
  });
});

describe("ApprovalService and PolicyEngine", () => {
  const setup = (ttlSeconds = 900) => {
    const store = new InMemoryGovernanceStore(BUILT_IN_TOOLS, false);
    const events: GovernanceAuditInput[] = [];
    const approvals = new ApprovalService(
      store,
      (event) => {
        events.push(event);
      },
      ttlSeconds,
    );
    const policy = new PolicyEngine(store, new RiskEngine(), approvals, (event) => {
      events.push(event);
    });
    return { store, approvals, policy, events };
  };

  const trustedInput = async (
    proposal: ProposedAction,
    store: GovernanceStore,
  ): Promise<TrustedPolicyInput> => {
    const tool = await store.findToolByName(proposal.toolName);
    const targetApplication = proposal.applicationId
      ? await store.findApplicationById(proposal.applicationId)
      : undefined;
    const targetWorkspace = proposal.workspaceId
      ? await store.findWorkspaceById(proposal.workspaceId)
      : undefined;
    return {
      ownerId,
      sessionId,
      deviceTrusted: false,
      signedEnvelopeVerified: false,
      networkVerification: "PRIVATE_NETWORK",
      recentAuthentication: false,
      action: proposal,
      ...(tool ? { tool } : {}),
      ...(targetApplication ? { application: targetApplication } : {}),
      ...(targetWorkspace ? { workspace: targetWorkspace } : {}),
      emergencyStopActive: false,
      ipAddress: "127.0.0.1",
      requestId: crypto.randomUUID(),
    };
  };

  it("uses stable action digests without storing arguments in summaries", async () => {
    const first = action("governance.update_registry", {
      arguments: { secret: "one", nested: { b: 2, a: 1 } },
    });
    const reordered = {
      ...first,
      arguments: { nested: { a: 1, b: 2 }, secret: "one" },
    };
    expect(digestProposedAction(first)).toBe(digestProposedAction(reordered));
    expect(digestProposedAction({ ...first, arguments: { secret: "two" } })).not.toBe(
      digestProposedAction(first),
    );
    const { approvals } = setup();
    const approval = await approvals.create({
      ownerId,
      action: first,
      riskLevel: "medium",
      approvalRequirement: "explicit",
      ipAddress: "127.0.0.1",
      requestId: "test",
    });
    expect(approval.humanSummary).not.toContain("one");
  });

  it("enforces terminal transitions, ownership, expiry, and recent auth", async () => {
    const { approvals } = setup();
    const explicit = await approvals.create({
      ownerId,
      action: action("governance.update_registry"),
      riskLevel: "medium",
      approvalRequirement: "explicit",
      ipAddress: "127.0.0.1",
      requestId: "test",
    });
    const decided = await approvals.approve(ownerId, explicit.id, sessionId, {
      ipAddress: "127.0.0.1",
      requestId: "approve",
    });
    expect(decided.status).toBe("APPROVED");
    await expect(
      approvals.approve(ownerId, explicit.id, sessionId, {
        ipAddress: "127.0.0.1",
        requestId: "again",
      }),
    ).rejects.toThrowError(GovernanceError);
    await expect(approvals.get(crypto.randomUUID(), explicit.id)).rejects.toThrowError(
      GovernanceError,
    );

    const recent = await approvals.create({
      ownerId,
      action: action("security.modify"),
      riskLevel: "high",
      approvalRequirement: "recent_authentication",
      ipAddress: "127.0.0.1",
      requestId: "recent",
    });
    await expect(
      approvals.approve(ownerId, recent.id, sessionId, {
        ipAddress: "127.0.0.1",
        requestId: "recent-approve",
      }),
    ).rejects.toThrowError(/recent-authentication/i);

    const expiring = setup(-1);
    const expired = await expiring.approvals.create({
      ownerId,
      action: action("governance.update_registry"),
      riskLevel: "medium",
      approvalRequirement: "explicit",
      ipAddress: "127.0.0.1",
      requestId: "expired",
    });
    expect((await expiring.approvals.get(ownerId, expired.id)).status).toBe("EXPIRED");

    const rejected = await approvals.create({
      ownerId,
      action: action("governance.update_registry"),
      riskLevel: "medium",
      approvalRequirement: "explicit",
      ipAddress: "127.0.0.1",
      requestId: "reject",
    });
    expect(
      (
        await approvals.reject(
          ownerId,
          rejected.id,
          sessionId,
          { ipAddress: "127.0.0.1", requestId: "reject-decision" },
          "Not now",
        )
      ).status,
    ).toBe("REJECTED");
    const cancelled = await approvals.create({
      ownerId,
      action: action("governance.update_registry", {
        arguments: { different: true },
      }),
      riskLevel: "medium",
      approvalRequirement: "explicit",
      ipAddress: "127.0.0.1",
      requestId: "cancel",
    });
    expect(
      (
        await approvals.cancel(ownerId, cancelled.id, sessionId, {
          ipAddress: "127.0.0.1",
          requestId: "cancel-decision",
        })
      ).status,
    ).toBe("CANCELLED");
  });

  it("allows read-only governance, binds explicit approval, and persists audits", async () => {
    const { store, approvals, policy, events } = setup();
    const read = action("security.view");
    const readResult = await policy.evaluate(await trustedInput(read, store));
    expect(readResult).toMatchObject({
      decision: "allow",
      executionAllowed: false,
    });

    const explicitAction = action("governance.update_registry");
    const required = await policy.evaluate(await trustedInput(explicitAction, store));
    expect(required).toMatchObject({
      decision: "require_approval",
      approvalRequirement: "explicit",
      executionAllowed: false,
    });
    await approvals.approve(ownerId, required.approvalRequestId!, sessionId, {
      ipAddress: "127.0.0.1",
      requestId: "approve",
    });
    expect(
      await policy.evaluate(await trustedInput(explicitAction, store)),
    ).toMatchObject({
      decision: "allow",
      reasonCode: "POLICY_ALLOWED_WITH_APPROVAL",
      executionAllowed: false,
    });
    expect(store.listPolicyEvaluations(ownerId, 20)).toHaveLength(3);
    expect(events.some((event) => event.eventType === "POLICY_EVALUATED")).toBe(true);
  });

  it("fails closed for unknown network, emergency stop, disabled, and prohibited tools", async () => {
    const { store, policy } = setup();
    const read = action("security.view");
    expect(
      (
        await policy.evaluate({
          ...(await trustedInput(read, store)),
          networkVerification: "UNKNOWN",
        })
      ).reasonCode,
    ).toBe("NETWORK_NOT_VERIFIED");
    for (const networkVerification of ["PUBLIC_NETWORK", "UNAVAILABLE"] as const) {
      expect(
        (
          await policy.evaluate({
            ...(await trustedInput(read, store)),
            networkVerification,
          })
        ).reasonCode,
      ).toBe("NETWORK_NOT_VERIFIED");
    }
    expect(
      (
        await policy.evaluate({
          ...(await trustedInput(read, store)),
          emergencyStopActive: true,
        })
      ).reasonCode,
    ).toBe("EMERGENCY_STOP_ACTIVE");

    const disabled = action("workspace.create_file");
    store.createWorkspace(workspace);
    expect(
      (await policy.evaluate(await trustedInput(disabled, store))).reasonCode,
    ).toBe("TOOL_DISABLED");
    const prohibited = action("shell.execute_arbitrary");
    expect(await policy.evaluate(await trustedInput(prohibited, store))).toMatchObject({
      decision: "prohibited",
      reasonCode: "PROHIBITED_ACTION",
    });
    const unknown = action("unknown.tool");
    expect((await policy.evaluate(await trustedInput(unknown, store))).reasonCode).toBe(
      "UNKNOWN_TOOL",
    );
  });

  it("fails closed across application, workspace, device, and permission context", async () => {
    const tools = BUILT_IN_TOOLS.map((tool) =>
      ["app.open", "git.status"].includes(tool.name)
        ? { ...tool, enabled: true }
        : tool,
    );
    const store = new InMemoryGovernanceStore(tools, false);
    const events: GovernanceAuditInput[] = [];
    const approvals = new ApprovalService(store, (event) => {
      events.push(event);
    });
    const policy = new PolicyEngine(store, new RiskEngine(), approvals, (event) => {
      events.push(event);
    });

    const missingApp = action("app.open", { applicationId: "missing.app" });
    expect(
      (await policy.evaluate(await trustedInput(missingApp, store))).reasonCode,
    ).toBe("UNKNOWN_APPLICATION");
    store.createApplication(application);
    const appAction = action("app.open", { applicationId: application.id });
    expect(
      (await policy.evaluate(await trustedInput(appAction, store))).reasonCode,
    ).toBe("TRUSTED_DEVICE_REQUIRED");
    const trustedDeviceInput = {
      ...(await trustedInput(appAction, store)),
      deviceTrusted: true,
    };
    expect((await policy.evaluate(trustedDeviceInput)).reasonCode).toBe(
      "SIGNED_REQUEST_REQUIRED",
    );

    const disabledApplication = { ...application, enabled: false };
    store.updateApplication(disabledApplication);
    expect(
      (await policy.evaluate(await trustedInput(appAction, store))).reasonCode,
    ).toBe("APPLICATION_DISABLED");
    store.updateApplication({
      ...application,
      permissions: { ...application.permissions, open: false },
    });
    expect(
      (await policy.evaluate(await trustedInput(appAction, store))).reasonCode,
    ).toBe("APPLICATION_PERMISSION_DENIED");

    const missingWorkspace = action("git.status", {
      workspaceId: "missing.workspace",
    });
    expect(
      (await policy.evaluate(await trustedInput(missingWorkspace, store))).reasonCode,
    ).toBe("UNKNOWN_WORKSPACE");
    store.createWorkspace({
      ...workspace,
      gitPermissions: { ...workspace.gitPermissions, status: false },
    });
    const gitAction = action("git.status", { workspaceId: workspace.id });
    expect(
      (await policy.evaluate(await trustedInput(gitAction, store))).reasonCode,
    ).toBe("GIT_PERMISSION_DENIED");
    store.updateWorkspace({ ...workspace, enabled: false });
    expect(
      (await policy.evaluate(await trustedInput(gitAction, store))).reasonCode,
    ).toBe("WORKSPACE_DISABLED");

    expect(
      (
        await policy.evaluate(
          await trustedInput(
            action("security.view", { applicationId: application.id }),
            store,
          ),
        )
      ).reasonCode,
    ).toBe("INVALID_POLICY_REQUEST");
  });
});
