import {
  ApprovedTerminalCommandRecordSchema,
  NativeCapabilityDispatchRequestSchema,
  NativeProviderHostStatusSchema,
  NativeProviderDashboardResponseSchema,
  NativeProviderRecordSchema,
  ProviderCapabilityRecordSchema,
  ProviderDiagnosticRecordSchema,
  ProviderExecutionRecordSchema,
  ProviderHealthRecordSchema,
  ProviderValidationRecordSchema,
  NativeProviderExecutionTransportResultSchema,
  AllowedApplicationSchema,
  type AdapterPermission,
  type NativeProviderCapability,
  type NativeProviderHostStatus,
  type NativeProviderRecord,
  type NetworkVerificationState,
  type AllowedApplication,
  type ProviderDiagnosticRecord,
} from "@alexa-control/shared";
import { z } from "zod";

import type { ApplicationAdapterStore } from "../application-adapters/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { NativeProviderStore } from "./store.js";

interface ProviderDescriptor {
  id: string;
  applicationId: string;
  name: string;
  providerType: NativeProviderRecord["providerType"];
  bundleIdentifier: string;
  capabilities: NativeProviderCapability[];
}

const descriptors: ProviderDescriptor[] = [
  {
    id: "provider.vscode",
    applicationId: "vscode",
    name: "VSCodeProvider",
    providerType: "vscode",
    bundleIdentifier: "com.microsoft.VSCode",
    capabilities: [
      "launch",
      "focus",
      "open_repository",
      "open_workspace",
      "focus_explorer",
      "focus_search",
      "focus_terminal",
      "open_file",
      "save_file",
      "switch_tab",
      "show_problems",
      "show_extensions",
      "close_tab",
      "focus_semantic_control",
      "insert_text",
      "replace_selection",
    ],
  },
  {
    id: "provider.finder",
    applicationId: "finder",
    name: "FinderProvider",
    providerType: "finder",
    bundleIdentifier: "com.apple.finder",
    capabilities: [
      "launch",
      "focus",
      "open_folder",
      "reveal_file",
      "focus_downloads",
      "focus_desktop",
      "search",
      "new_folder",
      "focus_sidebar",
      "open_selected_resource",
    ],
  },
  {
    id: "provider.terminal",
    applicationId: "terminal",
    name: "TerminalProvider",
    providerType: "terminal",
    bundleIdentifier: "com.apple.Terminal",
    capabilities: [
      "launch",
      "focus",
      "open_profile",
      "run_approved_command",
      "interrupt_command",
      "clear_terminal",
      "focus_session",
    ],
  },
  {
    id: "provider.chrome",
    applicationId: "chrome",
    name: "ChromeProvider",
    providerType: "chrome",
    bundleIdentifier: "com.google.Chrome",
    capabilities: [
      "launch",
      "open_url",
      "focus",
      "new_tab",
      "reload",
      "switch_tab",
      "find",
      "bookmark",
      "close_tab",
      "focus_semantic_control",
      "insert_text",
      "activate_semantic_control",
      "submit_composer",
    ],
  },
  {
    id: "provider.safari",
    applicationId: "safari",
    name: "SafariProvider",
    providerType: "safari",
    bundleIdentifier: "com.apple.Safari",
    capabilities: [
      "launch",
      "open_url",
      "focus",
      "new_tab",
      "reload",
      "find",
      "close_tab",
      "focus_semantic_control",
      "insert_text",
      "activate_semantic_control",
      "submit_composer",
    ],
  },
  {
    id: "provider.chatgpt",
    applicationId: "chatgpt",
    name: "ChatGPTProvider",
    providerType: "chatgpt",
    bundleIdentifier: "com.openai.chat",
    capabilities: [
      "launch",
      "focus",
      "focus_semantic_control",
      "insert_text",
      "activate_semantic_control",
      "submit_composer",
    ],
  },
  {
    id: "provider.codex",
    applicationId: "codex",
    name: "CodexProvider",
    providerType: "codex",
    bundleIdentifier: "com.openai.codex",
    capabilities: [
      "launch",
      "focus",
      "focus_semantic_control",
      "insert_text",
      "submit_composer",
    ],
  },
  {
    id: "provider.figma",
    applicationId: "figma",
    name: "FigmaProvider",
    providerType: "figma",
    bundleIdentifier: "com.figma.Desktop",
    capabilities: ["launch", "focus"],
  },
];

