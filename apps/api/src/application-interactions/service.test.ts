import {
  SemanticDesktopObjectRecordSchema,
  TrustedApplicationRecordSchema,
} from "@alexa-control/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { NativeProviderRuntime } from "../native-providers/service.js";
import { InMemoryNativeProviderStore } from "../native-providers/store.js";
import { ApplicationInteractionService } from "./service.js";

const at = new Date("2026-08-21T00:00:00.000Z");

const setup = async (permissions: string[] = [
  "read_semantic_structure",
  "navigate",
  "interact",
  "edit_text",
]) => {
  const ownerId = crypto.randomUUID();
  const appStore = new InMemoryApplicationAdapterStore();
  const providerStore = new InMemoryNativeProviderStore();
  const audits: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const executionRequestId = crypto.randomUUID();
  const native = new NativeProviderRuntime(
    providerStore,
    appStore,
    audit,
    () => at,
    () => Promise.resolve({ executionRequestId }),
  );
  await native.dashboard(ownerId);
  const provider = providerStore.getProvider(ownerId, "provider.chatgpt");
  if (!provider) throw new Error("ChatGPT provider baseline missing.");
  providerStore.saveProvider({ ...provider, status: "healthy", updatedAt: at.toISOString() });
  appStore.saveTrustedApplication(
    TrustedApplicationRecordSchema.parse({
      id: "chatgpt",
      ownerId,
      applicationName: "ChatGPT",
      bundleIdentifier: "com.openai.chat",
      stableIdentifier: "chatgpt",
      applicationVersion: "1",
      executablePath: null,
      executablePathUserSupplied: false,
      codeSignature: "Developer ID Application: OpenAI",
      permissionsGranted: permissions,
      capabilities: ["navigation", "editing", "semantic_registry"],
      status: "trusted",
      lastSeenAt: at.toISOString(),
      trustLevel: "interaction",
      securityProfile: "strict",
      createdAt: at.toISOString(),
      updatedAt: at.toISOString(),
    }),
  );
  const objects = new Map(
    [
      ["composer", "editor"],
      ["Send", "button"],
      ["Sign In", "button"],
      ["Delete", "button"],
    ].map(([label, role]) => {
      const id = `semantic.${label!.toLowerCase().replaceAll(" ", "-")}`;
      return [
        id,
        SemanticDesktopObjectRecordSchema.parse({
          id,
          ownerId,
          applicationId: "chatgpt",
          windowId: null,
          parentId: null,
          childIds: [],
          role,
          displayName: label,
          aliases: [label!.toLowerCase()],
          accessibilityLabel: label,
          accessibilityIdentifier: `test.${id}`,
          description: `Test ${label} target`,
          supportedActions: role === "button" ? ["activate", "submit"] : ["set_value"],
          permissions: ["owner_session"],
          visibility: "visible",
          state: {
            enabled: true,
            visible: true,
            focused: false,
            selected: false,
            secureText: false,
            expanded: null,
            checked: null,
            valueSummary: null,
          },
          bounds: null,
          relationships: [],
          version: "1",
          confidence: 0.99,
          source: "registered_metadata",
          secureContentRedacted: true,
          updatedAt: at.toISOString(),
        }),
      ] as const;
    }),
  );
  const targetResolution = {
    resolve: (input: { request: { target: { query: string | null } } }) => {
      const target = [...objects.values()].find(
        (object) =>
          object.displayName.toLowerCase() ===
          input.request.target.query?.toLowerCase(),
      );
      return Promise.resolve({
        target: target ?? null,
        candidates: target ? [target] : [],
        record: { confidence: target ? 0.99 : 0 },
      });
    },
  };
  const service = new ApplicationInteractionService(
    appStore,
    providerStore,
    native,
    audit,
    () => at,
    () => Promise.resolve(true),
    () => Promise.resolve(undefined),
    targetResolution as never,
    (_ownerId, objectId) => objects.get(objectId) ?? null,
  );
  const plan = (
    input: Omit<Parameters<ApplicationInteractionService["planFromUtterance"]>[0], "ownerId">,
  ) => service.planFromUtterance({ ownerId, ...input });
  return { audits, executionRequestId, objects, ownerId, plan, service };
};

const executeInput = (ownerId: string, body: unknown) => ({
  ownerId,
  sessionId: crypto.randomUUID(),
  networkState: "PRIVATE_NETWORK" as const,
  requestId: crypto.randomUUID(),
  ipAddress: "127.0.0.1",
  body,
});

