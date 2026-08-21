import {
  ApprovalResponseSchema,
  AuditListResponseSchema,
  BLOCKED_WORKSPACE_PATTERNS,
  CsrfTokenResponseSchema,
  PolicyEvaluationResponseSchema,
  WorkspaceResponseSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApi } from "./app.js";
import { BUILT_IN_TOOLS } from "./governance/defaults.js";
import { InMemoryGovernanceStore } from "./governance/store.js";
import { StaticNetworkVerifier } from "./identity/network.js";

const origin = "http://localhost:5173";

const cookieFrom = (header: string | string[] | undefined) => {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error("Expected cookie.");
  return value.split(";")[0] ?? "";
};

describe("Phase 2.2 governance API", () => {
  let app: FastifyInstance;
  let cookie: string;
  let csrf: string;
  const mutationHeaders = () => ({ cookie, origin, "x-csrf-token": csrf });

  beforeEach(async () => {
    app = await buildApi({
      corsOrigin: origin,
      privateNetworkRequired: true,
      nodeEnvironment: "test",
      logger: false,
      governanceStore: new InMemoryGovernanceStore(BUILT_IN_TOOLS, false),
      networkVerifier: new StaticNetworkVerifier("PRIVATE_NETWORK"),
    });
    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { origin },
      payload: {
        email: "governance@example.com",
        displayName: "Governance Owner",
        password: "Violet-Harbor-2026!",
      },
    });
    cookie = cookieFrom(registration.headers["set-cookie"]);
    const csrfResponse = await app.inject({
      method: "GET",
      url: "/api/security/csrf",
      headers: { cookie, origin },
    });
    csrf = CsrfTokenResponseSchema.parse(csrfResponse.json()).token;
  });

  afterEach(async () => app.close());

  it("requires authentication and trusted origins", async () => {
    for (const url of [
      "/api/applications",
      "/api/workspaces",
      "/api/tools",
      "/api/policies/evaluations",
      "/api/approvals",
    ]) {
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    }
    const denied = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: { ...mutationHeaders(), origin: "https://attacker.example" },
      payload: {
        id: "example.editor",
        displayName: "Editor",
        macBundleId: "com.example.editor",
      },
    });
    expect(denied.statusCode).toBe(403);
  });

  it("registers, updates, disables, and audits safe application metadata", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: mutationHeaders(),
      payload: {
        id: "example.editor",
        displayName: "Editor",
        macBundleId: "com.example.editor",
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      id: "example.editor",
      enabled: false,
      permissions: { open: false, automate: false },
    });
    expect(JSON.stringify(created.json())).not.toContain("executablePath");

    const invalid = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: mutationHeaders(),
      payload: {
        id: "example.bad",
        displayName: "Bad",
        macBundleId: "com.example.bad",
        executablePath: "/Applications/Bad.app",
      },
    });
    expect(invalid.statusCode).toBe(400);

    const updated = await app.inject({
      method: "PATCH",
      url: "/api/applications/example.editor",
      headers: mutationHeaders(),
      payload: { displayName: "Updated", enabled: true },
    });
    expect(updated.json()).toMatchObject({ displayName: "Updated", enabled: true });

    const disabled = await app.inject({
      method: "POST",
      url: "/api/applications/example.editor/disable",
      headers: mutationHeaders(),
    });
    expect(disabled.json()).toMatchObject({ enabled: false });
    const audit = await app.inject({
      method: "GET",
      url: "/api/audit",
      headers: { cookie },
    });
    expect(
      AuditListResponseSchema.parse(audit.json()).some(
        (record) => record.eventType === "APPLICATION_REGISTERED",
      ),
    ).toBe(true);
  });

  it("registers workspace metadata without enabling deletion or inspecting paths", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: mutationHeaders(),
      payload: {
        id: "project.main",
        displayName: "Main",
        rootPath: "/Users/owner/project",
        blockedPatterns: ["private.txt"],
      },
    });
    expect(created.statusCode).toBe(200);
    const workspace = WorkspaceResponseSchema.parse(created.json());
    expect(workspace).toMatchObject({
      permissions: { deleteFile: false },
      gitPermissions: { push: false },
    });
    expect(workspace.blockedPatterns).toEqual(
      expect.arrayContaining([...BLOCKED_WORKSPACE_PATTERNS, "private.txt"]),
    );

    const deletePermission = await app.inject({
      method: "PATCH",
      url: "/api/workspaces/project.main",
      headers: mutationHeaders(),
      payload: {
        permissions: {
          read: false,
          write: false,
          createFile: false,
          modifyFile: false,
          moveFile: false,
          deleteFile: true,
          runScripts: false,
        },
      },
    });
    expect(deletePermission.statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/workspaces",
          headers: mutationHeaders(),
          payload: {
            id: "project.root",
            displayName: "Root",
            rootPath: "/",
          },
        })
      ).statusCode,
    ).toBe(400);
  });

  it("keeps tools source-controlled and evaluates explicit approvals", async () => {
    const tools = await app.inject({
      method: "GET",
      url: "/api/tools",
      headers: { cookie },
    });
    expect(tools.statusCode).toBe(200);
    expect(tools.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "security.view" }),
        expect.objectContaining({ name: "shell.execute_arbitrary" }),
      ]),
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/tools",
          headers: mutationHeaders(),
          payload: {},
        })
      ).statusCode,
    ).toBe(404);

    const proposal = {
      action: {
        actionId: crypto.randomUUID(),
        toolName: "governance.update_registry",
        arguments: { change: "metadata only" },
      },
    };
    const evaluated = await app.inject({
      method: "POST",
      url: "/api/policies/evaluate",
      headers: mutationHeaders(),
      payload: proposal,
    });
    const result = PolicyEvaluationResponseSchema.parse(evaluated.json());
    expect(result.evaluation).toMatchObject({
      decision: "require_approval",
      executionAllowed: false,
    });

    const approved = await app.inject({
      method: "POST",
      url: `/api/approvals/${result.evaluation.approvalRequestId}/approve`,
      headers: mutationHeaders(),
      payload: {},
    });
    expect(ApprovalResponseSchema.parse(approved.json()).status).toBe("APPROVED");

    const reevaluated = await app.inject({
      method: "POST",
      url: "/api/policies/evaluate",
      headers: mutationHeaders(),
      payload: proposal,
    });
    expect(reevaluated.json()).toMatchObject({
      evaluation: {
        decision: "allow",
        executionAllowed: false,
        reasonCode: "POLICY_ALLOWED_WITH_APPROVAL",
      },
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/policies/evaluations",
          headers: { cookie },
        })
      ).json(),
    ).toHaveLength(2);
  });

  it("fails closed for recent authentication, unknown network, and emergency stop", async () => {
    const high = await app.inject({
      method: "POST",
      url: "/api/policies/evaluate",
      headers: mutationHeaders(),
      payload: {
        action: {
          actionId: crypto.randomUUID(),
          toolName: "security.modify",
          arguments: {},
        },
      },
    });
    const highResult = PolicyEvaluationResponseSchema.parse(high.json());
    expect(highResult.evaluation.reasonCode).toBe("RECENT_AUTHENTICATION_REQUIRED");
    const approval = await app.inject({
      method: "POST",
      url: `/api/approvals/${highResult.evaluation.approvalRequestId}/approve`,
      headers: mutationHeaders(),
      payload: {},
    });
    expect(approval.statusCode).toBe(409);
    expect(approval.json()).toMatchObject({
      error: { code: "RECENT_AUTHENTICATION_REQUIRED" },
    });

    await app.inject({
      method: "POST",
      url: "/api/security/emergency-stop",
      headers: mutationHeaders(),
    });
    const stopped = await app.inject({
      method: "POST",
      url: "/api/policies/evaluate",
      headers: mutationHeaders(),
      payload: {
        action: {
          actionId: crypto.randomUUID(),
          toolName: "security.view",
          arguments: {},
        },
      },
    });
    expect(stopped.json()).toMatchObject({
      evaluation: { reasonCode: "EMERGENCY_STOP_ACTIVE" },
    });

    const unknownApp = await buildApi({
      corsOrigin: origin,
      privateNetworkRequired: true,
      logger: false,
      governanceStore: new InMemoryGovernanceStore(BUILT_IN_TOOLS, false),
    });
    const unknownRegistration = await unknownApp.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { origin },
      payload: {
        email: "unknown@example.com",
        displayName: "Unknown",
        password: "Violet-Harbor-2026!",
      },
    });
    const unknownCookie = cookieFrom(unknownRegistration.headers["set-cookie"]);
    const unknownCsrfResponse = await unknownApp.inject({
      method: "GET",
      url: "/api/security/csrf",
      headers: { cookie: unknownCookie, origin },
    });
    const unknownCsrf = CsrfTokenResponseSchema.parse(unknownCsrfResponse.json()).token;
    const unknown = await unknownApp.inject({
      method: "POST",
      url: "/api/policies/evaluate",
      headers: {
        cookie: unknownCookie,
        origin,
        "x-csrf-token": unknownCsrf,
      },
      payload: {
        action: {
          actionId: crypto.randomUUID(),
          toolName: "security.view",
          arguments: {},
        },
      },
    });
    expect(unknown.json()).toMatchObject({
      evaluation: { reasonCode: "NETWORK_NOT_VERIFIED" },
      networkVerification: "UNKNOWN",
    });
    await unknownApp.close();
  });
});