const NativeProviderIntentDispatchSchema = z
  .object({
    intent: z
      .string()
      .trim()
      .regex(/^provider\.[a-z][a-z0-9._-]{2,63}\.[a-z_]+$/),
    arguments: z.record(z.string().min(1).max(80), z.json()).default({}),
  })
  .strict();

export const permissionsForNativeCapability = (
  capability: NativeProviderCapability,
): AdapterPermission[] => {
  if (capability === "run_approved_command") return ["execute_commands"];
  if (["insert_text", "replace_selection"].includes(capability))
    return ["interact", "edit_text"];
  if (["activate_semantic_control", "submit_composer"].includes(capability))
    return ["interact"];
  if (capability === "focus_semantic_control") return ["interact", "navigate"];
  if (capability === "open_selected_resource") return ["open_files"];
  if (
    ["open_file", "open_folder", "open_repository", "open_workspace"].includes(
      capability,
    )
  ) {
    return ["open_files"];
  }
  if (["save_file", "new_folder"].includes(capability))
    return ["interact", "create_documents"];
  if (["launch", "focus"].includes(capability)) return ["navigate"];
  return ["read_semantic_structure", "navigate"];
};

export class NativeProviderRuntime {
  constructor(
    readonly store: NativeProviderStore,
    readonly applicationAdapterStore: ApplicationAdapterStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
    readonly enqueueNativeExecution:
      | ((input: {
          ownerId: string;
          sessionId: string;
          request: ReturnType<typeof NativeCapabilityDispatchRequestSchema.parse>;
          networkState: NetworkVerificationState;
          ipAddress: string;
          requestId: string;
          policyApplication: AllowedApplication;
      }) => Promise<{ executionRequestId: string }>)
      | undefined = undefined,
    readonly recordReviewedCapability:
      | ((input: {
          ownerId: string;
          applicationId: string;
          providerId: string;
          capabilityId: NativeProviderCapability;
          target: {
            role: string | null;
            label: string | null;
            identifier: string | null;
          };
          requestId: string;
        }) => Promise<void>)
      | undefined = undefined,
  ) {}

  async dashboard(ownerId: string) {
    await this.ensureBaseline(ownerId);
    return NativeProviderDashboardResponseSchema.parse({
      nativeProviders: await this.store.listProviders(ownerId, 500),
      providerCapabilities: await this.store.listCapabilities(ownerId, 2_000),
      providerHealth: await this.store.listHealth(ownerId, 500),
      providerValidation: await this.store.listValidation(ownerId, 500),
      providerExecution: await this.store.listExecution(ownerId, 1_000),
      providerMetrics: await this.store.listMetrics(ownerId, 1_000),
      providerDiagnostics: await this.store.listDiagnostics(ownerId, 1_000),
      approvedTerminalCommands: await this.store.listApprovedCommands(ownerId, 500),
      reviewedNativeProviderRuntimeAvailable: true,
      nativeCapabilityDispatcherAvailable: true,
      providerSandboxEnforced: true,
      arbitraryAppleScriptAvailable: false,
      arbitraryShellAvailable: false,
      coordinateClickingAvailable: false,
      keyboardReplayAvailable: false,
      ocrAvailable: false,
      screenshotAutomationAvailable: false,
      unrestrictedAccessibilityAvailable: false,
    });
  }

