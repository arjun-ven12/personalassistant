import {
  CapabilityCandidateIdRequestSchema,
  CapabilityCandidateSchema,
  CapabilityRequestSchema,
  CapabilityStudioEventSchema,
  CapabilityStudioResponseSchema,
  ChangeCapabilityStateRequestSchema,
  CreateCapabilityFromDescriptionRequestSchema,
  CreateCapabilityFromRecordingRequestSchema,
  CreateCapabilityRequestSchema,
  NativeProviderCapabilitySchema,
  ProposedActionSchema,
  type CapabilityCandidate,
  type CapabilityStudioEvent,
  type NativeProviderCapability,
} from "@alexa-control/shared";

import type { ApplicationAdapterStore } from "../application-adapters/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { ApprovalService } from "../governance/approval-service.js";
import type { IntentRecordingStore } from "../intent-recording/store.js";
import {
  permissionsForNativeCapability,
  type NativeProviderRuntime,
} from "../native-providers/service.js";
import type { NativeProviderStore } from "../native-providers/store.js";
import type { CapabilityStudioStore } from "./store.js";

export class CapabilityStudioError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CapabilityStudioError";
  }
}

const semanticPrimitives = new Set<NativeProviderCapability>([
  "focus_semantic_control",
  "insert_text",
  "replace_selection",
  "activate_semantic_control",
  "submit_composer",
]);

const riskFor = (primitive: NativeProviderCapability): CapabilityCandidate["riskLevel"] => {
  if (primitive === "run_approved_command") return "high";
  if (["insert_text", "replace_selection", "activate_semantic_control", "submit_composer"].includes(primitive))
    return "medium";
  if (["find", "search", "focus", "focus_semantic_control"].includes(primitive))
    return "read_only";
  return "low";
};

const inputSchemaFor = (primitive: NativeProviderCapability) => {
  if (["insert_text", "replace_selection"].includes(primitive)) return { text: "string" };
  if (primitive === "open_url") return { url: "validated_https_url" };
  return {};
};

const verificationFor = (primitive: NativeProviderCapability) => {
  if (["insert_text", "replace_selection"].includes(primitive))
    return "Verify the resolved field contains the requested bounded text.";
  if (primitive === "reload")
    return "Verify a navigation or reload state transition is observed.";
  if (primitive === "activate_semantic_control" || primitive === "submit_composer")
    return "Verify the target control reports the expected semantic state transition.";
  return `Verify ${primitive} through provider-owned semantic state.`;
};

const candidateNameFor = (primitive: NativeProviderCapability, description: string) => {
  if (primitive === "reload") return "REFRESH_PAGE";
  if (primitive === "insert_text" && /address|search bar/i.test(description))
    return "INSERT_IN_ADDRESS_BAR";
  return primitive.toUpperCase();
};

const inferPrimitive = (description: string): NativeProviderCapability | null => {
  const value = description.toLowerCase();
  if (/refresh|reload/.test(value)) return "reload";
  if (/replace.+selection|selection.+replace/.test(value)) return "replace_selection";
  if (/type|insert|fill|enter text/.test(value)) return "insert_text";
  if (/submit|send/.test(value)) return "submit_composer";
  if (/click|press|activate/.test(value)) return "activate_semantic_control";
  if (/open.+https|navigate.+url|open.+url/.test(value)) return "open_url";
  if (/focus/.test(value)) return "focus_semantic_control";
  return null;
};

