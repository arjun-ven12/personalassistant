import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api.js";

describe("web API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("validates a health response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          service: "alexa-api",
          version: "0.1.0",
          timestamp: new Date().toISOString(),
          uptimeSeconds: 2,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createApiClient("http://localhost:3001").getHealth(),
    ).resolves.toMatchObject({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/health",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("rejects an invalid response instead of trusting it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "pretend-online" }), {
          status: 200,
        }),
      ),
    );

    await expect(
      createApiClient("http://localhost:3001").getSystemStatus(),
    ).rejects.toThrow();
  });

  it("validates application registry responses and rejects unsafe shapes", async () => {
    const validApplication = {
      id: "example.editor",
      ownerId: "00000000-0000-4000-8000-000000000001",
      displayName: "Editor",
      macBundleId: "com.example.editor",
      enabled: false,
      permissions: {
        open: false,
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
      riskOverrides: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([validApplication]), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ ...validApplication, executablePath: "/unsafe" }]),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient("http://localhost:3001");
    await expect(client.getApplications()).resolves.toHaveLength(1);
    await expect(client.getApplications()).rejects.toThrow();
  });

  it("validates policy results and literal execution denial", async () => {
    const evaluation = {
      id: "00000000-0000-4000-8000-000000000010",
      actionId: "00000000-0000-4000-8000-000000000011",
      ownerId: "00000000-0000-4000-8000-000000000001",
      decision: "deny",
      reasonCode: "NETWORK_NOT_VERIFIED",
      humanReadableReason: "Network verification returned UNKNOWN.",
      matchedRules: ["network.unknown.denied"],
      riskLevel: "read_only",
      approvalRequirement: "none",
      executionAllowed: false,
      evaluatedAt: new Date().toISOString(),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "x".repeat(43),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            evaluation,
            networkVerification: "UNKNOWN",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            evaluation: { ...evaluation, executionAllowed: true },
            networkVerification: "UNKNOWN",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient("http://localhost:3001");
    await expect(
      client.evaluatePolicy({
        action: {
          actionId: evaluation.actionId,
          toolName: "security.view",
          arguments: {},
        },
      }),
    ).resolves.toMatchObject({ evaluation: { executionAllowed: false } });
    await expect(
      client.evaluatePolicy({
        action: {
          actionId: crypto.randomUUID(),
          toolName: "security.view",
          arguments: {},
        },
      }),
    ).rejects.toThrow();
  });

  it("propagates approval and authentication failures with stable codes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "x".repeat(43),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "RECENT_AUTHENTICATION_REQUIRED",
              message: "Recent authentication is required.",
            },
          }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "AUTHENTICATION_REQUIRED",
              message: "A valid session is required.",
            },
          }),
          { status: 401 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient("http://localhost:3001");
    await expect(client.approveApproval(crypto.randomUUID())).rejects.toMatchObject({
      status: 409,
      code: "RECENT_AUTHENTICATION_REQUIRED",
    });
    await expect(client.getApplications()).rejects.toMatchObject({
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
    });
  });

  it("refreshes a stale CSRF token and retries one mutation", async () => {
    const session = {
      id: crypto.randomUUID(),
      ownerId: crypto.randomUUID(),
      status: "listening",
      runtimeState: "listening",
      microphoneDeviceId: null,
      wakeWordEnabled: true,
      localAudioOnly: true,
      rawAudioPersisted: false,
      transcriptCount: 0,
      interruptionCount: 0,
      startedAt: new Date().toISOString(),
      endedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const dashboard = {
      sessions: [session],
      profiles: [],
      shortcuts: [],
      conversationHistory: [],
      metrics: [],
      microphonePreferences: [],
      wakeWordSettings: [],
      ttsProfiles: [],
      sttProviderMetrics: [],
      conversationSessions: [],
      conversationTopics: [],
      conversationGoals: [],
      conversationSummaries: [],
      conversationPersonas: [],
      clarificationHistory: [],
      conversationContext: [],
      conversationAnalytics: [],
      conversationBookmarks: [],
      runtime: {
        persistent: true,
        state: "idle",
        browserSupported: true,
        electronSupported: true,
        routesThroughIntentEngine: true,
        voiceCanApproveHighRisk: false,
        rawAudioPersisted: false,
        localAudioOnlyByDefault: true,
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "x".repeat(43),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "CSRF_TOKEN_INVALID",
              message: "The CSRF token is invalid.",
            },
          }),
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "y".repeat(43),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(dashboard), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createApiClient("http://localhost:3001").createVoiceSession({
        wakeWordEnabled: true,
        reuseActiveSession: false,
      }),
    ).resolves.toMatchObject({ sessions: [{ id: session.id }] });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const firstMutation = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    const retriedMutation = fetchMock.mock.calls[3]?.[1] as RequestInit | undefined;
    expect(firstMutation?.headers).toMatchObject({
      "x-csrf-token": "x".repeat(43),
    });
    expect(retriedMutation?.headers).toMatchObject({
      "x-csrf-token": "y".repeat(43),
    });
  });
});
