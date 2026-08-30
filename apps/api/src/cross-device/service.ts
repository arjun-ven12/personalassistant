import {
  CrossDeviceArgumentsSchema,
  CrossDeviceClientInstanceSchema,
  CrossDeviceCommandReceiptRequestSchema,
  CrossDeviceCommandSchema,
  CrossDeviceHeartbeatRequestSchema,
  CrossDevicePollRequestSchema,
  RegisterCrossDeviceClientRequestSchema,
  CrossDeviceUtteranceRequestSchema,
  type CrossDeviceArguments,
  type CrossDeviceCapability,
  type CrossDeviceClientInstance,
  type CrossDeviceCommand,
  type CrossDeviceTargetType,
  type NetworkVerificationState,
} from "@alexa-control/shared";

import { ExecutionError } from "../execution/errors.js";
import type { ExecutionStore } from "../execution/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { IdentityStore } from "../identity/store.js";
import type { StoredDevice } from "../identity/types.js";
import type { NativeProviderRuntime } from "../native-providers/service.js";
import type { CrossDeviceStore } from "./store.js";

const WEB_CAPABILITIES: CrossDeviceCapability[] = [
  "NAVIGATE_TO_ROUTE",
  "OPEN_OBJECTIVE",
  "OPEN_AGENT",
  "OPEN_WORKFLOW",
  "OPEN_APPROVAL",
  "OPEN_CONVERSATION",
  "FOCUS_SEARCH",
  "REFRESH_VIEW",
];
const ANDROID_CAPABILITIES: CrossDeviceCapability[] = [
  "SHOW_SCREEN",
  "OPEN_OBJECTIVE",
  "OPEN_AGENT",
  "OPEN_WORKFLOW",
  "OPEN_APPROVAL",
  "OPEN_CONVERSATION",
];
const MAC_CAPABILITIES: CrossDeviceCapability[] = [
  "OPEN_APPLICATION",
  "FOCUS_APPLICATION",
  "OPEN_URL",
];
const terminalStatuses = new Set([
  "SUCCEEDED",
  "FAILED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
  "TARGET_OFFLINE",
]);
const routeAliases: Record<string, CrossDeviceArguments["route"]> = {
  home: "/",
  conversation: "/conversation",
  conversations: "/conversation",
  automation: "/automation",
  agents: "/agents",
  workforce: "/agents",
  economy: "/agents",
  experiments: "/agents",
  workflows: "/workflows",
  objectives: "/objectives",
  skills: "/skills",
  applications: "/applications",
  workspace: "/workspace",
  devices: "/devices",
  spatial: "/spatial",
  ai: "/ai",
  security: "/security",
  settings: "/security",
  approvals: "/approvals",
  engineering: "/engineering",
};
const applicationAliases: Record<string, CrossDeviceArguments["applicationId"]> = {
  chrome: "chrome",
  "google chrome": "chrome",
  safari: "safari",
  figma: "figma",
  chatgpt: "chatgpt",
  codex: "codex",
  "vs code": "vscode",
  vscode: "vscode",
  "visual studio code": "vscode",
  finder: "finder",
};

type ParsedAction = {
  targetType: CrossDeviceTargetType | null;
  targetName: string | null;
  capability: CrossDeviceCapability;
  arguments: CrossDeviceArguments;
  usesContinuity: boolean;
  currentDevice: boolean;
};

const normalize = (value: string) =>
  value.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9:/._ -]+/g, " ").replace(/\s+/g, " ").trim();

const targetTypeFrom = (text: string): CrossDeviceTargetType | null => {
  if (/\b(?:mac|macbook|macbook air|desktop)\b/.test(text)) return "MAC";
  if (/\b(?:phone|android|mobile)\b/.test(text)) return "ANDROID";
  if (/\b(?:web|browser|website|dashboard)\b/.test(text)) return "WEB";
  return null;
};