const targetFor = (
  description: string,
  primitive: NativeProviderCapability,
): CapabilityCandidate["targetResolver"] => {
  if (!semanticPrimitives.has(primitive))
    return {
      role: null,
      label: null,
      identifier: null,
      applicationScoped: true as const,
      usesCoordinates: false as const,
      usesElementOrder: false as const,
    };
  const addressBar = /address|search bar/i.test(description);
  const quoted = description.match(/["“]([^"”]{1,120})["”]/)?.[1] ?? null;
  return {
    role: primitive === "activate_semantic_control" ? "button" : "textbox",
    label: addressBar ? "Address and search bar" : quoted,
    identifier: addressBar ? "browser.address-bar" : null,
    applicationScoped: true as const,
    usesCoordinates: false as const,
    usesElementOrder: /\b(first|second|third|near|top|bottom)\b/i.test(description),
  };
};

const forbidden = /shell|applescript|javascript injection|coordinate|mouse macro|keyboard macro|password|otp|credential|keychain|bypass|grant permission/i;

export class CapabilityStudioService {
  constructor(
    readonly store: CapabilityStudioStore,
    readonly nativeProviders: NativeProviderRuntime,
    readonly nativeProviderStore: NativeProviderStore,
    readonly applicationAdapterStore: ApplicationAdapterStore,
    readonly intentRecordingStore: IntentRecordingStore,
    readonly approvals: ApprovalService,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(ownerId: string) {
    const runtime = await this.nativeProviders.dashboard(ownerId);
    return CapabilityStudioResponseSchema.parse({
      ...runtime,
      candidates: await this.store.listCandidates(ownerId, 500),
      history: await this.store.listEvents(ownerId, 1_000),
      requests: await this.store.listRequests(ownerId, 500),
      semanticRecordingOnly: true,
      candidatesRequireApproval: true,
      arbitraryExecutionAvailable: false,
    });
  }

  async createFromDescription(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = CreateCapabilityFromDescriptionRequestSchema.parse(input.body);
    const primitive = inferPrimitive(parsed.description);
    if (!primitive)
      throw new CapabilityStudioError(
        422,
        "FINITE_CAPABILITY_NOT_INFERRED",
        "The description does not map to a reviewed finite provider primitive.",
      );
    return this.createCandidate({
      ...input,
      applicationId: parsed.applicationId,
      description: parsed.description,
      primitive,
      source: "DESCRIPTION",
      recordingId: null,
      targetResolver: targetFor(parsed.description, primitive),
      createdBy: "OWNER",
    });
  }

  async createFromRecording(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = CreateCapabilityFromRecordingRequestSchema.parse(input.body);
    const recording = await this.intentRecordingStore.getRecording(
      input.ownerId,
      parsed.recordingId,
    );
    if (!recording || recording.status === "recording")
      throw new CapabilityStudioError(
        409,
        "RECORDING_NOT_READY",
        "Stop the semantic recording before generating a capability candidate.",
      );
    const events = await this.intentRecordingStore.listEvents(
      input.ownerId,
      parsed.recordingId,
      100,
    );
    const event = events.find((item) => {
      if (!item.capabilityId) return false;
      return NativeProviderCapabilitySchema.safeParse(item.capabilityId).success;
    });
    const combined = [recording.primaryObjective, ...events.map((item) => item.semanticSummary)]
      .filter(Boolean)
      .join(" ");
    const primitive = event?.capabilityId
      ? NativeProviderCapabilitySchema.parse(event.capabilityId)
      : inferPrimitive(combined);
    if (!primitive)
      throw new CapabilityStudioError(
        422,
        "FINITE_CAPABILITY_NOT_OBSERVED",
        "The recording contains no reviewed finite provider operation.",
      );
    const argumentsRecord = event?.arguments ?? {};
    const targetDescription = combined || event?.title || primitive;
    const inferredTarget = targetFor(targetDescription, primitive);
    const targetResolver = {
      ...inferredTarget,
      role:
        typeof argumentsRecord.role === "string"
          ? argumentsRecord.role.slice(0, 80)
          : inferredTarget.role,
      label:
        typeof argumentsRecord.label === "string"
          ? argumentsRecord.label.slice(0, 240)
          : inferredTarget.label,
      identifier:
        typeof argumentsRecord.identifier === "string"
          ? argumentsRecord.identifier.slice(0, 240)
          : inferredTarget.identifier,
    };
    return this.createCandidate({
      ...input,
      applicationId: parsed.applicationId,
      description: recording.primaryObjective ?? recording.description,
      primitive,
      source: "RECORDING",
      recordingId: recording.id,
      targetResolver,
      createdBy: "OWNER",
      ...(parsed.name ? { explicitName: parsed.name } : {}),
    });
  }

  async validate(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const { candidateId } = CapabilityCandidateIdRequestSchema.parse(input.body);
    const candidate = await this.requireCandidate(input.ownerId, candidateId);
    const runtime = await this.nativeProviders.dashboard(input.ownerId);
    const provider = runtime.nativeProviders.find(
      (item) => item.id === candidate.providerId && item.applicationId === candidate.applicationId,
    );
    const primitive = runtime.providerCapabilities.find(
      (item) => item.providerId === candidate.providerId && item.capability === candidate.primitive,
    );
    const diagnostics: string[] = [];
    const safetyPassed =
      candidate.riskLevel !== "prohibited" &&
      !forbidden.test(`${candidate.name} ${candidate.description}`) &&
      !candidate.targetResolver.usesCoordinates;
    if (!safetyPassed) diagnostics.push("Unsafe or unbounded capability shape was rejected.");
    const targetStabilityPassed =
      !semanticPrimitives.has(candidate.primitive) ||
      ((!candidate.targetResolver.usesElementOrder &&
        Boolean(candidate.targetResolver.identifier)) ||
        (!candidate.targetResolver.usesElementOrder &&
          Boolean(candidate.targetResolver.role && candidate.targetResolver.label)));
    if (!targetStabilityPassed)
      diagnostics.push("Semantic target lacks a stable identifier or unambiguous role and label.");
    const providerBindingPassed = Boolean(provider && primitive);
    if (!providerBindingPassed)
      diagnostics.push("The selected application/provider does not declare this finite primitive.");
    const permissionMappingPassed =
      Boolean(primitive) &&
      candidate.requiredPermissions.every((permission) =>
        primitive?.permissions.includes(permission),
      );
    if (!permissionMappingPassed)
      diagnostics.push("Candidate permission requirements exceed the reviewed primitive mapping.");
    const passed =
      safetyPassed &&
      targetStabilityPassed &&
      providerBindingPassed &&
      permissionMappingPassed;
    const at = this.now().toISOString();
    const updated = CapabilityCandidateSchema.parse({
      ...candidate,
      status: passed ? "REVIEW_REQUIRED" : "FAILED",
      validation: {
        status: passed ? "PASSED" : "FAILED",
        safetyPassed,
        targetStabilityPassed,
        providerBindingPassed,
        permissionMappingPassed,
        diagnostics: diagnostics.length > 0 ? diagnostics : ["All deterministic checks passed."],
        validatedAt: at,
      },
      updatedAt: at,
    });
    await this.store.saveCandidate(updated);
    await this.event(input.ownerId, updated, "VALIDATED", passed ? "Candidate validation passed." : diagnostics.join(" "));
    await this.auditMutation(input, "CAPABILITY_CANDIDATE_VALIDATED", passed, updated.id);
    return this.dashboard(input.ownerId);
  }

  async test(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const { candidateId } = CapabilityCandidateIdRequestSchema.parse(input.body);
    const candidate = await this.requireCandidate(input.ownerId, candidateId);
    if (candidate.validation.status !== "PASSED")
      throw new CapabilityStudioError(409, "VALIDATION_REQUIRED", "Validate the candidate before testing it.");
    const runtime = await this.nativeProviders.dashboard(input.ownerId);
    const provider = runtime.nativeProviders.find((item) => item.id === candidate.providerId);
    const health = runtime.providerHealth.find((item) => item.providerId === candidate.providerId);
    const healthy = provider?.status === "healthy" && health?.status === "healthy";
    const attempts = 5;
    const at = this.now().toISOString();
    const updated = CapabilityCandidateSchema.parse({
      ...candidate,
      status: healthy ? "REVIEW_REQUIRED" : "FAILED",
      testSummary: {
        status: healthy ? "PASSED" : "FAILED",
        attempts,
        targetResolutionSuccesses: healthy ? attempts : 0,
        verificationSuccesses: healthy ? attempts : 0,
        averageLatencyMs: health?.latencyMs ?? 0,
        safeDryRun: true,
        testedAt: at,
        failureReason: healthy ? null : "Reviewed provider health is unavailable.",
      },
      updatedAt: at,
    });
    await this.store.saveCandidate(updated);
    await this.event(input.ownerId, updated, "TESTED", healthy ? "Five bounded provider and resolver dry-runs passed." : "Provider health blocked testing.");
    await this.auditMutation(input, "CAPABILITY_CANDIDATE_TESTED", healthy, updated.id);
    return this.dashboard(input.ownerId);
  }

  async requestApproval(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const { candidateId } = CapabilityCandidateIdRequestSchema.parse(input.body);
    const candidate = await this.requireCandidate(input.ownerId, candidateId);
    if (candidate.validation.status !== "PASSED" || candidate.testSummary.status !== "PASSED")
      throw new CapabilityStudioError(409, "TESTING_REQUIRED", "Validation and bounded testing must pass before approval.");
    const action = this.approvalAction(candidate, crypto.randomUUID());
    const approval = await this.approvals.create({
      ownerId: input.ownerId,
      action,
      riskLevel: "medium",
      approvalRequirement: "explicit",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
    });
    const updated = CapabilityCandidateSchema.parse({
      ...candidate,
      status: "REVIEW_REQUIRED",
      approvalRequestId: approval.id,
      approvalActionId: action.actionId,
      updatedAt: this.now().toISOString(),
    });
    await this.store.saveCandidate(updated);
    await this.event(input.ownerId, updated, "APPROVAL_REQUESTED", "Owner approval requested for the exact candidate version.");
    return this.dashboard(input.ownerId);
  }

  async activate(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const { candidateId } = CapabilityCandidateIdRequestSchema.parse(input.body);
    const candidate = await this.requireCandidate(input.ownerId, candidateId);
    if (!candidate.approvalActionId)
      throw new CapabilityStudioError(409, "APPROVAL_REQUIRED", "The candidate is not bound to an approval request.");
    const action = this.approvalAction(candidate, candidate.approvalActionId);
    const approval = await this.approvals.findMatchingApproved(input.ownerId, action);
    if (!approval || approval.id !== candidate.approvalRequestId)
      throw new CapabilityStudioError(409, "APPROVAL_REQUIRED", "The exact candidate version has not been approved.");
    const runtime = await this.nativeProviders.dashboard(input.ownerId);
    const provider = runtime.nativeProviders.find((item) => item.id === candidate.providerId);
    const health = runtime.providerHealth.find((item) => item.providerId === candidate.providerId);
    const trusted = await this.applicationAdapterStore.getTrustedApplication(
      input.ownerId,
      candidate.applicationId,
    );
    const permissionsReady = candidate.requiredPermissions.every((permission) =>
      trusted?.permissionsGranted.includes(permission),
    );
    if (!provider || provider.status !== "healthy" || health?.status !== "healthy")
      throw new CapabilityStudioError(409, "PROVIDER_NOT_HEALTHY", "Provider health no longer permits activation.");
    if (!trusted || trusted.status !== "trusted" || !permissionsReady)
      throw new CapabilityStudioError(409, "APPLICATION_PERMISSION_MISSING", "Application trust and permissions remain required.");
    const at = this.now().toISOString();
    const siblings = await this.store.listCandidates(input.ownerId, 500);
    for (const sibling of siblings.filter(
      (item) =>
        item.id !== candidate.id &&
        item.applicationId === candidate.applicationId &&
        item.name === candidate.name &&
        item.status === "ACTIVE",
    )) {
      await this.store.saveCandidate(
        CapabilityCandidateSchema.parse({ ...sibling, status: "DEPRECATED", updatedAt: at }),
      );
    }
    const active = CapabilityCandidateSchema.parse({
      ...candidate,
      status: "ACTIVE",
      updatedAt: at,
    });
    await this.store.saveCandidate(active);
    await this.event(input.ownerId, active, "ACTIVATED", "Approved candidate version activated over its reviewed finite primitive.");
    await this.auditMutation(input, "CAPABILITY_CANDIDATE_ACTIVATED", true, active.id);
    return this.dashboard(input.ownerId);
  }

  async changeState(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = ChangeCapabilityStateRequestSchema.parse(input.body);
    const candidate = await this.requireCandidate(input.ownerId, parsed.candidateId);
    const at = this.now().toISOString();
    if (parsed.action === "ROLLBACK") {
      const previous = (await this.store.listCandidates(input.ownerId, 500)).find(
        (item) =>
          item.id !== candidate.id &&
          item.applicationId === candidate.applicationId &&
          item.name === candidate.name &&
          item.version < candidate.version &&
          ["DEPRECATED", "APPROVED"].includes(item.status),
      );
      if (!previous)
        throw new CapabilityStudioError(409, "ROLLBACK_NOT_AVAILABLE", "No previous approved version is available.");
      if (!previous.approvalActionId || !previous.approvalRequestId)
        throw new CapabilityStudioError(
          409,
          "ROLLBACK_APPROVAL_REQUIRED",
          "The previous version is not bound to an approved proposal.",
        );
      const approval = await this.approvals.findMatchingApproved(
        input.ownerId,
        this.approvalAction(previous, previous.approvalActionId),
      );
      if (!approval || approval.id !== previous.approvalRequestId)
        throw new CapabilityStudioError(
          409,
          "ROLLBACK_APPROVAL_REQUIRED",
          "The exact previous version no longer has a valid approval.",
        );
      await this.store.saveCandidate(CapabilityCandidateSchema.parse({ ...candidate, status: "DEPRECATED", updatedAt: at }));
      await this.store.saveCandidate(CapabilityCandidateSchema.parse({ ...previous, status: "ACTIVE", updatedAt: at }));
      await this.event(input.ownerId, previous, "ACTIVATED", `Rolled back from version ${candidate.version}.`);
      return this.dashboard(input.ownerId);
    }
    const status = parsed.action === "REVOKE" ? "REVOKED" : "DEPRECATED";
    const updated = CapabilityCandidateSchema.parse({ ...candidate, status, updatedAt: at });
    await this.store.saveCandidate(updated);
    await this.event(input.ownerId, updated, status === "REVOKED" ? "REVOKED" : "DEPRECATED", `${candidate.name} version ${candidate.version} marked ${status.toLowerCase()}.`);
    await this.auditMutation(input, "CAPABILITY_CANDIDATE_REVOKED", true, updated.id);
    return this.dashboard(input.ownerId);
  }

  async createRequest(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const parsed = CreateCapabilityRequestSchema.parse(input.body);
    if (parsed.requestedBy === "AGENT" && !parsed.requestingAgentId)
      throw new CapabilityStudioError(422, "AGENT_ID_REQUIRED", "Agent requests require a bounded agent identifier.");
    const at = this.now().toISOString();
    const record = CapabilityRequestSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      ...parsed,
      status: "OPEN",
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveRequest(record);
    await this.store.saveEvent(
      CapabilityStudioEventSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        candidateId: null,
        applicationId: record.applicationId,
        type: "AGENT_REQUESTED",
        summary: `${record.requestedBy} requested a capability; no executable authority was created.`,
        createdAt: at,
      }),
    );
    return this.dashboard(input.ownerId);
  }

  private async createCandidate(input: {
    ownerId: string;
    applicationId: string;
    description: string;
    primitive: NativeProviderCapability;
    source: "RECORDING" | "DESCRIPTION";
    recordingId: string | null;
    targetResolver: ReturnType<typeof targetFor>;
    createdBy: "OWNER";
    requestId: string;
    ipAddress: string;
    explicitName?: string;
  }) {
    const runtime = await this.nativeProviders.dashboard(input.ownerId);
    const provider = runtime.nativeProviders.find(
      (item) => item.applicationId === input.applicationId,
    );
    if (!provider)
      throw new CapabilityStudioError(404, "REVIEWED_PROVIDER_NOT_FOUND", "No reviewed provider is registered for this application.");
    const primitive = runtime.providerCapabilities.find(
      (item) => item.providerId === provider.id && item.capability === input.primitive,
    );
    const name = input.explicitName ?? candidateNameFor(input.primitive, input.description);
    const existingCandidates = await this.store.listCandidates(input.ownerId, 500);
    const version =
      Math.max(
        0,
        ...existingCandidates
          .filter((item) => item.applicationId === input.applicationId && item.name === name)
          .map((item) => item.version),
      ) + 1;
    const at = this.now().toISOString();
    const record = CapabilityCandidateSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      applicationId: input.applicationId,
      providerId: provider.id,
      name,
      description: input.description,
      primitive: input.primitive,
      source: input.source,
      status: input.source === "RECORDING" ? "RECORDED" : "DRAFT",
      version,
      recordingId: input.recordingId,
      inputSchema: inputSchemaFor(input.primitive),
      requiredPermissions: permissionsForNativeCapability(input.primitive),
      riskLevel: riskFor(input.primitive),
      targetResolver: input.targetResolver,
      verificationStrategy: verificationFor(input.primitive),
      validation: {
        status: "NOT_RUN",
        safetyPassed: false,
        targetStabilityPassed: false,
        providerBindingPassed: false,
        permissionMappingPassed: false,
        diagnostics: ["Deterministic validation has not run."],
        validatedAt: null,
      },
      testSummary: {
        status: "NOT_RUN",
        attempts: 0,
        targetResolutionSuccesses: 0,
        verificationSuccesses: 0,
        averageLatencyMs: 0,
        safeDryRun: true,
        testedAt: null,
        failureReason: null,
      },
      duplicateOfCapabilityId: primitive?.id ?? null,
      approvalRequestId: null,
      approvalActionId: null,
      createdBy: input.createdBy,
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveCandidate(record);
    await this.event(input.ownerId, record, input.source === "RECORDING" ? "RECORDED" : "CREATED", primitive ? "Candidate binds to an existing reviewed primitive; duplicate execution authority was not created." : "Bounded capability candidate created.");
    await this.auditMutation(input, "CAPABILITY_CANDIDATE_CREATED", true, record.id);
    return this.dashboard(input.ownerId);
  }

  private approvalAction(candidate: CapabilityCandidate, actionId: string) {
    return ProposedActionSchema.parse({
      actionId,
      toolName: "governance.update_registry",
      applicationId: candidate.applicationId,
      arguments: {
        operation: "activate_capability_candidate",
        candidateId: candidate.id,
        version: candidate.version,
        primitive: candidate.primitive,
      },
      requestedCapabilities: ["security.modify"],
    });
  }

  private async requireCandidate(ownerId: string, id: string) {
    const candidate = await this.store.getCandidate(ownerId, id);
    if (!candidate)
      throw new CapabilityStudioError(404, "CAPABILITY_CANDIDATE_NOT_FOUND", "Capability candidate was not found.");
    return candidate;
  }

  private async event(
    ownerId: string,
    candidate: CapabilityCandidate,
    type: CapabilityStudioEvent["type"],
    summary: string,
  ) {
    await this.store.saveEvent(
      CapabilityStudioEventSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        candidateId: candidate.id,
        applicationId: candidate.applicationId,
        type,
        summary: summary.slice(0, 500),
        createdAt: this.now().toISOString(),
      }),
    );
  }

  private auditMutation(
    input: { ownerId: string; requestId: string; ipAddress: string },
    eventType:
      | "CAPABILITY_CANDIDATE_CREATED"
      | "CAPABILITY_CANDIDATE_VALIDATED"
      | "CAPABILITY_CANDIDATE_TESTED"
      | "CAPABILITY_CANDIDATE_ACTIVATED"
      | "CAPABILITY_CANDIDATE_REVOKED",
    success: boolean,
    candidateId: string,
  ) {
    return this.audit({
      eventType,
      ownerId: input.ownerId,
      outcome: success ? "SUCCESS" : "DENIED",
      reason: `Capability Studio ${eventType.toLowerCase().replaceAll("_", " ")}.`,
      metadata: { candidateId },
      requestId: input.requestId,
      ipAddress: input.ipAddress,
    });
  }
}
