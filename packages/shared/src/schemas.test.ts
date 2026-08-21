import { describe, expect, it } from "vitest";

import {
  AllowedApplicationSchema,
  AllowedWorkspaceSchema,
  ApprovalRequestSchema,
  BLOCKED_WORKSPACE_PATTERNS,
  CreateApplicationRequestSchema,
  CreateWorkspaceRequestSchema,
  ApiResponseSchema,
  DEFAULT_GESTURE_SECURITY_POLICY,
  DeviceTrustStatusSchema,
  DesktopSpatialInteractionRequestSchema,
  GestureEventSchema,
  GestureSecurityPolicySchema,
  NativeSpatialGesturePayloadSchema,
  Point2DSchema,
  PolicyEvaluationSchema,
  PolicyEvaluationResponseSchema,
  ProposedActionSchema,
  PasswordSchema,
  RecordSpatialEngineMetricRequestSchema,
  RecordSpatialInteractionMetricRequestSchema,
  RegisteredDeviceSchema,
  RiskLevelSchema,
  SignedCommandEnvelopeSchema,
  SpatialUiDashboardResponseSchema,
  ToolDefinitionSchema,
  canonicalizeSignedCommand,
} from "./index.js";

const now = "2026-07-27T00:00:00.000Z";
const later = "2026-07-27T00:01:00.000Z";

describe("API response contracts", () => {
  it("rejects logically invalid combinations", () => {
    expect(
      ApiResponseSchema.safeParse({
        success: true,
        error: { code: "NO", message: "not allowed" },
      }).success,
    ).toBe(false);
    expect(ApiResponseSchema.safeParse({ success: false }).success).toBe(false);
  });
});

describe("authentication contracts", () => {
  it("enforces strong passwords", () => {
    expect(PasswordSchema.safeParse("weak-password").success).toBe(false);
    expect(PasswordSchema.safeParse("Violet-Harbor-2026!").success).toBe(true);
  });
});

