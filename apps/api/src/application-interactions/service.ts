import { createHash } from "node:crypto";
import {
  GovernedApplicationInteractionRequestSchema,
  GovernedApplicationInteractionResponseSchema,
  NativeSemanticInteractionTargetSchema,
  type GovernedApplicationInteractionRequest,
  type GovernedApplicationInteractionResponse,
  type GovernedInteractionStatus,
  type NativeProviderCapability,
  type SemanticDesktopObjectRecord,
  type NetworkVerificationState,
} from "@alexa-control/shared";

import { ExecutionError } from "../execution/errors.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { ApplicationAdapterStore } from "../application-adapters/store.js";
import type { NativeProviderRuntime } from "../native-providers/service.js";
import type { NativeProviderStore } from "../native-providers/store.js";
import type { TargetResolutionService } from "../desktop/interaction-services.js";
import type { CapabilityStudioStore } from "../capability-studio/store.js";

const GOVERNED_INTERACTION_TARGET_TTL_MS = 5 * 60_000;

const targetId = (role: string, label: string | null, identifier: string | null) =>
  createHash("sha256")
    .update([role, label ?? "", identifier ?? ""].join("\n"))
    .digest("hex");

const reviewedBuiltinBrowserSearchTargets: Record<
  string,
  { role: string; label: string; type: "TEXT_FIELD" }
> = {
  chrome: {
    role: "AXTextField",
    label: "Address and search bar",
    type: "TEXT_FIELD",
  },
  safari: {
    role: "AXTextField",
    label: "Smart Search Field",
    type: "TEXT_FIELD",
  },
};

const reviewedBuiltinBrowserReloadTargets: Record<
  string,
  { role: string; label: string; type: "BUTTON" }
> = {
  chrome: { role: "AXButton", label: "Reload", type: "BUTTON" },
  safari: { role: "AXButton", label: "Reload current page", type: "BUTTON" },
};

const reviewedBuiltinComposerTargets: Record<
  string,
  { role: string; label: null; type: "COMPOSER" }
> = {
  // These Electron clients do not consistently publish a stable AX identifier
  // for the composer. The native provider still requires exactly one visible
  // AXTextArea in the trusted registered application before it can proceed.
  chatgpt: { role: "AXTextArea", label: null, type: "COMPOSER" },
  codex: { role: "AXTextArea", label: null, type: "COMPOSER" },
};

const reviewedBuiltinComposerSubmitTargets: Record<
  string,
  { role: string; label: "Send"; type: "BUTTON" }
> = {
  chatgpt: { role: "AXButton", label: "Send", type: "BUTTON" },
  codex: { role: "AXButton", label: "Send", type: "BUTTON" },
};

const reviewedBuiltinProviderTarget = (
  request: GovernedApplicationInteractionRequest,
) => {
  if (!request.target) return false;
  if (!["insert_text", "replace_selection", "focus_semantic_control", "reload", "submit_composer"].includes(request.capability))
    return false;
  const builtin = request.target.type === "COMPOSER"
    ? reviewedBuiltinComposerTargets[request.applicationId]
    : request.capability === "submit_composer"
      ? reviewedBuiltinComposerSubmitTargets[request.applicationId]
    : request.capability === "reload"
      ? reviewedBuiltinBrowserReloadTargets[request.applicationId]
      : reviewedBuiltinBrowserSearchTargets[request.applicationId];
  return (
    !!builtin &&
    request.target.type === builtin.type &&
    request.target.role === builtin.role &&
    request.target.label === builtin.label &&
    request.target.identifier === null &&
    request.target.registryObjectId === null &&
    request.target.registryVersion === null &&
    request.target.semanticId === targetId(builtin.role, builtin.label, null)
  );
};

const capabilityPermissions = (
  capability: GovernedApplicationInteractionRequest["capability"],
) => {
  if (["insert_text", "replace_selection"].includes(capability))
    return ["interact", "edit_text"] as const;
  if (
    [
      "activate_semantic_control",
      "submit_composer",
      "focus_semantic_control",
    ].includes(capability)
  )
    return ["interact"] as const;
  if (["open_file", "open_workspace", "open_selected_resource"].includes(capability))
    return ["open_files"] as const;
  return ["navigate"] as const;
};