  async validateProviders(input: {
    ownerId: string;
    requestId: string;
    ipAddress: string;
  }) {
    await this.ensureBaseline(input.ownerId);
    const at = this.now().toISOString();
    const trusted = await this.applicationAdapterStore.listTrustedApplications(
      input.ownerId,
      500,
    );
    const healthRecords = await this.store.listHealth(input.ownerId, 500);
    for (const provider of await this.store.listProviders(input.ownerId, 500)) {
      const application = trusted.find(
        (item) =>
          item.id === provider.applicationId &&
          item.bundleIdentifier === provider.bundleIdentifier &&
          item.status === "trusted",
      );
      const latestHealth = healthRecords.find(
        (item) => item.providerId === provider.id && item.status === "healthy",
      );
      const hostHealthy = Boolean(latestHealth && latestHealth.availability > 0);
      const passed = Boolean(application && hostHealthy);
      await this.store.saveValidation(
        ProviderValidationRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          providerId: provider.id,
          installed: passed,
          bundleIdentifierMatches: passed,
          codeSignatureValid: passed && application?.codeSignature !== "not_verified",
          macosPermissionsGranted: hostHealthy,
          accessibilityAvailable: hostHealthy,
          providerVersionCompatible: passed,
          declaredCapabilitiesHealthy: hostHealthy,
          applicationVersionSupported: passed,
          status: passed ? "passed" : "failed",
          diagnostics: [
            application
              ? "Trusted application matches provider."
              : "Application is not trusted or bundle identifier does not match.",
            hostHealthy
              ? "Mac Agent provider host reported healthy capability coverage."
              : "Native macOS provider host has not reported healthy capability coverage.",
          ],
          validatedAt: at,
        }),
      );
      await this.store.saveHealth(
        ProviderHealthRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          providerId: provider.id,
          status: passed ? "healthy" : "disabled",
          availability: passed ? 1 : 0,
          latencyMs: latestHealth?.latencyMs ?? 0,
          executionSuccessRate: passed ? 1 : 0,
          verificationFailureRate: 0,
          permissionState: passed ? "granted" : "unknown",
          applicationVersion: application?.applicationVersion ?? "unknown",
          healthScore: passed ? 1 : 0,
          checkedAt: at,
        }),
      );
      await this.store.saveProvider(
        NativeProviderRecordSchema.parse({
          ...provider,
          status: passed ? "healthy" : "disabled",
          updatedAt: at,
        }),
      );
      await this.audit({
        eventType: "NATIVE_PROVIDER_VALIDATED",
        ownerId: input.ownerId,
        outcome: passed ? "SUCCESS" : "DENIED",
        reason: passed
          ? "Native provider validation passed with trusted application and healthy Mac Agent host."
          : "Native provider validation failed closed until reviewed host health is available.",
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        metadata: { providerId: provider.id },
      });
    }
    return this.dashboard(input.ownerId);
  }

  async reportHostStatus(input: {
    ownerId: string;
    deviceId: string;
    status: NativeProviderHostStatus;
  }) {
    await this.ensureBaseline(input.ownerId);
    const parsed = NativeProviderHostStatusSchema.parse(input.status);
    const at = this.now().toISOString();
    for (const implementation of parsed.providerImplementations) {
      const provider = await this.store.getProvider(
        input.ownerId,
        implementation.providerId,
      );
      if (!provider || provider.applicationId !== implementation.applicationId)
        continue;
      const healthy = parsed.available;
      await this.store.saveProvider(
        NativeProviderRecordSchema.parse({
          ...provider,
          status: healthy ? "healthy" : "unavailable",
          updatedAt: at,
        }),
      );
      await this.store.saveHealth(
        ProviderHealthRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          providerId: provider.id,
          status: healthy ? "healthy" : "unavailable",
          availability: healthy ? 1 : 0,
          latencyMs: 0,
          executionSuccessRate: healthy ? 1 : 0,
          verificationFailureRate: 0,
          permissionState: parsed.accessibilityTrusted ? "granted" : "partial",
          applicationVersion: "unknown",
          healthScore: healthy ? 1 : 0,
          checkedAt: at,
        }),
      );
      await this.store.saveValidation(
        ProviderValidationRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          providerId: provider.id,
          installed: healthy,
          bundleIdentifierMatches: true,
          codeSignatureValid: true,
          macosPermissionsGranted: parsed.accessibilityTrusted,
          accessibilityAvailable: parsed.accessibilityTrusted,
          providerVersionCompatible: true,
          declaredCapabilitiesHealthy: healthy,
          applicationVersionSupported: true,
          status: healthy ? "passed" : "failed",
          diagnostics: [
            `Mac Agent ${input.deviceId} reported provider host ${healthy ? "available" : "unavailable"}.`,
            `Implemented capabilities: ${implementation.implementedCapabilities.join(", ") || "none"}.`,
            `Unsupported capabilities fail closed: ${implementation.unsupportedCapabilities.join(", ") || "none"}.`,
          ],
          validatedAt: at,
        }),
      );
    }
  }

  async dispatch(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
    sessionId?: string;
    networkState?: NetworkVerificationState;
    semanticInteractionAuthorized?: boolean;
  }) {
    await this.ensureBaseline(input.ownerId);
    const parsed = this.parseDispatchBody(input.body);
    if (
      [
        "reload",
        "focus_semantic_control",
        "insert_text",
        "replace_selection",
        "activate_semantic_control",
        "submit_composer",
      ].includes(parsed.capability) &&
      input.semanticInteractionAuthorized !== true
    )
      return this.denyDispatch(
        input,
        parsed,
        "GOVERNED_APPLICATION_INTERACTION_REQUIRED",
        "Semantic application mutations must use the governed application interaction coordinator.",
      );
    await this.recordStage({
      ownerId: input.ownerId,
      providerId: parsed.providerId,
      capability: parsed.capability,
      executionRequestId: null,
      stage: "dashboard_dispatch",
      severity: "info",
      message: `Dashboard dispatch received for ${parsed.providerId}.${parsed.capability}.`,
      auditEventType: null,
      verificationResult: "pending",
    });
    const provider = await this.store.getProvider(input.ownerId, parsed.providerId);
    if (!provider || provider.applicationId !== parsed.applicationId) {
      return this.denyDispatch(
        input,
        parsed,
        "PROVIDER_NOT_FOUND",
        "Provider is not registered for the requested trusted application.",
      );
    }
    const capabilities = await this.store.listCapabilities(input.ownerId, 2_000);
    const capability = capabilities.find(
      (item) =>
        item.providerId === provider.id &&
        item.capability === parsed.capability &&
        item.enabled,
    );
    if (!capability) {
      return this.denyDispatch(
        input,
        parsed,
        "CAPABILITY_NOT_DECLARED",
        "Provider does not declare this finite capability.",
      );
    }
    const trusted = await this.applicationAdapterStore.getTrustedApplication(
      input.ownerId,
      parsed.applicationId,
    );
    if (!trusted || trusted.status !== "trusted") {
      return this.denyDispatch(
        input,
        parsed,
        "APPLICATION_NOT_TRUSTED",
        "Application is not explicitly trusted.",
      );
    }
    const missingPermissions = capability.permissions.filter(
      (permission) => !trusted.permissionsGranted.includes(permission),
    );
    if (missingPermissions.length > 0) {
      return this.denyDispatch(
        input,
        parsed,
        "PROVIDER_PERMISSION_MISSING",
        `Missing permissions: ${missingPermissions.join(", ")}`,
      );
    }
    if (parsed.capability === "run_approved_command") {
      const commandId = parsed.approvedCommandId;
      const command = commandId
        ? await this.store.getApprovedCommand(input.ownerId, commandId)
        : null;
      if (!command || !command.enabled) {
        return this.denyDispatch(
          input,
          parsed,
          "APPROVED_COMMAND_REQUIRED",
          "Terminal execution requires an enabled approved command registry entry.",
        );
      }
    }
    if (provider.status !== "healthy") {
      return this.denyDispatch(
        input,
        parsed,
        "PROVIDER_NOT_HEALTHY",
        "Provider validation has not passed; execution is disabled.",
      );
    }
    if (!this.enqueueNativeExecution) {
      return this.denyDispatch(
        input,
        parsed,
        "MAC_AGENT_PROVIDER_HOST_TRANSPORT_UNAVAILABLE",
        "Reviewed Mac Agent provider host execution is not connected to the API dispatcher; no placeholder execution was performed.",
      );
    }
    const queued = await this.enqueueNativeExecution({
      ownerId: input.ownerId,
      sessionId: input.sessionId ?? crypto.randomUUID(),
      request: parsed,
      networkState: input.networkState ?? "PRIVATE_NETWORK",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      policyApplication: AllowedApplicationSchema.parse({
        id: trusted.id,
        ownerId: trusted.ownerId,
        displayName: trusted.applicationName,
        macBundleId: trusted.bundleIdentifier,
        enabled: trusted.status === "trusted",
        permissions: {
          open: ["launch", "open_file", "open_workspace", "open_selected_resource"].includes(parsed.capability),
          focus: ["focus", "focus_semantic_control"].includes(parsed.capability),
          inspectWindow: false,
          captureWindow: false,
          automate: false,
          sendKeyboardShortcuts: false,
          readSemanticStructure: trusted.permissionsGranted.includes(
            "read_semantic_structure",
          ),
          navigate: trusted.permissionsGranted.includes("navigate"),
          interact: trusted.permissionsGranted.includes("interact"),
          editText: trusted.permissionsGranted.includes("edit_text"),
          openFiles: trusted.permissionsGranted.includes("open_files"),
          createDocuments: false,
          deleteContent: false,
          executeCommands: false,
          clipboardAccess: false,
        },
        riskOverrides: {},
        createdAt: trusted.createdAt,
        updatedAt: trusted.updatedAt,
      }),
    });
    const targetValue = parsed.arguments.target;
    const target =
      targetValue && typeof targetValue === "object" && !Array.isArray(targetValue)
        ? (targetValue as Record<string, unknown>)
        : {};
    try {
      await this.recordReviewedCapability?.({
        ownerId: input.ownerId,
        applicationId: parsed.applicationId,
        providerId: provider.id,
        capabilityId: parsed.capability,
        target: {
          role: typeof target.role === "string" ? target.role.slice(0, 80) : null,
          label: typeof target.label === "string" ? target.label.slice(0, 240) : null,
          identifier:
            typeof target.identifier === "string" ? target.identifier.slice(0, 240) : null,
        },
        requestId: input.requestId,
      });
    } catch {
      await this.recordStage({
        ownerId: input.ownerId,
        providerId: provider.id,
        capability: parsed.capability,
        executionRequestId: queued.executionRequestId,
        stage: "backend_dispatch",
        severity: "warning",
        message: "Semantic demonstration capture failed; queued execution was not duplicated.",
        auditEventType: null,
        verificationResult: "pending",
      });
    }
    await this.recordStage({
      ownerId: input.ownerId,
      providerId: provider.id,
      capability: parsed.capability,
      executionRequestId: queued.executionRequestId,
      stage: "backend_dispatch",
      severity: "info",
      message: `Backend dispatch validated ${provider.id}.${parsed.capability}.`,
      auditEventType: "NATIVE_CAPABILITY_DISPATCH_REQUESTED",
      verificationResult: "pending",
    });
    await this.recordStage({
      ownerId: input.ownerId,
      providerId: provider.id,
      capability: parsed.capability,
      executionRequestId: queued.executionRequestId,
      stage: "execution_queued",
      severity: "info",
      message: `Execution ${queued.executionRequestId} queued for trusted Mac Agent transport.`,
      auditEventType: "EXECUTION_REQUEST_CREATED",
      verificationResult: "pending",
    });
    await this.audit({
      eventType: "NATIVE_CAPABILITY_DISPATCH_REQUESTED",
      ownerId: input.ownerId,
      outcome: "SUCCESS",
      reason: "Finite native capability dispatch queued through trusted transport.",
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      metadata: {
        providerId: provider.id,
        capability: parsed.capability,
        executionRequestId: queued.executionRequestId,
      },
    });
    await this.store.saveExecution(
      ProviderExecutionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        executionRequestId: queued.executionRequestId,
        providerId: provider.id,
        capability: parsed.capability,
        applicationId: parsed.applicationId,
        approvedCommandId: parsed.approvedCommandId ?? null,
        status: "requested",
        inputSummary: "Validated semantic provider capability request.",
        resultSummary: "Queued for trusted Mac Agent provider-host execution.",
        verificationSummary: "Awaiting signed Mac Agent execution result.",
        errorCode: null,
        requestedAt: this.now().toISOString(),
        completedAt: null,
      }),
    );
    return this.dashboard(input.ownerId);
  }

  private async denyDispatch(
    input: { ownerId: string; requestId: string; ipAddress: string },
    parsed: ReturnType<typeof NativeCapabilityDispatchRequestSchema.parse>,
    errorCode: string,
    reason: string,
  ) {
    const at = this.now().toISOString();
    await this.store.saveExecution(
      ProviderExecutionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        executionRequestId: null,
        providerId: parsed.providerId,
        capability: parsed.capability,
        applicationId: parsed.applicationId,
        approvedCommandId: parsed.approvedCommandId ?? null,
        status: "denied",
        inputSummary: "Rejected semantic provider capability request.",
        resultSummary: reason,
        verificationSummary: "No macOS action was performed.",
        errorCode,
        requestedAt: at,
        completedAt: at,
      }),
    );
    await this.recordStage({
      ownerId: input.ownerId,
      providerId: parsed.providerId,
      capability: parsed.capability,
      executionRequestId: null,
      stage: "failed",
      severity: "error",
      message: `${errorCode}: ${reason}`,
      auditEventType: "NATIVE_CAPABILITY_DISPATCH_DENIED",
      verificationResult: "failed",
    });
    await this.audit({
      eventType: "NATIVE_CAPABILITY_DISPATCH_DENIED",
      ownerId: input.ownerId,
      outcome: "DENIED",
      reason,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      metadata: { providerId: parsed.providerId, capability: parsed.capability },
    });
    return this.dashboard(input.ownerId);
  }

  private parseDispatchBody(body: unknown) {
    const direct = NativeCapabilityDispatchRequestSchema.safeParse(body);
    if (direct.success) return direct.data;
    const intent = NativeProviderIntentDispatchSchema.parse(body);
    const [, applicationId, capability] = intent.intent.split(".");
    const descriptor = descriptors.find(
      (item) =>
        item.applicationId === applicationId &&
        item.capabilities.includes(capability as NativeProviderCapability),
    );
    return NativeCapabilityDispatchRequestSchema.parse({
      providerId: descriptor?.id ?? `provider.${applicationId}`,
      applicationId,
      capability,
      arguments: intent.arguments,
    });
  }

  async recordTransportStage(input: {
    ownerId: string;
    request: ReturnType<typeof NativeCapabilityDispatchRequestSchema.parse>;
    executionRequestId: string;
    stage: NonNullable<ProviderDiagnosticRecord["stage"]>;
    message: string;
    auditEventType?: string | null;
    verificationResult?: "pending" | "succeeded" | "failed";
    severity?: ProviderDiagnosticRecord["severity"];
  }) {
    await this.recordStage({
      ownerId: input.ownerId,
      providerId: input.request.providerId,
      capability: input.request.capability,
      executionRequestId: input.executionRequestId,
      stage: input.stage,
      severity: input.severity ?? "info",
      message: input.message,
      auditEventType: input.auditEventType ?? null,
      verificationResult: input.verificationResult ?? "pending",
    });
  }

  async recordTransportResult(input: {
    ownerId: string;
    executionRequestId: string;
    request: ReturnType<typeof NativeCapabilityDispatchRequestSchema.parse>;
    result: unknown;
    status: "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "CANCELLED";
    failureCode?: string;
  }) {
    const parsed =
      input.status === "SUCCEEDED" && input.result
        ? NativeProviderExecutionTransportResultSchema.parse(input.result)
        : null;
    const at = this.now().toISOString();
    await this.store.saveExecution(
      ProviderExecutionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        executionRequestId: input.executionRequestId,
        providerId: input.request.providerId,
        capability: input.request.capability,
        applicationId: input.request.applicationId,
        approvedCommandId: input.request.approvedCommandId ?? null,
        status: parsed?.verified ? "verified" : "failed",
        inputSummary: "Trusted native execution transport completed.",
        resultSummary:
          parsed?.resultSummary ??
          `Native provider execution ended with ${input.status}.`,
        verificationSummary:
          parsed?.verificationSummary ??
          "Provider verification did not return a successful signed result.",
        errorCode: parsed?.errorCode ?? input.failureCode ?? null,
        requestedAt: at,
        completedAt: at,
      }),
    );
    await this.recordStage({
      ownerId: input.ownerId,
      providerId: input.request.providerId,
      capability: input.request.capability,
      executionRequestId: input.executionRequestId,
      stage: parsed?.verified ? "dashboard_updated" : "failed",
      severity: parsed?.verified ? "info" : "error",
      message: parsed?.verified
        ? `Execution ${input.executionRequestId} verified: ${parsed.verificationSummary}`
        : `Execution ${input.executionRequestId} failed: ${input.failureCode ?? parsed?.errorCode ?? "NATIVE_EXECUTION_FAILED"}.`,
      auditEventType: parsed?.verified ? "EXECUTION_SUCCEEDED" : "EXECUTION_FAILED",
      verificationResult: parsed?.verified ? "succeeded" : "failed",
    });
  }

  private async recordStage(input: {
    ownerId: string;
    providerId: string;
    capability: ReturnType<
      typeof NativeCapabilityDispatchRequestSchema.parse
    >["capability"];
    executionRequestId: string | null;
    stage: NonNullable<ProviderDiagnosticRecord["stage"]>;
    severity: ProviderDiagnosticRecord["severity"];
    message: string;
    auditEventType: string | null;
    verificationResult: "pending" | "succeeded" | "failed";
  }) {
    await this.store.saveDiagnostic(
      ProviderDiagnosticRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        providerId: input.providerId,
        executionRequestId: input.executionRequestId,
        capability: input.capability,
        stage: input.stage,
        verificationResult: input.verificationResult,
        auditEventType: input.auditEventType,
        severity: input.severity,
        message: input.message,
        createdAt: this.now().toISOString(),
      }),
    );
  }

  private async ensureBaseline(ownerId: string) {
    const at = this.now().toISOString();
    const providers = await this.store.listProviders(ownerId, 500);
    const capabilities = await this.store.listCapabilities(ownerId, 2_000);
    const initializingOwner = providers.length === 0;
    const providersById = new Map(providers.map((provider) => [provider.id, provider]));
    const declaredCapabilities = new Set(
      capabilities.map((capability) => `${capability.providerId}:${capability.capability}`),
    );

    for (const descriptor of descriptors) {
      if (!providersById.has(descriptor.id)) {
        await this.store.saveProvider(
          NativeProviderRecordSchema.parse({
            id: descriptor.id,
            ownerId,
            applicationId: descriptor.applicationId,
            name: descriptor.name,
            providerType: descriptor.providerType,
            bundleIdentifier: descriptor.bundleIdentifier,
            version: "17G.1",
            supportedMacosVersions: ["13", "14", "15", "16"],
            status: "registered",
            sandboxed: true,
            arbitraryExecutionAvailable: false,
            arbitraryAppleScriptAvailable: false,
            arbitraryShellAvailable: false,
            coordinateClickingAvailable: false,
            keyboardReplayAvailable: false,
            ocrAvailable: false,
            screenshotAutomationAvailable: false,
            unrestrictedAccessibilityAvailable: false,
            createdAt: at,
            updatedAt: at,
          }),
        );
      }
      for (const capability of descriptor.capabilities) {
        if (declaredCapabilities.has(`${descriptor.id}:${capability}`)) continue;
        await this.store.saveCapability(
          ProviderCapabilityRecordSchema.parse({
            id: crypto.randomUUID(),
            ownerId,
            providerId: descriptor.id,
            capability,
            inputs: capability === "run_approved_command" ? ["approvedCommandId"] : [],
            outputs: ["structuredOutcome", "verification"],
            permissions: permissionsForNativeCapability(capability),
            dependencies: [
              "trustedApplication",
              "providerValidation",
              "providerHealth",
            ],
            verification: `Verify ${capability} completed through provider-specific semantic state.`,
            examples: [`${descriptor.name}.${capability}()`],
            riskLevel: capability === "run_approved_command" ? "high" : "low",
            enabled: true,
            updatedAt: at,
          }),
        );
      }
    }
    if (!initializingOwner) return;
    for (const [name, commandTemplate] of [
      ["Start Development Server", "pnpm dev"],
      ["Run Tests", "pnpm test"],
      ["Build Project", "pnpm build"],
      ["Lint Project", "pnpm lint"],
    ] as const) {
      await this.store.saveApprovedCommand(
        ApprovedTerminalCommandRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId,
          name,
          commandTemplate,
          placeholders: [],
          allowedWorkspaceIds: [],
          riskLevel: "high",
          approvalRequired: true,
          enabled: false,
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
  }
}

export class NativeCapabilityDispatcher extends NativeProviderRuntime {}
export class ProviderRegistryService extends NativeProviderRuntime {}
export class ProviderValidationService extends NativeProviderRuntime {}
export class CapabilityHealthService extends NativeProviderRuntime {}
export class CapabilityVerificationService extends NativeProviderRuntime {}
export class ProviderSandboxService extends NativeProviderRuntime {}
export class ApplicationTrustService extends NativeProviderRuntime {}
export class ProviderDiagnosticsService extends NativeProviderRuntime {}