describe("device security contracts", () => {
  it("validates registered devices", () => {
    expect(
      RegisteredDeviceSchema.safeParse({
        id: "00000000-0000-4000-8000-000000000002",
        deviceName: "Owner browser",
        deviceType: "WEB_BROWSER",
        trustStatus: "TRUSTED",
        publicKey: {
          kty: "OKP",
          crv: "Ed25519",
          x: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ",
        },
        fingerprint: "SHA256:future-placeholder",
        pairedAt: now,
        lastSeen: null,
        revokedAt: null,
        ownerId: "00000000-0000-4000-8000-000000000001",
        createdAt: now,
        capabilities: ["security.view"],
        metadata: {},
      }).success,
    ).toBe(true);
    expect(DeviceTrustStatusSchema.safeParse("trusted-ish").success).toBe(false);
  });

  it("requires complete signed envelopes with future expiry", () => {
    const envelope = {
      commandId: "00000000-0000-4000-8000-000000000003",
      deviceId: "00000000-0000-4000-8000-000000000002",
      issuedAt: now,
      expiresAt: later,
      nonce: "unique-nonce-value",
      payload: { tool: "security.view" },
      signature: "required-future-signature-that-is-long-enough",
      signatureAlgorithm: "Ed25519",
      protocolVersion: "1",
    };

    expect(SignedCommandEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(
      SignedCommandEnvelopeSchema.safeParse({
        ...envelope,
        expiresAt: now,
      }).success,
    ).toBe(false);
    expect(
      SignedCommandEnvelopeSchema.safeParse({
        ...envelope,
        signature: undefined,
      }).success,
    ).toBe(false);
  });

  it("canonicalises signed payload keys deterministically", () => {
    const base = {
      commandId: "00000000-0000-4000-8000-000000000003",
      deviceId: "00000000-0000-4000-8000-000000000002",
      issuedAt: now,
      expiresAt: later,
      nonce: "unique-nonce-value",
      signatureAlgorithm: "Ed25519" as const,
      protocolVersion: "1" as const,
    };
    expect(
      canonicalizeSignedCommand({
        ...base,
        payload: { beta: 2, alpha: 1 },
      }),
    ).toBe(
      canonicalizeSignedCommand({
        ...base,
        payload: { alpha: 1, beta: 2 },
      }),
    );
  });
});

describe("registry and tool contracts", () => {
  it("validates an application registry record", () => {
    expect(
      AllowedApplicationSchema.safeParse({
        id: "editor",
        ownerId: "00000000-0000-4000-8000-000000000001",
        displayName: "Approved editor",
        macBundleId: "com.example.editor",
        enabled: false,
        permissions: {},
        riskOverrides: {},
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true);
  });

  it("applies deny-by-default workspace permissions", () => {
    const result = AllowedWorkspaceSchema.parse({
      id: "workspace_1",
      ownerId: "00000000-0000-4000-8000-000000000001",
      displayName: "Future workspace",
      rootPath: "/registered/root",
      enabled: false,
      blockedPatterns: [...BLOCKED_WORKSPACE_PATTERNS],
      allowedScripts: [],
      createdAt: now,
      updatedAt: now,
    });

    expect(result.permissions.read).toBe(false);
    expect(result.permissions.deleteFile).toBe(false);
    expect(result.gitPermissions.commit).toBe(false);
    expect(result.gitPermissions.push).toBe(false);
  });

  it("validates registered tools and rejects unknown risks", () => {
    expect(
      ToolDefinitionSchema.safeParse({
        name: "git.status",
        description: "Read registered workspace status",
        inputSchemaId: "git-status-input-v1",
        outputSchemaId: "git-status-output-v1",
        riskLevel: "read_only",
        requiredCapabilities: ["git.status"],
        approvalRequirement: "none",
        targetType: "workspace",
        requiresTrustedDevice: true,
        timeoutMs: 5_000,
        supportsCancellation: true,
        supportsDryRun: false,
        enabled: false,
        version: "1",
      }).success,
    ).toBe(true);
    expect(RiskLevelSchema.safeParse("critical").success).toBe(false);
  });
});

describe("policy and gesture contracts", () => {
  it("validates policy evaluations", () => {
    expect(
      PolicyEvaluationSchema.safeParse({
        id: "00000000-0000-4000-8000-000000000010",
        actionId: "00000000-0000-4000-8000-000000000011",
        ownerId: "00000000-0000-4000-8000-000000000001",
        decision: "deny",
        reasonCode: "EXECUTION_DISABLED",
        humanReadableReason: "Execution is disabled.",
        matchedRules: ["phase1.execution.disabled"],
        riskLevel: "low",
        approvalRequirement: "explicit",
        executionAllowed: false,
        evaluatedAt: now,
      }).success,
    ).toBe(true);
  });

  it("rejects unsafe registry input and executable paths", () => {
    expect(
      CreateApplicationRequestSchema.safeParse({
        id: "Bad ID",
        displayName: "Bad",
        macBundleId: "/Applications/Bad.app",
        executablePath: "/Applications/Bad.app",
      }).success,
    ).toBe(false);
    expect(
      CreateWorkspaceRequestSchema.safeParse({
        id: "workspace.root",
        displayName: "Root",
        rootPath: "/",
      }).success,
    ).toBe(false);
    expect(
      CreateWorkspaceRequestSchema.safeParse({
        id: "workspace.home",
        displayName: "Home",
        rootPath: "/Users/owner",
        permissions: { deleteFile: true },
      }).success,
    ).toBe(false);
  });

  it("validates proposed actions, approvals, and literal non-execution", () => {
    const action = {
      actionId: "00000000-0000-4000-8000-000000000011",
      toolName: "security.view",
      arguments: {},
    };
    expect(ProposedActionSchema.safeParse(action).success).toBe(true);
    const evaluation = {
      id: "00000000-0000-4000-8000-000000000010",
      actionId: action.actionId,
      ownerId: "00000000-0000-4000-8000-000000000001",
      decision: "deny",
      reasonCode: "NETWORK_NOT_VERIFIED",
      humanReadableReason: "Network state is unknown.",
      matchedRules: ["network.unknown.denied"],
      riskLevel: "read_only",
      approvalRequirement: "none",
      executionAllowed: false,
      evaluatedAt: now,
    };
    expect(
      PolicyEvaluationResponseSchema.safeParse({
        evaluation,
        networkVerification: "UNKNOWN",
      }).success,
    ).toBe(true);
    expect(
      PolicyEvaluationResponseSchema.safeParse({
        evaluation: { ...evaluation, executionAllowed: true },
        networkVerification: "UNKNOWN",
      }).success,
    ).toBe(false);
    expect(
      ApprovalRequestSchema.safeParse({
        id: "00000000-0000-4000-8000-000000000020",
        ownerId: "00000000-0000-4000-8000-000000000001",
        actionId: action.actionId,
        actionDigest: "a".repeat(64),
        toolName: "security.modify",
        riskLevel: "high",
        approvalRequirement: "recent_authentication",
        status: "PENDING",
        humanSummary: "security.modify",
        requestedAt: now,
        expiresAt: later,
        decidedAt: null,
        decidedBySessionId: null,
        rejectionReason: null,
      }).success,
    ).toBe(true);
  });

  it("rejects invalid coordinates and confidence", () => {
    expect(Point2DSchema.safeParse({ x: -0.1, y: 0.5 }).success).toBe(false);
    expect(
      GestureEventSchema.safeParse({
        id: "gesture_1",
        gesture: "pinch",
        mode: "assistant",
        handedness: "right",
        confidence: 1.2,
        startedAt: 1,
        durationMs: 10,
        metadata: {},
      }).success,
    ).toBe(false);
  });

  it("uses safe gesture security defaults", () => {
    expect(GestureSecurityPolicySchema.parse(DEFAULT_GESTURE_SECURITY_POLICY)).toEqual(
      DEFAULT_GESTURE_SECURITY_POLICY,
    );
  });

  it("allows native spatial app targets only for registered launch or focus", () => {
    const payload = {
      operation: "native_spatial_gesture",
      gesture: "pinch",
      confidence: 0.91,
      handedness: "right",
      state: "confirmed",
      runtimeState: "tracking",
      source: "native_spatial_runtime",
      applicationTarget: {
        providerId: "provider.vscode",
        applicationId: "vscode",
        capability: "focus",
      },
    };
    expect(NativeSpatialGesturePayloadSchema.safeParse(payload).success).toBe(true);
    expect(
      NativeSpatialGesturePayloadSchema.safeParse({
        ...payload,
        applicationTarget: {
          ...payload.applicationTarget,
          capability: "click",
        },
      }).success,
    ).toBe(false);
    expect(
      NativeSpatialGesturePayloadSchema.safeParse({
        ...payload,
        applicationTarget: {
          ...payload.applicationTarget,
          executablePath: "/Applications/Visual Studio Code.app",
        },
      }).success,
    ).toBe(false);
  });

  it("keeps spatial UI interactions non-executable and accessibility compatible", () => {
    expect(
      SpatialUiDashboardResponseSchema.safeParse({
        components: [],
        interactionProfiles: [],
        animationProfiles: [],
        preferences: [],
        sessions: [],
        metrics: [],
        gestureSequences: [],
        predictions: [],
        cursorMetrics: [],
        raySessions: [],
        physicsProfiles: [],
        navigationHistory: [],
        focusEngineAvailable: true,
        hoverEngineAvailable: true,
        dwellEngineAvailable: true,
        dragDropFrameworkAvailable: true,
        directExecutionAvailable: false,
        routesThroughIntentEngine: true,
        keyboardFallbackAvailable: true,
        mouseFallbackAvailable: true,
        spatialCursorAvailable: true,
        handRaysAvailable: true,
        predictionEngineAvailable: true,
        magneticTargetingAvailable: true,
        depthEngineAvailable: true,
        radialMenusAvailable: true,
      }).success,
    ).toBe(true);
    expect(
      SpatialUiDashboardResponseSchema.safeParse({
        components: [],
        interactionProfiles: [],
        animationProfiles: [],
        preferences: [],
        sessions: [],
        metrics: [],
        gestureSequences: [],
        predictions: [],
        cursorMetrics: [],
        raySessions: [],
        physicsProfiles: [],
        navigationHistory: [],
        focusEngineAvailable: true,
        hoverEngineAvailable: true,
        dwellEngineAvailable: true,
        dragDropFrameworkAvailable: true,
        directExecutionAvailable: true,
        routesThroughIntentEngine: true,
        keyboardFallbackAvailable: true,
        mouseFallbackAvailable: true,
        spatialCursorAvailable: true,
        handRaysAvailable: true,
        predictionEngineAvailable: true,
        magneticTargetingAvailable: true,
        depthEngineAvailable: true,
        radialMenusAvailable: true,
      }).success,
    ).toBe(false);
    expect(
      RecordSpatialInteractionMetricRequestSchema.safeParse({
        componentId: "nav:/agents",
        eventType: "spatial_activate",
        state: "activated",
        confidence: 0.88,
        latencyMs: 12,
        rawFrame: "must-not-cross",
      }).success,
    ).toBe(false);
    expect(
      RecordSpatialEngineMetricRequestSchema.safeParse({
        cursor: {
          x: 0.3,
          y: 0.4,
          depth: 0.5,
          confidence: 0.9,
          velocity: 0.2,
          acceleration: 1,
          rawFrame: "must-not-cross",
        },
      }).success,
    ).toBe(false);
    expect(
      DesktopSpatialInteractionRequestSchema.safeParse({
        objectId: "desktop.object.dashboard",
        interactionType: "inspect",
        gesture: "point",
        input: { rawMouse: { x: 10, y: 20 } },
      }).success,
    ).toBe(false);
    expect(
      DesktopSpatialInteractionRequestSchema.safeParse({
        objectId: "desktop.object.dashboard",
        interactionType: "inspect",
        gesture: "point",
        input: { reason: "bounded metadata only" },
      }).success,
    ).toBe(true);
  });
});
