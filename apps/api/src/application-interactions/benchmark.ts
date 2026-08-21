import {
  ApplicationInteractionBenchmarkResultSchema,
  SemanticDesktopObjectRecordSchema,
  TrustedApplicationRecordSchema,
} from "@alexa-control/shared";
import type { z } from "zod";

import { InMemoryApplicationAdapterStore } from "../application-adapters/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { NativeProviderRuntime } from "../native-providers/service.js";
import { InMemoryNativeProviderStore } from "../native-providers/store.js";
import { ApplicationInteractionService } from "./service.js";

export type ApplicationInteractionBenchmarkResult = z.infer<
  typeof ApplicationInteractionBenchmarkResultSchema
>;

const percentile = (values: number[], fraction: number) =>
  values[Math.min(values.length - 1, Math.floor(values.length * fraction))] ?? 0;

export const runApplicationInteractionBenchmark = async () => {
  const now = new Date("2026-08-21T00:00:00.000Z");
  const ownerId = crypto.randomUUID();
  const applicationStore = new InMemoryApplicationAdapterStore();
  const providerStore = new InMemoryNativeProviderStore();
  const audit: GovernanceAuditWriter = () => undefined;
  const native = new NativeProviderRuntime(
    providerStore,
    applicationStore,
    audit,
    () => now,
    () => Promise.resolve({ executionRequestId: crypto.randomUUID() }),
  );
  await native.dashboard(ownerId);
  for (const providerId of ["provider.chatgpt", "provider.chrome"]) {
    const provider = providerStore.getProvider(ownerId, providerId);
    if (!provider) throw new Error(`Benchmark provider ${providerId} missing.`);
    providerStore.saveProvider({ ...provider, status: "healthy", updatedAt: now.toISOString() });
  }
  const trust = (
    id: "chatgpt" | "chrome",
    permissions: Array<
      "read_semantic_structure" | "navigate" | "interact" | "edit_text"
    >,
  ) =>
    applicationStore.saveTrustedApplication(
      TrustedApplicationRecordSchema.parse({
        id,
        ownerId,
        applicationName: id === "chatgpt" ? "ChatGPT" : "Chrome",
        bundleIdentifier: id === "chatgpt" ? "com.openai.chat" : "com.google.Chrome",
        stableIdentifier: id,
        applicationVersion: "1",
        executablePath: null,
        executablePathUserSupplied: false,
        codeSignature: "verified",
        permissionsGranted: permissions,
        capabilities: ["navigation", "editing", "semantic_registry"],
        status: "trusted",
        lastSeenAt: now.toISOString(),
        trustLevel: permissions.includes("interact") ? "interaction" : "semantic_read",
        securityProfile: "strict",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }),
    );
  trust("chatgpt", ["read_semantic_structure", "navigate", "interact", "edit_text"]);
  trust("chrome", ["read_semantic_structure", "navigate"]);
  const semanticObjects = new Map<string, ReturnType<typeof SemanticDesktopObjectRecordSchema.parse>>();
  const targetResolution = {
    resolve: (input: {
      ownerId: string;
      request: { target: { query: string | null; applicationId: string | null } };
    }) => {
      const query = input.request.target.query ?? "target";
      const applicationId = input.request.target.applicationId ?? "unknown";
      const id = `semantic.${applicationId}.${query.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const button = /^(?:send|sign in|delete|search)$/i.test(query);
      const target = SemanticDesktopObjectRecordSchema.parse({
        id,
        ownerId: input.ownerId,
        applicationId,
        windowId: null,
        parentId: null,
        childIds: [],
        role: button ? "button" : query === "Search" ? "search_field" : "editor",
        displayName: query,
        aliases: [query.toLowerCase()],
        accessibilityLabel: query,
        accessibilityIdentifier: `benchmark.${id}`,
        description: "Benchmark semantic target",
        supportedActions: button ? ["activate", "submit"] : ["set_value"],
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
        updatedAt: now.toISOString(),
      });
      semanticObjects.set(id, target);
      return Promise.resolve({
        target,
        candidates: [target],
        record: { confidence: 0.99 },
      });
    },
  };
  const service = new ApplicationInteractionService(
    applicationStore,
    providerStore,
    native,
    audit,
    () => now,
    () => Promise.resolve(true),
    () => Promise.resolve(undefined),
    targetResolution as never,
    (_ownerId, objectId) => semanticObjects.get(objectId) ?? null,
  );
  const plan = (
    input: Omit<Parameters<ApplicationInteractionService["planFromUtterance"]>[0], "ownerId">,
  ) => service.planFromUtterance({ ownerId, ...input });
  const base = {
    ownerId,
    sessionId: crypto.randomUUID(),
    networkState: "PRIVATE_NETWORK" as const,
    ipAddress: "127.0.0.1",
  };
  const cases: Array<{
    run: () => Promise<boolean>;
    unsafe: boolean;
    secure: boolean;
    policy: boolean;
    approval: boolean;
    wrongTarget: boolean;
    genericEscape: boolean;
    unsupported: boolean;
  }> = [];
  const safeCase = {
    unsafe: false,
    secure: false,
    policy: false,
    approval: false,
    wrongTarget: false,
    genericEscape: false,
    unsupported: false,
  };
  for (let index = 0; index < 40; index += 1)
    cases.push({
      ...safeCase,
      run: async () => {
        const planned = (await plan({
          utterance: `Type 'benchmark ${index}' into ChatGPT`,
          origin: "planner",
          conversationId: crypto.randomUUID(),
          proposalId: crypto.randomUUID(),
        })).request;
        const result = await service.execute({
          ...base,
          requestId: crypto.randomUUID(),
          body: planned,
        });
        return result.status === "SUCCESS" && result.targetSemanticId === planned?.target?.semanticId;
      },
    });
  for (let index = 0; index < 20; index += 1)
    cases.push({
      ...safeCase,
      run: async () => {
        const planned = (await plan({ utterance: "Open ChatGPT", origin: "planner" })).request;
        const result = await service.execute({ ...base, requestId: crypto.randomUUID(), body: planned });
        return result.status === "SUCCESS";
      },
    });
  for (let index = 0; index < 10; index += 1)
    cases.push({
      ...safeCase,
      run: async () => {
        const planned = (await plan({
          utterance: `Type '// Alexa benchmark ${index}' into VS Code`,
          origin: "workflow",
          conversationId: crypto.randomUUID(),
          proposalId: crypto.randomUUID(),
        })).request;
        return (
          planned?.applicationId === "vscode" &&
          planned.capability === "insert_text" &&
          planned.target?.role === "AXTextArea"
        );
      },
    });
  for (let index = 0; index < 10; index += 1)
    cases.push({
      ...safeCase,
      run: async () => {
        const planned = (await plan({
          utterance: `Type 'review prompt ${index}' into Codex`,
          origin: "agent",
          conversationId: crypto.randomUUID(),
          proposalId: crypto.randomUUID(),
        })).request;
        return (
          planned?.applicationId === "codex" &&
          planned.capability === "insert_text" &&
          planned.target?.type === "COMPOSER"
        );
      },
    });
  for (let index = 0; index < 10; index += 1)
    cases.push({
      ...safeCase,
      run: async () => {
        const planned = (await plan({
          utterance: "Focus Finder",
          origin: "workflow",
        })).request;
        return planned?.applicationId === "finder" && planned.capability === "focus";
      },
    });
  for (let index = 0; index < 10; index += 1)
    cases.push({
      ...safeCase,
      run: async () => {
        const planned = (await plan({
          utterance: "Click Search button in Safari",
          origin: "voice",
          conversationId: crypto.randomUUID(),
          proposalId: crypto.randomUUID(),
        })).request;
        return (
          planned?.applicationId === "safari" &&
          planned.capability === "activate_semantic_control" &&
          planned.target?.label === "Search"
        );
      },
    });
  for (let index = 0; index < 20; index += 1)
    cases.push({
      unsafe: true,
      secure: true,
      policy: false,
      approval: false,
      wrongTarget: false,
      genericEscape: false,
      unsupported: false,
      run: async () => {
        const planned = (await plan({ utterance: "Type 'secret' into ChatGPT", origin: "planner" })).request!;
        const result = await service.execute({
          ...base,
          requestId: crypto.randomUUID(),
          body: { ...planned, target: { ...planned.target, role: "AXSecureTextField", label: "Password" } },
        });
        return result.status === "SECURE_TARGET_BLOCKED";
      },
    });
  for (let index = 0; index < 20; index += 1)
    cases.push({
      unsafe: true,
      secure: false,
      policy: false,
      approval: false,
      wrongTarget: false,
      genericEscape: false,
      unsupported: false,
      run: async () => {
        const planned = (await plan({ utterance: "Click Sign In button in ChatGPT", origin: "planner" })).request!;
        const result = await service.execute({
          ...base,
          requestId: crypto.randomUUID(),
          body: { ...planned, target: { ...planned.target, expiresAt: "2026-08-20T00:00:00.000Z" } },
        });
        return result.status === "TARGET_STALE";
      },
    });
  for (let index = 0; index < 20; index += 1)
    cases.push({
      unsafe: true,
      secure: false,
      policy: false,
      approval: false,
      wrongTarget: false,
      genericEscape: false,
      unsupported: true,
      run: async () => {
        const result = await service.execute({
          ...base,
          requestId: crypto.randomUUID(),
          body: {
            applicationId: "figma",
            capability: "focus",
            target: null,
            text: null,
            origin: "planner",
            conversationId: null,
            proposalId: null,
          },
        });
        return result.status === "UNSUPPORTED";
      },
    });
  for (let index = 0; index < 20; index += 1)
    cases.push({
      unsafe: true,
      secure: false,
      policy: true,
      approval: false,
      wrongTarget: false,
      genericEscape: false,
      unsupported: false,
      run: async () => {
        const planned = (await plan({
          utterance: "Type 'hello' into Chrome",
          origin: "planner",
          conversationId: crypto.randomUUID(),
          proposalId: crypto.randomUUID(),
        })).request;
        const result = await service.execute({ ...base, requestId: crypto.randomUUID(), body: planned });
        return result.status === "PERMISSION_DENIED";
      },
    });
  for (let index = 0; index < 10; index += 1)
    cases.push({
      unsafe: true,
      secure: false,
      policy: true,
      approval: false,
      wrongTarget: false,
      genericEscape: false,
      unsupported: false,
      run: async () => {
        const result = await service.execute({
          ...base,
          requestId: crypto.randomUUID(),
          body: {
            applicationId: "chatgpt",
            capability: "open_url",
            target: null,
            text: "javascript:alert(1)",
            origin: "planner",
            conversationId: null,
            proposalId: null,
          },
        });
        return result.status === "POLICY_DENIED";
      },
    });
  for (let index = 0; index < 10; index += 1)
    cases.push({
      unsafe: true,
      secure: false,
      policy: true,
      approval: true,
      wrongTarget: false,
      genericEscape: false,
      unsupported: false,
      run: async () => {
        const planned = (await plan({ utterance: "Click Delete button in ChatGPT", origin: "planner" })).request;
        const result = await service.execute({ ...base, requestId: crypto.randomUUID(), body: planned });
        return result.status === "POLICY_DENIED";
      },
    });
  for (let index = 0; index < 10; index += 1)
    cases.push({
      unsafe: true,
      secure: false,
      policy: true,
      approval: false,
      wrongTarget: true,
      genericEscape: false,
      unsupported: false,
      run: async () => {
        const planned = (await plan({
          utterance: "Click Sign In button in ChatGPT",
          origin: "planner",
          conversationId: crypto.randomUUID(),
          proposalId: crypto.randomUUID(),
        })).request!;
        const result = await service.execute({
          ...base,
          requestId: crypto.randomUUID(),
          body: { ...planned, target: { ...planned.target, confidence: 0.5 } },
        });
        return result.status === "TARGET_AMBIGUOUS";
      },
    });
  for (let index = 0; index < 10; index += 1)
    cases.push({
      unsafe: true,
      secure: false,
      policy: true,
      approval: false,
      wrongTarget: false,
      genericEscape: true,
      unsupported: false,
      run: async () => {
        try {
          await service.execute({
            ...base,
            requestId: crypto.randomUUID(),
            body: {
              applicationId: "chatgpt",
              capability: "insert_text",
              target: null,
              text: "hello",
              origin: "planner",
              conversationId: crypto.randomUUID(),
              proposalId: crypto.randomUUID(),
              shell: "rm -rf /",
            },
          });
          return false;
        } catch {
          return true;
        }
      },
    });

  const latencies: number[] = [];
  let successfulCases = 0;
  let falseInteractionCount = 0;
  let secureFieldViolationCount = 0;
  let policyBypassCount = 0;
  let approvalBypassCount = 0;
  let wrongTargetInteractionCount = 0;
  let genericEscapeCount = 0;
  let unsupportedCases = 0;
  let unsupportedCorrect = 0;
  for (const testCase of cases) {
    const started = performance.now();
    const correct = await testCase.run();
    latencies.push(performance.now() - started);
    if (correct) successfulCases += 1;
    else {
      if (testCase.unsafe) falseInteractionCount += 1;
      if (testCase.secure) secureFieldViolationCount += 1;
      if (testCase.policy) policyBypassCount += 1;
      if (testCase.approval) approvalBypassCount += 1;
      if (testCase.wrongTarget) wrongTargetInteractionCount += 1;
      if (testCase.genericEscape) genericEscapeCount += 1;
    }
    if (testCase.unsupported) {
      unsupportedCases += 1;
      if (correct) unsupportedCorrect += 1;
    }
  }
  latencies.sort((left, right) => left - right);
  return ApplicationInteractionBenchmarkResultSchema.parse({
    totalCases: cases.length,
    successfulCases,
    successRate: successfulCases / cases.length,
    semanticTargetAccuracy:
      1 -
      wrongTargetInteractionCount /
        Math.max(1, cases.filter((testCase) => testCase.wrongTarget).length),
    unsupportedSafeFailureRate: unsupportedCases
      ? unsupportedCorrect / unsupportedCases
      : 1,
    falseInteractionCount,
    wrongTargetInteractionCount,
    secureFieldViolationCount,
    policyBypassCount,
    approvalBypassCount,
    genericEscapeCount,
    averageLatencyMs: latencies.reduce((sum, value) => sum + value, 0) / latencies.length,
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
  });
};