const explicitTargetName = (utterance: string) => {
  const quoted = utterance.match(/\bon\s+["“]([^"”]{1,120})["”]\s*$/i)?.[1];
  if (quoted) return quoted.trim();
  const named = utterance.match(/\bon\s+([A-Za-z0-9][A-Za-z0-9 .'-]{1,120})\s*$/i)?.[1]?.trim();
  if (!named) return null;
  const generic = normalize(named).replace(/^(?:my|the) /, "");
  if (["mac", "macbook", "macbook air", "desktop", "phone", "android", "mobile", "web", "browser", "website", "dashboard"].includes(generic))
    return null;
  return /\b(?:mac|macbook|phone|android|browser|web)\b/i.test(named) ? named : null;
};

export const parseCrossDeviceUtterance = (
  utterance: string,
  currentRoute: CrossDeviceArguments["route"] | null,
): ParsedAction | null => {
  const text = normalize(utterance);
  const targetType = targetTypeFrom(text);
  const usesContinuity = /\b(?:there|that device|same device)\b/.test(text);
  const currentDevice = /\b(?:here|this device|current device)\b/.test(text);
  if (!targetType && !usesContinuity && !currentDevice && !/\bon my\b/.test(text))
    return null;

  const objectMatch = text.match(
    /\b(?:open|show)\s+(objective|agent|workflow|approval|conversation)\s+([a-z0-9:_-]{1,160})\b/,
  );
  if (objectMatch) {
    const kind = objectMatch[1];
    const capability = `OPEN_${kind?.toUpperCase()}` as CrossDeviceCapability;
    return {
      targetType,
      targetName: explicitTargetName(utterance),
      capability,
      arguments: CrossDeviceArgumentsSchema.parse({ objectId: objectMatch[2] }),
      usesContinuity,
      currentDevice,
    };
  }

  const app = Object.keys(applicationAliases)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => new RegExp(`\\b${candidate.replaceAll(" ", "\\s+")}\\b`).test(text));
  if (app && /\b(?:open|launch|focus|switch to)\b/.test(text)) {
    return {
      targetType: targetType ?? "MAC",
      targetName: explicitTargetName(utterance),
      capability: /\b(?:focus|switch to)\b/.test(text) ? "FOCUS_APPLICATION" : "OPEN_APPLICATION",
      arguments: CrossDeviceArgumentsSchema.parse({ applicationId: applicationAliases[app] }),
      usesContinuity,
      currentDevice,
    };
  }

  const url = utterance.match(/https:\/\/[^\s]{1,2040}/i)?.[0];
  if (url && /\b(?:open|navigate)\b/.test(text)) {
    return {
      targetType: targetType ?? "MAC",
      targetName: explicitTargetName(utterance),
      capability: "OPEN_URL",
      arguments: CrossDeviceArgumentsSchema.parse({ url }),
      usesContinuity,
      currentDevice,
    };
  }

  const routeName = Object.keys(routeAliases).find((candidate) =>
    new RegExp(`\\b${candidate}\\b`).test(text),
  );
  if (routeName && /\b(?:open|show|go to|navigate to)\b/.test(text)) {
    return {
      targetType,
      targetName: explicitTargetName(utterance),
      capability: targetType === "ANDROID" ? "SHOW_SCREEN" : "NAVIGATE_TO_ROUTE",
      arguments: CrossDeviceArgumentsSchema.parse({ route: routeAliases[routeName] }),
      usesContinuity,
      currentDevice,
    };
  }

  if (/\b(?:show|open)\s+(?:this|current (?:screen|page))\b/.test(text) && currentRoute) {
    return {
      targetType,
      targetName: explicitTargetName(utterance),
      capability: targetType === "ANDROID" ? "SHOW_SCREEN" : "NAVIGATE_TO_ROUTE",
      arguments: CrossDeviceArgumentsSchema.parse({ route: currentRoute }),
      usesContinuity,
      currentDevice,
    };
  }
  return null;
};

type Candidate = {
  id: string;
  type: CrossDeviceTargetType;
  displayName: string;
  online: boolean;
  capabilities: CrossDeviceCapability[];
  client?: CrossDeviceClientInstance;
  device?: StoredDevice;
};

export class CrossDeviceService {
  readonly leaseMs = 45_000;
  readonly commandTtlMs = 120_000;

  constructor(
    readonly store: CrossDeviceStore,
    readonly identityStore: IdentityStore,
    readonly nativeProviders: NativeProviderRuntime,
    readonly executionStore: ExecutionStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async registerClient(input: {
    ownerId: string;
    sessionId: string;
    trustedDeviceId?: string | null;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const body = RegisterCrossDeviceClientRequestSchema.parse(input.body);
    const allowed = body.clientType === "WEB" ? WEB_CAPABILITIES : ANDROID_CAPABILITIES;
    if (body.capabilities.some((capability) => !allowed.includes(capability)))
      throw new ExecutionError(403, "CAPABILITY_UNAVAILABLE", "This client advertised an unsupported cross-device capability.");
    const existing = await this.store.getClient(body.clientInstanceId);
    if (existing && existing.ownerId !== input.ownerId)
      throw new ExecutionError(403, "OWNER_SCOPE_MISMATCH", "Client instance ownership does not match.");
    if (existing && existing.clientType !== body.clientType)
      throw new ExecutionError(409, "CLIENT_INSTANCE_TYPE_MISMATCH", "Client instance type cannot change.");
    const at = this.now();
    if (
      existing &&
      existing.sessionId !== input.sessionId &&
      new Date(existing.leaseExpiresAt) > at
    )
      throw new ExecutionError(
        409,
        "CLIENT_INSTANCE_ALREADY_ACTIVE",
        "Client instance is already bound to another active session.",
      );
    const client = CrossDeviceClientInstanceSchema.parse({
      id: body.clientInstanceId,
      ownerId: input.ownerId,
      sessionId: input.sessionId,
      trustedDeviceId: input.trustedDeviceId ?? null,
      clientType: body.clientType,
      displayName: body.displayName,
      platform: body.platform,
      capabilities: [...new Set(body.capabilities)],
      currentRoute: body.currentRoute,
      presence: "ONLINE",
      connectedAt: existing?.connectedAt ?? at.toISOString(),
      lastSeenAt: at.toISOString(),
      leaseExpiresAt: new Date(at.getTime() + this.leaseMs).toISOString(),
    });
    await this.store.saveClient(client);
    await this.audit({
      eventType: existing ? "CROSS_DEVICE_PRESENCE_UPDATED" : "CROSS_DEVICE_CLIENT_REGISTERED",
      ownerId: input.ownerId,
      ...(input.trustedDeviceId ? { deviceId: input.trustedDeviceId } : {}),
      ipAddress: input.ipAddress,
      outcome: "SUCCESS",
      reason: existing ? "Cross-device client lease refreshed." : "Cross-device client instance registered.",
      requestId: input.requestId,
      metadata: { clientInstanceId: client.id, clientType: client.clientType, capabilityCount: client.capabilities.length },
    });
    return client;
  }

  async heartbeat(input: {
    ownerId: string;
    sessionId: string;
    body: unknown;
    trustedDeviceId?: string | null;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = CrossDeviceHeartbeatRequestSchema.parse(input.body);
    const existing = await this.requireClient(input.ownerId, parsed.clientInstanceId);
    if (existing.sessionId !== input.sessionId || existing.trustedDeviceId !== (input.trustedDeviceId ?? null))
      throw new ExecutionError(403, "CLIENT_SESSION_MISMATCH", "Client instance is not bound to this session.");
    return this.registerClient({
      ...input,
      body: {
        clientInstanceId: existing.id,
        clientType: existing.clientType,
        displayName: existing.displayName,
        platform: existing.platform,
        capabilities: parsed.capabilities ?? existing.capabilities,
        currentRoute: parsed.currentRoute === undefined ? existing.currentRoute : parsed.currentRoute,
      },
    });
  }

  async routeUtterance(input: {
    ownerId: string;
    sessionId: string;
    sourceDeviceId?: string | null;
    body: unknown;
    requestId: string;
    ipAddress: string;
    networkState: NetworkVerificationState;
  }) {
    const body = CrossDeviceUtteranceRequestSchema.parse(input.body);
    const source = await this.requireClient(input.ownerId, body.clientInstanceId);
    if (source.sessionId !== input.sessionId || source.clientType !== body.clientType)
      throw new ExecutionError(403, "CLIENT_SESSION_MISMATCH", "Source client is not bound to this session.");
    if ((source.trustedDeviceId ?? null) !== (input.sourceDeviceId ?? null))
      throw new ExecutionError(403, "SOURCE_DEVICE_MISMATCH", "Source trusted device does not match the client instance.");
    const duplicate = await this.store.findIdempotentCommand(input.ownerId, source.id, body.idempotencyKey);
    if (duplicate)
      return { handled: true, command: await this.syncCommand(duplicate), responseText: duplicate.safeMessage, clarificationTargets: [] };
    let parsed = parseCrossDeviceUtterance(body.utterance, body.currentRoute);
    if (!parsed) return { handled: false, command: null, responseText: null, clarificationTargets: [] };
    if (
      parsed.currentDevice &&
      source.clientType === "ANDROID" &&
      parsed.capability === "NAVIGATE_TO_ROUTE"
    )
      parsed = { ...parsed, capability: "SHOW_SCREEN" };

    const at = this.now();
    let command = CrossDeviceCommandSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      sourceClientInstanceId: source.id,
      sourceDeviceId: input.sourceDeviceId ?? null,
      sourceClientType: source.clientType,
      targetType: parsed.targetType,
      targetId: null,
      targetDisplayName: null,
      capability: parsed.capability,
      arguments: parsed.arguments,
      status: "CREATED",
      failureCode: null,
      safeMessage: "Resolving the requested trusted client.",
      idempotencyKey: body.idempotencyKey,
      conversationId: body.conversationId,
      executionRequestId: null,
      approvalRequestId: null,
      acknowledgedAt: null,
      startedAt: null,
      completedAt: null,
      createdAt: at.toISOString(),
      updatedAt: at.toISOString(),
      expiresAt: new Date(at.getTime() + this.commandTtlMs).toISOString(),
    });
    const persisted = await this.store.createCommand(command);
    if (persisted.id !== command.id)
      return {
        handled: true,
        command: await this.syncCommand(persisted),
        responseText: persisted.safeMessage,
        clarificationTargets: [],
      };
    command = persisted;
    await this.auditCommand("CROSS_DEVICE_COMMAND_CREATED", command, input, "Cross-device command created from a bounded deterministic request.");
    command = await this.update(command, {
      status: "RESOLVING_TARGET",
      safeMessage: "Resolving the requested trusted client.",
    });

    const resolution = await this.resolveTarget(input.ownerId, source, parsed, body.conversationId);
    if (resolution.candidates.length !== 1) {
      const failureCode = resolution.candidates.length === 0
        ? resolution.hadOfflineCandidate ? "TARGET_OFFLINE" : "TARGET_NOT_FOUND"
        : "TARGET_AMBIGUOUS";
      const status = failureCode === "TARGET_OFFLINE" ? "TARGET_OFFLINE" : "REJECTED";
      const message = resolution.candidates.length > 1
        ? `I found more than one eligible target: ${resolution.candidates.map((item) => item.displayName).join(", ")}. Please name one.`
        : failureCode === "TARGET_OFFLINE"
          ? "The requested target is offline. No command was queued locally."
          : "No eligible trusted target supports that action.";
      command = await this.update(command, { status, failureCode, safeMessage: message, completedAt: at.toISOString() });
      await this.auditCommand("CROSS_DEVICE_COMMAND_REJECTED", command, input, message, "DENIED");
      return { handled: true, command, responseText: message, clarificationTargets: resolution.candidates.map((item) => item.displayName) };
    }
    const target = resolution.candidates[0]!;
    command = await this.update(command, {
      targetType: target.type,
      targetId: target.id,
      targetDisplayName: target.displayName,
      status: "AUTHORIZED",
      safeMessage: `Authorized for ${target.displayName}.`,
    });
    await this.auditCommand("CROSS_DEVICE_TARGET_RESOLVED", command, input, "Cross-device target resolved deterministically.");
    return this.dispatch(command, target, input);
  }

  async poll(input: { ownerId: string; sessionId: string; body: unknown; trustedDeviceId?: string | null; requestId: string; ipAddress: string }) {
    const body = CrossDevicePollRequestSchema.parse(input.body);
    const client = await this.heartbeat({
      ownerId: input.ownerId,
      sessionId: input.sessionId,
      trustedDeviceId: input.trustedDeviceId ?? null,
      body: { clientInstanceId: body.clientInstanceId, ...(body.currentRoute !== undefined ? { currentRoute: body.currentRoute } : {}) },
      requestId: input.requestId,
      ipAddress: input.ipAddress,
    });
    const commands = await this.store.listTargetCommands(input.ownerId, client.id, body.limit);
    const active: CrossDeviceCommand[] = [];
    for (const command of commands) {
      const synced = await this.syncCommand(command);
      if (["DISPATCHED", "ACKNOWLEDGED", "EXECUTING"].includes(synced.status)) active.push(synced);
    }
    return { client, commands: active, polledAt: this.now().toISOString() };
  }

  async receipt(input: { ownerId: string; sessionId: string; body: unknown; trustedDeviceId?: string | null; requestId: string; ipAddress: string }) {
    const body = CrossDeviceCommandReceiptRequestSchema.parse(input.body);
    const client = await this.requireClient(input.ownerId, body.clientInstanceId);
    if (client.sessionId !== input.sessionId || client.trustedDeviceId !== (input.trustedDeviceId ?? null))
      throw new ExecutionError(403, "CLIENT_SESSION_MISMATCH", "Target client is not bound to this session.");
    const command = await this.requireCommand(input.ownerId, body.commandId);
    if (command.targetId !== client.id)
      throw new ExecutionError(403, "OWNER_SCOPE_MISMATCH", "Command is not assigned to this client.");
    const allowed: Record<string, string[]> = {
      DISPATCHED: ["ACKNOWLEDGED", "REJECTED"],
      ACKNOWLEDGED: ["EXECUTING", "SUCCEEDED", "FAILED", "REJECTED"],
      EXECUTING: ["SUCCEEDED", "FAILED"],
    };
    if (!allowed[command.status]?.includes(body.status))
      throw new ExecutionError(409, "INVALID_COMMAND_TRANSITION", "Cross-device command transition is invalid.");
    if (body.status === "SUCCEEDED" && body.failureCode)
      throw new ExecutionError(400, "INVALID_RESULT", "Successful results cannot include a failure code.");
    const at = this.now().toISOString();
    const updated = await this.update(command, {
      status: body.status,
      failureCode: body.status === "SUCCEEDED" ? null : body.failureCode,
      safeMessage: body.safeMessage,
      acknowledgedAt: body.status === "ACKNOWLEDGED" ? at : command.acknowledgedAt,
      startedAt: body.status === "EXECUTING" ? at : command.startedAt,
      completedAt: ["SUCCEEDED", "FAILED", "REJECTED"].includes(body.status) ? at : null,
    });
    await this.auditCommand(
      body.status === "ACKNOWLEDGED" ? "CROSS_DEVICE_COMMAND_ACKNOWLEDGED" : terminalStatuses.has(body.status) ? "CROSS_DEVICE_COMMAND_COMPLETED" : "CROSS_DEVICE_COMMAND_DISPATCHED",
      updated,
      input,
      body.safeMessage,
      body.status === "SUCCEEDED" ? "SUCCESS" : body.status === "FAILED" || body.status === "REJECTED" ? "FAILURE" : "SUCCESS",
    );
    return updated;
  }

  async status(
    ownerId: string,
    commandId: string,
    request?: { requestId: string; ipAddress: string },
  ) {
    const before = await this.requireCommand(ownerId, commandId);
    const current = await this.syncCommand(before);
    if (request && current.status !== before.status) {
      const eventType = current.status === "ACKNOWLEDGED"
        ? "CROSS_DEVICE_COMMAND_ACKNOWLEDGED"
        : terminalStatuses.has(current.status)
          ? "CROSS_DEVICE_COMMAND_COMPLETED"
          : "CROSS_DEVICE_COMMAND_DISPATCHED";
      await this.auditCommand(eventType, current, request, current.safeMessage, current.status === "SUCCEEDED" ? "SUCCESS" : current.status === "FAILED" ? "FAILURE" : "SUCCESS");
    }
    return current;
  }

  async listClients(ownerId: string) {
    const now = this.now().getTime();
    const clients = await this.store.listClients(ownerId);
    return Promise.all(clients.map(async (client) => {
      const online = new Date(client.leaseExpiresAt).getTime() > now;
      if (online || client.presence === "OFFLINE") return client;
      const updated = CrossDeviceClientInstanceSchema.parse({ ...client, presence: "OFFLINE" });
      await this.store.saveClient(updated);
      return updated;
    }));
  }

  private async dispatch(command: CrossDeviceCommand, target: Candidate, request: { sessionId: string; requestId: string; ipAddress: string; networkState: NetworkVerificationState }) {
    if (target.type !== "MAC") {
      const updated = await this.update(command, { status: "DISPATCHED", safeMessage: `Sent to ${target.displayName}.` });
      await this.auditCommand("CROSS_DEVICE_COMMAND_DISPATCHED", updated, request, "Finite command made available to the authenticated target client.");
      return { handled: true, command: updated, responseText: updated.safeMessage, clarificationTargets: [] };
    }
    const applicationId = command.arguments.applicationId ?? (command.arguments.url ? "chrome" : null);
    if (!applicationId)
      throw new ExecutionError(400, "CAPABILITY_UNAVAILABLE", "Mac application target is required.");
    const capability = command.capability === "FOCUS_APPLICATION" ? "focus" : command.capability === "OPEN_URL" ? "open_url" : "launch";
    let dispatchError: unknown = null;
    try {
      await this.nativeProviders.dispatch({
        ownerId: command.ownerId,
        sessionId: request.sessionId,
        networkState: request.networkState,
        requestId: request.requestId,
        ipAddress: request.ipAddress,
        body: {
          providerId: `provider.${applicationId}`,
          applicationId,
          capability,
          interactionProposalId: command.id,
          arguments: command.arguments.url ? { url: command.arguments.url } : {},
        },
      });
    } catch (error) {
      dispatchError = error;
    }
    const execution = await this.executionStore.findByActionId(
      command.ownerId,
      command.id,
    );
    if (execution) {
      const updated = await this.update(command, {
        status: "DISPATCHED",
        executionRequestId: execution.id,
        safeMessage: `Sent to ${target.displayName}; waiting for the trusted Mac Agent.`,
      });
      await this.auditCommand("CROSS_DEVICE_COMMAND_DISPATCHED", updated, request, "Command queued through the existing signed Mac execution transport.");
      return { handled: true, command: updated, responseText: updated.safeMessage, clarificationTargets: [] };
    }
    const details = dispatchError instanceof ExecutionError ? dispatchError : null;
    const approvalRequestId = details?.details && typeof details.details === "object" && "approvalRequestId" in details.details
      ? String(details.details.approvalRequestId)
      : null;
    const approval = approvalRequestId !== null;
    const updated = await this.update(command, {
      status: approval ? "WAITING_APPROVAL" : "REJECTED",
      failureCode: approval ? "APPROVAL_REQUIRED" : details?.code === "PROVIDER_NOT_HEALTHY" ? "CAPABILITY_UNAVAILABLE" : "POLICY_DENIED",
      approvalRequestId,
      safeMessage: approval ? "Approval is required before this Mac command can be dispatched." : "The governed Mac provider rejected the command; no macOS action occurred.",
      completedAt: approval ? null : this.now().toISOString(),
    });
    await this.auditCommand("CROSS_DEVICE_COMMAND_REJECTED", updated, request, updated.safeMessage, "DENIED");
    return { handled: true, command: updated, responseText: updated.safeMessage, clarificationTargets: [] };
  }

  private async resolveTarget(ownerId: string, source: CrossDeviceClientInstance, parsed: ParsedAction, conversationId: string | null) {
    const now = this.now().getTime();
    const clients = await this.listClients(ownerId);
    const devices = (await this.identityStore.listDevices(ownerId)).filter(
      (device) => device.deviceType === "MAC_AGENT" && device.trustStatus === "TRUSTED",
    );
    let macReady = true;
    if (MAC_CAPABILITIES.includes(parsed.capability)) {
      const applicationId = parsed.arguments.applicationId ?? (parsed.arguments.url ? "chrome" : null);
      const nativeCapability = parsed.capability === "FOCUS_APPLICATION" ? "focus" : parsed.capability === "OPEN_URL" ? "open_url" : "launch";
      const dashboard = await this.nativeProviders.dashboard(ownerId);
      macReady = Boolean(
        applicationId &&
        dashboard.nativeProviders.some(
          (provider) => provider.id === `provider.${applicationId}` && provider.status === "healthy",
        ) &&
        dashboard.providerCapabilities.some(
          (capability) =>
            capability.providerId === `provider.${applicationId}` &&
            capability.capability === nativeCapability &&
            capability.enabled,
        ),
      );
    }
    const candidates: Candidate[] = [
      ...clients.map((client) => ({
        id: client.id,
        type: client.clientType,
        displayName: client.displayName,
        online: client.presence === "ONLINE" && new Date(client.leaseExpiresAt).getTime() > now,
        capabilities: client.capabilities,
        client,
      })),
      ...devices.map((device) => ({
        id: device.id,
        type: "MAC" as const,
        displayName: device.deviceName,
        online: Boolean(device.lastSeen && now - new Date(device.lastSeen).getTime() <= this.leaseMs),
        capabilities: macReady ? MAC_CAPABILITIES : [],
        device,
      })),
    ].filter((candidate) => candidate.capabilities.includes(parsed.capability));
    let eligible = candidates;
    if (parsed.currentDevice) {
      eligible = eligible.filter((candidate) => candidate.id === source.id);
    } else if (parsed.targetName) {
      const targetName = normalize(parsed.targetName);
      eligible = eligible.filter((candidate) => normalize(candidate.displayName) === targetName || normalize(candidate.displayName).includes(targetName));
    } else if (parsed.targetType) {
      eligible = eligible.filter((candidate) => candidate.type === parsed.targetType);
    } else if (parsed.usesContinuity && conversationId) {
      const previous = await this.store.findConversationTarget(ownerId, conversationId);
      eligible = previous?.targetId ? eligible.filter((candidate) => candidate.id === previous.targetId) : [];
    }
    const online = eligible
      .filter((candidate) => candidate.online)
      .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id));
    return { candidates: online, hadOfflineCandidate: online.length === 0 && eligible.length > 0 };
  }

  private async syncCommand(command: CrossDeviceCommand) {
    if (terminalStatuses.has(command.status)) return command;
    const now = this.now();
    if (new Date(command.expiresAt) <= now) {
      return this.update(command, { status: "EXPIRED", failureCode: "DELIVERY_EXPIRED", safeMessage: "The cross-device command expired before completion.", completedAt: now.toISOString() });
    }
    if (command.targetId) {
      if (command.targetType === "MAC") {
        const device = await this.identityStore.findDeviceById(command.targetId);
        if (!device || device.ownerId !== command.ownerId || device.trustStatus !== "TRUSTED")
          return this.update(command, {
            status: "REJECTED",
            failureCode: "TARGET_REVOKED",
            safeMessage: "The target Mac was revoked; execution is no longer accepted.",
            completedAt: now.toISOString(),
          });
      } else if (["DISPATCHED", "ACKNOWLEDGED"].includes(command.status)) {
        const client = await this.store.getClient(command.targetId);
        const trustedDevice = client?.trustedDeviceId
          ? await this.identityStore.findDeviceById(client.trustedDeviceId)
          : null;
        if (
          !client ||
          client.ownerId !== command.ownerId ||
          new Date(client.leaseExpiresAt) <= now ||
          (client.trustedDeviceId && (!trustedDevice || trustedDevice.trustStatus !== "TRUSTED"))
        )
          return this.update(command, {
            status: client?.trustedDeviceId && trustedDevice?.trustStatus !== "TRUSTED" ? "REJECTED" : "TARGET_OFFLINE",
            failureCode: client?.trustedDeviceId && trustedDevice?.trustStatus !== "TRUSTED" ? "TARGET_REVOKED" : "TARGET_OFFLINE",
            safeMessage: client?.trustedDeviceId && trustedDevice?.trustStatus !== "TRUSTED"
              ? "The target trusted device was revoked."
              : "The target client went offline before completing the command.",
            completedAt: now.toISOString(),
          });
      }
    }
    if (!command.executionRequestId) return command;
    const execution = await this.executionStore.find(command.executionRequestId);
    if (!execution) return this.update(command, { status: "FAILED", failureCode: "EXECUTION_FAILED", safeMessage: "The linked Mac execution is unavailable.", completedAt: now.toISOString() });
    const status = execution.status === "CLAIMED" ? "ACKNOWLEDGED" : execution.status === "RUNNING" ? "EXECUTING" : execution.status === "SUCCEEDED" ? "SUCCEEDED" : ["FAILED", "TIMED_OUT"].includes(execution.status) ? "FAILED" : execution.status === "CANCELLED" ? "CANCELLED" : execution.status === "EXPIRED" ? "EXPIRED" : command.status;
    if (status === command.status) return command;
    return this.update(command, {
      status,
      failureCode: status === "FAILED" ? "EXECUTION_FAILED" : null,
      safeMessage: status === "SUCCEEDED" ? `Completed on ${command.targetDisplayName ?? "Mac"}.` : status === "FAILED" ? "The trusted Mac execution failed verification." : `Mac command ${status.toLowerCase()}.`,
      acknowledgedAt: status === "ACKNOWLEDGED" ? now.toISOString() : command.acknowledgedAt,
      startedAt: status === "EXECUTING" ? now.toISOString() : command.startedAt,
      completedAt: terminalStatuses.has(status) ? now.toISOString() : null,
    });
  }

  private async requireClient(ownerId: string, id: string) {
    const client = await this.store.getClient(id);
    if (!client || client.ownerId !== ownerId)
      throw new ExecutionError(404, "CLIENT_INSTANCE_NOT_FOUND", "Cross-device client instance was not found.");
    return client;
  }

  private async requireCommand(ownerId: string, id: string) {
    const command = await this.store.getCommand(id);
    if (!command || command.ownerId !== ownerId)
      throw new ExecutionError(404, "CROSS_DEVICE_COMMAND_NOT_FOUND", "Cross-device command was not found.");
    return command;
  }

  private async update(command: CrossDeviceCommand, patch: Partial<CrossDeviceCommand>) {
    const updated = CrossDeviceCommandSchema.parse({ ...command, ...patch, updatedAt: this.now().toISOString() });
    await this.store.saveCommand(updated);
    return updated;
  }

  private async auditCommand(eventType: Parameters<GovernanceAuditWriter>[0]["eventType"], command: CrossDeviceCommand, request: { requestId: string; ipAddress: string }, reason: string, outcome: "SUCCESS" | "FAILURE" | "DENIED" = "SUCCESS") {
    await this.audit({
      eventType,
      ownerId: command.ownerId,
      ...(command.sourceDeviceId ? { deviceId: command.sourceDeviceId } : {}),
      ipAddress: request.ipAddress,
      outcome,
      reason,
      requestId: request.requestId,
      metadata: {
        crossDeviceCommandId: command.id,
        sourceClientType: command.sourceClientType,
        targetType: command.targetType,
        targetId: command.targetId,
        capability: command.capability,
        status: command.status,
        failureCode: command.failureCode,
      },
    });
  }
}