const secureTarget = (request: GovernedApplicationInteractionRequest) =>
  request.target?.role === "AXSecureTextField" ||
  /\b(?:password|passcode|otp|one[- ]time|security code|cvv|card code)\b/i.test(
    request.target?.label ?? "",
  );

const reviewedBenignControl = (request: GovernedApplicationInteractionRequest) =>
  request.capability !== "activate_semantic_control" ||
  /^(?:sign in|search|submit|next|previous|continue|cancel|close|open|select|expand|collapse|show|hide)$/i.test(
    request.target?.label?.trim() ?? "",
  );

const stripAppTarget = (value: string) =>
  {
    let current = value.trim();
    for (let index = 0; index < 3; index += 1) {
      const next = current
        .replace(
          /\s+(?:into|in|on)\s+(?:the\s+)?(?:(?:google\s+)?chrome|safari|chatgpt|codex|(?:vs\s*code|visual studio code)|finder|browser|search(?:\s+(?:bar|box|field))?|composer|editor|text\s+field)\s*$/i,
          "",
        )
        .trim();
      if (next === current) return current;
      current = next;
    }
    return current;
  };

const unquotedTextToType = (utterance: string) => {
  const match = utterance.match(/\b(?:type|insert)\s+(?:in\s+)?(.+?)[.!?]?$/i);
  if (!match?.[1]) return null;
  const candidate = stripAppTarget(match[1]).replace(/^["']|["']$/g, "").trim();
  if (
    !candidate ||
    /^(?:it|this|that|there|here|into|in|on|the search(?: bar| box| field)?|the composer|the editor)$/i.test(
      candidate,
    )
  )
    return null;
  return candidate.slice(0, 4_000);
};

const statusForErrorCode = (code: string | null): GovernedInteractionStatus => {
  if (!code) return "FAILED";
  if (code.includes("APPROVAL")) return "APPROVAL_REQUIRED";
  if (code.includes("PERMISSION")) return "PERMISSION_DENIED";
  if (code.includes("HEALTH")) return "PROVIDER_UNHEALTHY";
  if (code === "CAPABILITY_NOT_DECLARED" || code.includes("NOT_IMPLEMENTED"))
    return "UNSUPPORTED";
  if (code === "APPLICATION_NOT_TRUSTED") return "PERMISSION_DENIED";
  return "POLICY_DENIED";
};

export interface PlannedApplicationInteraction {
  request: GovernedApplicationInteractionRequest | null;
  clarification: string | null;
}

type ProposalClaimResult = boolean | "ALREADY_CLAIMED";

export class ApplicationInteractionService {
  constructor(
    readonly applicationStore: ApplicationAdapterStore,
    readonly nativeProviderStore: NativeProviderStore,
    readonly nativeProviders: NativeProviderRuntime,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
    readonly claimConfirmedProposal?: (
      ownerId: string,
      request: GovernedApplicationInteractionRequest,
    ) => Promise<ProposalClaimResult>,
    readonly releaseProposalClaimForApproval?: (
      ownerId: string,
      request: GovernedApplicationInteractionRequest,
    ) => Promise<void>,
    readonly targetResolution?: Pick<TargetResolutionService, "resolve">,
    readonly getSemanticObject?: (
      ownerId: string,
      objectId: string,
    ) =>
      | SemanticDesktopObjectRecord
      | null
      | Promise<SemanticDesktopObjectRecord | null>,
    readonly capabilityStudioStore?: CapabilityStudioStore,
  ) {}

  async planFromUtterance(input: {
    ownerId: string;
    utterance: string;
    origin: GovernedApplicationInteractionRequest["origin"];
    conversationId?: string | null;
    proposalId?: string | null;
    resolvedText?: string | null;
    currentApplicationId?: string | null;
    previousInteractionProposal?: unknown;
  }): Promise<PlannedApplicationInteraction> {
    const utterance = input.utterance.trim();
    const previousProposal = input.previousInteractionProposal as
      | { status?: unknown; parameters?: { request?: unknown } }
      | null
      | undefined;
    const previous = GovernedApplicationInteractionRequestSchema.safeParse(
      previousProposal?.parameters?.request,
    );
    const priorComposerInsertion =
      previousProposal?.status === "EXECUTED" &&
      previous.success &&
      ["insert_text", "replace_selection"].includes(previous.data.capability) &&
      previous.data.target?.type === "COMPOSER"
        ? previous.data
        : null;
    const submissionRequested = /^\s*(?:send|submit)(?: it| this| message)?[.!?]?\s*$/i.test(
      utterance,
    );
    const applicationId =
      submissionRequested && priorComposerInsertion
        ? priorComposerInsertion.applicationId
        : this.applicationId(utterance, input.currentApplicationId);
    if (!applicationId)
      return { request: null, clarification: "Which supported application should I use?" };
    const base = {
      applicationId,
      origin: input.origin,
      conversationId: input.conversationId ?? null,
      proposalId: input.proposalId ?? null,
    };
    const url = utterance.match(/https?:\/\/[^\s]+/i)?.[0] ?? null;
    if (url)
      return {
        request: GovernedApplicationInteractionRequestSchema.parse({
          ...base,
          capability: "open_url",
          target: null,
          text: url,
        }),
        clarification: null,
      };
    if (/\b(?:refresh|reload)(?:\s+(?:this|the|current))?\s+page\b/i.test(utterance)) {
      const target = await this.resolveTarget(
        input.ownerId,
        applicationId,
        "BUTTON",
        "Reload",
        "activate",
      );
      if (!target)
        return {
          request: null,
          clarification: "The reviewed provider could not resolve one stable Reload control.",
        };
      return {
        request: GovernedApplicationInteractionRequestSchema.parse({
          ...base,
          capability: "reload",
          target,
          text: null,
        }),
        clarification: null,
      };
    }
    if (submissionRequested) {
      if (!priorComposerInsertion)
        return {
          request: null,
          clarification: "There is no exact prepared composer message to send.",
        };
      const target = await this.resolveTarget(
        input.ownerId,
        applicationId,
        "BUTTON",
        "Send",
        "submit",
      );
      if (!target)
        return {
          request: null,
          clarification:
            "The reviewed provider could not resolve one stable Send control.",
        };
      return {
        request: GovernedApplicationInteractionRequestSchema.parse({
          ...base,
          capability: "submit_composer",
          target,
          text: null,
        }),
        clarification: null,
      };
    }
    const click = utterance.match(/\b(?:click|press|activate)\s+(?:the\s+)?(.+?)(?:\s+button)?[.!]?$/i);
    if (click?.[1]) {
      const label = click[1]
        .replace(
          /\s+(?:in|on)\s+(?:chatgpt|codex|safari|(?:google\s+)?chrome|(?:vs\s*code|visual studio code)|finder)\s*$/i,
          "",
        )
        .replace(/\s+button$/i, "")
        .trim();
      const target = await this.resolveTarget(
        input.ownerId,
        applicationId,
        "BUTTON",
        label,
        "activate",
      );
      if (!target)
        return {
          request: null,
          clarification: `I could not resolve one stable ${label} control.`,
        };
      return {
        request: GovernedApplicationInteractionRequestSchema.parse({
          ...base,
          capability: "activate_semantic_control",
          target,
          text: null,
        }),
        clarification: null,
      };
    }
    if (/\b(?:type|insert|replace)\b/i.test(utterance)) {
      const quoted = utterance.match(/["']([^"']+)["']/)?.[1] ?? null;
      const text = quoted ?? input.resolvedText ?? unquotedTextToType(utterance);
      if (!text) return { request: null, clarification: "What should I type?" };
      const isComposer = ["chatgpt", "codex"].includes(applicationId);
      const isBrowserSearch =
        ["chrome", "safari"].includes(applicationId) &&
        !/\b(?:editor|text\s+field|field)\b/i.test(utterance);
      const target = await this.resolveTarget(
        input.ownerId,
        applicationId,
        isComposer
          ? "COMPOSER"
          : /search/i.test(utterance) || isBrowserSearch
            ? "TEXT_FIELD"
            : "TEXT_FIELD",
        isComposer
          ? "composer"
          : /search/i.test(utterance) || isBrowserSearch
            ? "Search"
            : "Editor",
        /replace/i.test(utterance) ? "replace" : "set_value",
      );
      if (!target)
        return {
          request: null,
          clarification:
            "The reviewed provider could not resolve one stable text target.",
        };
      return {
        request: GovernedApplicationInteractionRequestSchema.parse({
          ...base,
          capability: /replace/i.test(utterance) ? "replace_selection" : "insert_text",
          target,
          text,
        }),
        clarification: null,
      };
    }
    if (/\b(?:open|launch|focus|switch to)\b/i.test(utterance))
      return {
        request: GovernedApplicationInteractionRequestSchema.parse({
          ...base,
          capability: /\b(?:focus|switch to)\b/i.test(utterance) ? "focus" : "launch",
          target: null,
          text: null,
        }),
        clarification: null,
      };
    return { request: null, clarification: "That application interaction is not a reviewed capability yet." };
  }

  async execute(input: {
    ownerId: string;
    sessionId: string;
    networkState: NetworkVerificationState;
    requestId: string;
    ipAddress: string;
    body: unknown;
  }): Promise<GovernedApplicationInteractionResponse> {
    const request = GovernedApplicationInteractionRequestSchema.parse(input.body);
    const denied = async (
      status: GovernedInteractionStatus,
      message: string,
      providerId: string | null = null,
      approvalRequestId: string | null = null,
    ) => {
      await this.audit({
        eventType: "POLICY_DENIED",
        ownerId: input.ownerId,
        outcome: "DENIED",
        reason: message,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        metadata: {
          applicationId: request.applicationId,
          capability: request.capability,
          targetSemanticId: request.target?.semanticId ?? null,
          textLength: request.text?.length ?? 0,
        },
      });
      return GovernedApplicationInteractionResponseSchema.parse({
        requestId: input.requestId,
        applicationId: request.applicationId,
        providerId,
        capability: request.capability,
        status,
        targetSemanticId: request.target?.semanticId ?? null,
        executionRequestId: null,
        approvalRequestId,
        message,
        createdAt: this.now().toISOString(),
      });
    };
    if (request.capabilityCandidateId) {
      const candidate = await this.capabilityStudioStore?.getCandidate(
        input.ownerId,
        request.capabilityCandidateId,
      );
      if (
        !candidate ||
        candidate.status !== "ACTIVE" ||
        candidate.applicationId !== request.applicationId ||
        candidate.primitive !== request.capability
      )
        return denied(
          "POLICY_DENIED",
          "The learned capability version is unavailable or has been revoked.",
        );
    }
    if (request.target && new Date(request.target.expiresAt) <= this.now())
      return denied("TARGET_STALE", "The frozen semantic target has expired.");
    if (secureTarget(request))
      return denied("SECURE_TARGET_BLOCKED", "Secure input targets are unavailable to generic application interaction.");
    const builtinProviderTarget = reviewedBuiltinProviderTarget(request);
    if (
      request.target &&
      !builtinProviderTarget &&
      (!request.target.registryObjectId ||
        !request.target.registryVersion ||
        !request.target.identifier ||
        !this.getSemanticObject)
    )
      return denied(
        "TARGET_AMBIGUOUS",
        "The semantic target lacks a stable reviewed registry binding.",
      );
    if (request.target && !builtinProviderTarget) {
      const current = await this.getSemanticObject!(
        input.ownerId,
        request.target.registryObjectId!,
      );
      if (
        !current ||
        current.version !== request.target.registryVersion ||
        current.visibility !== "visible" ||
        !current.state.enabled ||
        current.accessibilityIdentifier !== request.target.identifier ||
        (current.accessibilityLabel ?? current.displayName) !== request.target.label
      )
        return denied(
          "TARGET_STALE",
          "The reviewed semantic target changed after it was proposed.",
        );
      if (current.state.secureText || current.role === "password_field")
        return denied(
          "SECURE_TARGET_BLOCKED",
          "The semantic registry marks this as protected input.",
        );
    }
    if (!reviewedBenignControl(request))
      return denied(
        "POLICY_DENIED",
        "This control is not classified as a reviewed benign semantic activation.",
      );
    const minimumConfidence = ["activate_semantic_control", "submit_composer"].includes(
      request.capability,
    )
      ? 0.9
      : 0.8;
    if (request.target && request.target.confidence < minimumConfidence)
      return denied("TARGET_AMBIGUOUS", "The semantic target confidence is too low; clarification is required.");
    const requiresConfirmedProposal = [
      "reload",
      "insert_text",
      "replace_selection",
      "activate_semantic_control",
      "submit_composer",
    ].includes(request.capability);
    const proposalClaim = requiresConfirmedProposal
      ? request.proposalId && request.conversationId && this.claimConfirmedProposal
        ? await this.claimConfirmedProposal(input.ownerId, request)
        : false
      : true;
    if (
      requiresConfirmedProposal &&
      proposalClaim === "ALREADY_CLAIMED"
    )
      return GovernedApplicationInteractionResponseSchema.parse({
        requestId: input.requestId,
        applicationId: request.applicationId,
        providerId: null,
        capability: request.capability,
        status: "SUCCESS",
        targetSemanticId: request.target?.semanticId ?? null,
        executionRequestId: null,
        approvalRequestId: null,
        message: "That exact interaction was already queued; I did not run it again.",
        createdAt: this.now().toISOString(),
      });
    if (
      requiresConfirmedProposal &&
      proposalClaim !== true
    )
      return denied(
        "POLICY_DENIED",
        "This mutating interaction is not bound to the exact confirmed conversation proposal.",
      );
    if (request.capability === "open_url") {
      try {
        const parsed = new URL(request.text ?? "");
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("unsafe");
      } catch {
        return denied("POLICY_DENIED", "Only validated HTTP and HTTPS navigation is supported.");
      }
    }
    const provider = (
      await this.nativeProviderStore.listProviders(input.ownerId, 500)
    ).find((item) => item.applicationId === request.applicationId);
    if (!provider) return denied("UNSUPPORTED", "No reviewed interaction provider is registered.");
    if (provider.status !== "healthy")
      return denied("PROVIDER_UNHEALTHY", "The reviewed interaction provider is not healthy.", provider.id);
    const capability = (
      await this.nativeProviderStore.listCapabilities(input.ownerId, 2_000)
    ).find(
      (item) =>
        item.providerId === provider.id &&
        item.capability === request.capability &&
        item.enabled,
    );
    if (!capability)
      return denied("UNSUPPORTED", "The provider does not declare this finite capability.", provider.id);
    const trusted = await this.applicationStore.getTrustedApplication(
      input.ownerId,
      request.applicationId,
    );
    if (!trusted || trusted.status !== "trusted")
      return denied("PERMISSION_DENIED", "Application interaction is not trusted.", provider.id);
    const missing = capabilityPermissions(request.capability).filter(
      (permission) => !trusted.permissionsGranted.includes(permission),
    );
    if (missing.length)
      return denied(
        "PERMISSION_DENIED",
        `Interaction permission is missing: ${missing.join(", ")}.`,
        provider.id,
      );
    const argumentsValue: Record<string, unknown> = {};
    if (request.target) argumentsValue.target = request.target;
    if (request.text) {
      if (request.capability === "open_url") argumentsValue.url = request.text;
      else argumentsValue.text = request.text;
    }
    try {
      const existingExecutionIds = new Set(
        (await this.nativeProviderStore.listExecution(input.ownerId, 2_000)).map(
          (item) => item.id,
        ),
      );
      const dashboard = await this.nativeProviders.dispatch({
        ownerId: input.ownerId,
        sessionId: input.sessionId,
        networkState: input.networkState,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        semanticInteractionAuthorized: true,
        body: {
          providerId: provider.id,
          applicationId: request.applicationId,
          capability: request.capability as NativeProviderCapability,
          ...(request.proposalId
            ? { interactionProposalId: request.proposalId }
            : {}),
          arguments: argumentsValue,
        },
      });
      const execution = dashboard.providerExecution.find(
        (item) =>
          !existingExecutionIds.has(item.id) &&
          item.providerId === provider.id &&
          item.capability === request.capability,
      );
      return GovernedApplicationInteractionResponseSchema.parse({
        requestId: input.requestId,
        applicationId: request.applicationId,
        providerId: provider.id,
        capability: request.capability,
        status: execution?.status === "requested" ? "SUCCESS" : statusForErrorCode(execution?.errorCode ?? null),
        targetSemanticId: request.target?.semanticId ?? null,
        executionRequestId: execution?.executionRequestId ?? null,
        approvalRequestId: null,
        message: execution?.verificationSummary ?? "Interaction dispatch failed closed.",
        createdAt: this.now().toISOString(),
      });
    } catch (error) {
      if (error instanceof ExecutionError) {
        if (
          error.statusCode === 409 &&
          this.releaseProposalClaimForApproval
        )
          await this.releaseProposalClaimForApproval(input.ownerId, request);
        return denied(
          error.statusCode === 409 ? "APPROVAL_REQUIRED" : "POLICY_DENIED",
          error.message,
          provider.id,
          error.details?.approvalRequestId ?? null,
        );
      }
      throw error;
    }
  }

  private async resolveTarget(
    ownerId: string,
    applicationId: string,
    type: "TEXT_FIELD" | "BUTTON" | "COMPOSER",
    query: string,
    action: "activate" | "set_value" | "replace" | "submit",
  ) {
    if (this.targetResolution) {
      const resolution = await this.targetResolution.resolve({
        ownerId,
        request: {
          action,
          target: {
            objectId: null,
            query,
            applicationId,
            windowId: null,
            fieldKey: null,
            contextObjectId: null,
          },
        },
      });
      const object = resolution.target;
      if (
        object?.accessibilityIdentifier &&
        !object.state.secureText &&
        object.role !== "password_field"
      ) {
        const role = this.axRole(object.role, type);
        const label = object.accessibilityLabel ?? object.displayName;
        const capturedAt = new Date(object.updatedAt);
        return NativeSemanticInteractionTargetSchema.parse({
          type,
          role,
          label,
          identifier: object.accessibilityIdentifier,
          semanticId: targetId(role, label, object.accessibilityIdentifier),
          registryObjectId: object.id,
          registryVersion: object.version,
          secure: false,
          source: "PROVIDER",
          confidence: Math.min(object.confidence, resolution.record.confidence),
          capturedAt: capturedAt.toISOString(),
          expiresAt: new Date(
            this.now().getTime() + GOVERNED_INTERACTION_TARGET_TTL_MS,
          ).toISOString(),
        });
      }
    }
    return this.reviewedBuiltinTarget(applicationId, type, query);
  }

  private reviewedBuiltinTarget(
    applicationId: string,
    type: "TEXT_FIELD" | "BUTTON" | "COMPOSER",
    query: string,
  ) {
    const builtin = type === "COMPOSER" && /^composer$/i.test(query)
      ? reviewedBuiltinComposerTargets[applicationId]
      : type === "BUTTON" && /^send$/i.test(query)
        ? reviewedBuiltinComposerSubmitTargets[applicationId]
      : type === "BUTTON" && /^reload$/i.test(query)
        ? reviewedBuiltinBrowserReloadTargets[applicationId]
        : reviewedBuiltinBrowserSearchTargets[applicationId];
    if (
      !builtin ||
      (type === "TEXT_FIELD" && !/^search$/i.test(query)) ||
      (type === "BUTTON" && !/^(?:reload|send)$/i.test(query)) ||
      (type === "COMPOSER" && !/^composer$/i.test(query))
    ) return null;
    return NativeSemanticInteractionTargetSchema.parse({
      type: builtin.type,
      role: builtin.role,
      label: builtin.label,
      identifier: null,
      semanticId: targetId(builtin.role, builtin.label, null),
      registryObjectId: null,
      registryVersion: null,
      secure: false,
      source: "EXPLICIT",
      confidence: 0.94,
      capturedAt: this.now().toISOString(),
      expiresAt: new Date(
        this.now().getTime() + GOVERNED_INTERACTION_TARGET_TTL_MS,
      ).toISOString(),
    });
  }

  private axRole(role: SemanticDesktopObjectRecord["role"], type: string) {
    if (role === "button") return "AXButton";
    if (role === "search_field") return "AXTextField";
    if (role === "password_field") return "AXSecureTextField";
    if (["input_field", "editor"].includes(role))
      return type === "TEXT_FIELD" ? "AXTextArea" : "AXTextArea";
    return type === "BUTTON" ? "AXButton" : "AXTextArea";
  }

  private applicationId(utterance: string, current: string | null | undefined) {
    const aliases: Array<[RegExp, string]> = [
      [/\b(?:vs\s*code|visual studio code)\b/i, "vscode"],
      [/\bsafari\b/i, "safari"],
      [/\b(?:chrome|google chrome)\b/i, "chrome"],
      [/\bchat\s*gpt\b/i, "chatgpt"],
      [/\bcodex\b/i, "codex"],
      [/\bfinder\b/i, "finder"],
    ];
    return aliases.find(([pattern]) => pattern.test(utterance))?.[1] ?? current ?? null;
  }
}