describe("ApplicationInteractionService", () => {
  beforeEach(() => undefined);

  it("keeps typing separate from submission", async () => {
    const { plan } = await setup();
    const typed = await plan({
      utterance: "Type 'hello from Alexa' into ChatGPT.",
      origin: "voice",
    });
    expect(typed.request).toMatchObject({
      applicationId: "chatgpt",
      capability: "insert_text",
      text: "hello from Alexa",
    });
    expect(typed.request?.target?.type).toBe("COMPOSER");

    const sendWithoutProposal = await plan({
      utterance: "Send it.",
      origin: "voice",
      currentApplicationId: "chatgpt",
    });
    expect(sendWithoutProposal.request).toBeNull();
    expect(sendWithoutProposal.clarification).toMatch(/no exact prepared composer/i);

    const sendPrepared = await plan({
      utterance: "Send it.",
      origin: "voice",
      conversationId: crypto.randomUUID(),
      previousInteractionProposal: {
        status: "EXECUTED",
        parameters: { request: typed.request },
      },
    });
    expect(sendPrepared.request).toMatchObject({
      applicationId: "chatgpt",
      capability: "submit_composer",
      text: null,
    });
    expect(sendPrepared.request?.target).not.toEqual(typed.request?.target);

    const sendUnverified = await plan({
      utterance: "Send it.",
      origin: "voice",
      previousInteractionProposal: {
        status: "PLANNED",
        parameters: { request: typed.request },
      },
    });
    expect(sendUnverified.request).toBeNull();
  });

  it("queues bounded composer insertion through the reviewed provider", async () => {
    const { executionRequestId, ownerId, plan, service } = await setup();
    const planned = (await plan({
      utterance: "Type 'hello from Alexa' into ChatGPT.",
      origin: "voice",
      conversationId: crypto.randomUUID(),
      proposalId: crypto.randomUUID(),
    })).request;
    const result = await service.execute(executeInput(ownerId, planned));

    expect(result).toMatchObject({
      status: "SUCCESS",
      providerId: "provider.chatgpt",
      executionRequestId,
      capability: "insert_text",
    });
  });

  it("does not infer interaction permission from context permission", async () => {
    const { ownerId, plan, service } = await setup(["read_semantic_structure", "navigate"]);
    const planned = (await plan({
      utterance: "Type 'hello' into ChatGPT.",
      origin: "voice",
      conversationId: crypto.randomUUID(),
      proposalId: crypto.randomUUID(),
    })).request;
    const result = await service.execute(executeInput(ownerId, planned));

    expect(result.status).toBe("PERMISSION_DENIED");
    expect(result.executionRequestId).toBeNull();
  });

  it("blocks secure input before provider dispatch", async () => {
    const { ownerId, plan, service } = await setup();
    const planned = (await plan({
      utterance: "Type 'test123' into ChatGPT.",
      origin: "voice",
    })).request!;
    const result = await service.execute(
      executeInput(ownerId, {
        ...planned,
        target: { ...planned.target, role: "AXSecureTextField", label: "Password" },
      }),
    );

    expect(result.status).toBe("SECURE_TARGET_BLOCKED");
    expect(result.executionRequestId).toBeNull();
  });

  it("rechecks registry secure state and target version before dispatch", async () => {
    const { objects, ownerId, plan, service } = await setup();
    const planned = (await plan({
      utterance: "Type 'test123' into ChatGPT.",
      origin: "voice",
      conversationId: crypto.randomUUID(),
      proposalId: crypto.randomUUID(),
    })).request!;
    const objectId = planned.target!.registryObjectId!;
    const original = objects.get(objectId)!;
    objects.set(objectId, {
      ...original,
      state: { ...original.state, secureText: true },
    });
    const secure = await service.execute(executeInput(ownerId, planned));
    expect(secure.status).toBe("SECURE_TARGET_BLOCKED");

    objects.set(objectId, { ...original, version: "2" });
    const stale = await service.execute(executeInput(ownerId, planned));
    expect(stale.status).toBe("TARGET_STALE");
  });

  it("rejects unsafe URL schemes", async () => {
    const { ownerId, service } = await setup();
    const result = await service.execute(
      executeInput(ownerId, {
        applicationId: "chatgpt",
        capability: "open_url",
        target: null,
        text: "file:///Users/owner/private.txt",
        origin: "voice",
        conversationId: null,
        proposalId: null,
      }),
    );
    expect(result.status).toBe("POLICY_DENIED");
  });

  it("fails closed for stale and low-confidence targets", async () => {
    const { ownerId, plan, service } = await setup();
    const planned = (await plan({
      utterance: "Click Sign In button in ChatGPT.",
      origin: "voice",
    })).request!;
    const stale = await service.execute(
      executeInput(ownerId, {
        ...planned,
        target: { ...planned.target, expiresAt: "2026-08-20T00:00:00.000Z" },
      }),
    );
    expect(stale.status).toBe("TARGET_STALE");

    const ambiguous = await service.execute(
      executeInput(ownerId, {
        ...planned,
        target: { ...planned.target, confidence: 0.5 },
      }),
    );
    expect(ambiguous.status).toBe("TARGET_AMBIGUOUS");
  });

  it("blocks generic destructive control activation", async () => {
    const { ownerId, plan, service } = await setup();
    const planned = (await plan({
      utterance: "Click Delete button in ChatGPT.",
      origin: "voice",
    })).request;
    const result = await service.execute(executeInput(ownerId, planned));
    expect(result.status).toBe("POLICY_DENIED");
    expect(result.message).toMatch(/not classified as a reviewed benign/i);
  });

  it("denies a mutating request that is not bound to its exact confirmed proposal", async () => {
    const { ownerId, plan, service } = await setup();
    const planned = (await plan({
      utterance: "Type 'hello' into ChatGPT.",
      origin: "voice",
      conversationId: crypto.randomUUID(),
      proposalId: crypto.randomUUID(),
    })).request!;
    const unbound = new ApplicationInteractionService(
      service.applicationStore,
      service.nativeProviderStore,
      service.nativeProviders,
      service.audit,
      () => at,
      () => Promise.resolve(false),
      () => Promise.resolve(undefined),
      service.targetResolution,
      service.getSemanticObject,
    );

    const result = await unbound.execute(executeInput(ownerId, planned));

    expect(result.status).toBe("POLICY_DENIED");
    expect(result.message).toMatch(/exact confirmed conversation proposal/i);
    expect(result.executionRequestId).toBeNull();
  });
});
