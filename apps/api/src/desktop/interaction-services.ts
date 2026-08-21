import {
  DesktopActionRecordSchema,
  FieldMappingRecordSchema,
  InteractionFailureRecordSchema,
  InteractionHistoryRecordSchema,
  DesktopInteractionMetricRecordSchema,
  DesktopInteractionProfileRecordSchema,
  InteractionVerificationRecordSchema,
  SemanticActionRecordSchema,
  SemanticInteractionRecordSchema,
  SemanticInteractionRequestSchema,
  SemanticInteractionResponseSchema,
  TargetResolutionRecordSchema,
  type FieldMappingRecord,
  type FormFillRequest,
  type InteractionVerificationRecord,
  type SemanticDesktopObjectRecord,
  type SemanticInteractionAction,
  type SemanticInteractionRequest,
  type SemanticInteractionResponse,
  type SemanticInteractionStatus,
} from "@alexa-control/shared";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { DesktopStore } from "./store.js";

const metadataOnlyActions = new Set<SemanticInteractionAction>([
  "focus",
  "hover",
  "reveal",
  "highlight",
  "preview",
  "review",
  "scroll_into_view",
]);

const actionAlias: Partial<Record<SemanticInteractionAction, string>> = {
  click: "click",
  double_click: "double_click",
  focus: "focus",
  activate: "activate",
  expand: "expand",
  collapse: "collapse",
  open: "open",
  close: "close",
  submit: "submit",
  cancel: "cancel",
  accept: "accept",
  reject: "reject",
  select: "select",
  deselect: "deselect",
  toggle: "toggle",
  choose: "choose",
  hover: "hover",
  scroll_into_view: "scroll_into_view",
  reveal: "reveal",
  highlight: "highlight",
  set_value: "set_value",
};

const roleCapability: Record<string, string> = {
  application: "application_management.provider_required",
  window: "window_management.provider_required",
  dialog: "accessibility.provider_required",
  button: "accessibility.provider_required",
  menu: "accessibility.provider_required",
  menu_item: "accessibility.provider_required",
  toolbar: "accessibility.provider_required",
  sidebar_item: "accessibility.provider_required",
  tab: "accessibility.provider_required",
  tab_group: "accessibility.provider_required",
  list: "accessibility.provider_required",
  table: "accessibility.provider_required",
  tree: "accessibility.provider_required",
  card: "accessibility.provider_required",
  form: "accessibility.provider_required",
  input_field: "accessibility.provider_required",
  password_field: "accessibility.provider_required",
  search_field: "accessibility.provider_required",
  dropdown: "accessibility.provider_required",
  checkbox: "accessibility.provider_required",
  radio_button: "accessibility.provider_required",
  slider: "accessibility.provider_required",
  switch: "accessibility.provider_required",
  progress_indicator: "desktop.context.read",
  status_bar: "desktop.context.read",
  notification: "notifications.provider_required",
  popover: "accessibility.provider_required",
  context_menu: "accessibility.provider_required",
  canvas_region: "accessibility.provider_required",
  scrollable_container: "accessibility.provider_required",
  terminal_panel: "developer_tools.provider_required",
  editor: "accessibility.provider_required",
  split_view: "accessibility.provider_required",
  panel: "desktop.context.read",
  group: "desktop.context.read",
  unknown: "accessibility.provider_required",
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const includesNormalized = (source: string, query: string) => {
  const normalizedSource = normalize(source);
  const normalizedQuery = normalize(query);
  return (
    normalizedSource === normalizedQuery ||
    normalizedSource.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedSource)
  );
};

const scoreObject = (object: SemanticDesktopObjectRecord, query: string) => {
  const parts = [
    object.displayName,
    object.accessibilityLabel ?? "",
    object.accessibilityIdentifier ?? "",
    object.description,
    object.role,
    ...object.aliases,
    ...object.relationships,
  ];
  const exact = parts.some((part) => normalize(part) === normalize(query));
  if (exact) return 1;
  if (parts.some((part) => includesNormalized(part, query))) return 0.86;
  return 0;
};

export class TargetResolutionService {
  constructor(
    readonly store: DesktopStore,
    readonly now: () => Date,
  ) {}

  async resolve(input: {
    ownerId: string;
    request: Pick<SemanticInteractionRequest, "target" | "action">;
  }) {
    const at = this.now().toISOString();
    const objects = await this.store.listSemanticObjects(input.ownerId, 2_000);
    const target = input.request.target;
    const candidates = target.objectId
      ? objects.filter((object) => object.id === target.objectId)
      : target.query
        ? objects
            .filter((object) => object.visibility === "visible")
            .filter(
              (object) =>
                !target.applicationId || object.applicationId === target.applicationId,
            )
            .filter((object) => !target.windowId || object.windowId === target.windowId)
            .map((object) => ({
              object,
              score: scoreObject(object, target.query ?? ""),
            }))
            .filter((candidate) => candidate.score > 0)
            .sort((left, right) => right.score - left.score)
            .slice(0, 10)
            .map((candidate) => candidate.object)
        : [];
    const selected = candidates[0] ?? null;
    const confidence = selected
      ? target.objectId
        ? 1
        : scoreObject(selected, target.query ?? "")
      : 0;
    const ambiguous =
      candidates.length > 1 &&
      !target.objectId &&
      confidence > 0 &&
      scoreObject(candidates[1]!, target.query ?? "") >= confidence - 0.04;
    const visible = selected?.visibility === "visible" && selected.state.visible;
    const enabled = Boolean(selected?.state.enabled);
    const supportedAction = actionAlias[input.request.action];
    const supported =
      input.request.action === "preview" ||
      input.request.action === "review" ||
      input.request.action === "clear" ||
      input.request.action === "replace" ||
      input.request.action === "append" ||
      input.request.action === "reset" ||
      (supportedAction
        ? selected?.supportedActions.includes(supportedAction as never)
        : false);
    const permitted = Boolean(
      selected?.permissions.includes("owner_session") ||
      (metadataOnlyActions.has(input.request.action) &&
        selected?.permissions.includes("owner_authenticated_read")),
    );
    const status = !selected
      ? "not_found"
      : ambiguous
        ? "ambiguous"
        : !visible || !enabled || !permitted || !supported
          ? permitted
            ? "invalid"
            : "denied"
          : "resolved";
    const reason =
      status === "resolved"
        ? "Target resolved through semantic desktop object metadata."
        : status === "ambiguous"
          ? "Multiple semantic controls matched with similar confidence."
          : status === "not_found"
            ? "No visible semantic object matched the request."
            : status === "denied"
              ? "Target permissions do not allow semantic interaction."
              : "Target is hidden, disabled, or does not support the requested action.";
    const record = TargetResolutionRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      query: target.query,
      objectId: target.objectId,
      resolvedObjectId: status === "resolved" ? (selected?.id ?? null) : null,
      status,
      confidence,
      candidateObjectIds: candidates.map((candidate) => candidate.id).slice(0, 10),
      reason,
      validatedVisible: visible,
      validatedEnabled: enabled,
      validatedPermission: permitted,
      supportedActions: selected?.supportedActions ?? [],
      createdAt: at,
    });
    await this.store.saveTargetResolution(record);
    return { record, target: status === "resolved" ? selected : null, candidates };
  }
}

export class FieldMatchingService {
  constructor(readonly store: DesktopStore) {}

  async match(ownerId: string, field: string, formObjectId: string | null) {
    const mappings = await this.store.listFieldMappings(ownerId, 1_000);
    const candidates = mappings
      .filter((mapping) => !formObjectId || mapping.objectId === formObjectId)
      .map((mapping) => ({
        mapping,
        score: this.score(mapping, field),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score);
    const first = candidates[0];
    const second = candidates[1];
    if (!first) {
      return {
        status: "not_found" as const,
        mapping: null,
        candidates: [] as FieldMappingRecord[],
        reason: "No registered field mapping matched the requested field.",
      };
    }
    if (second && second.score >= first.score - 0.04) {
      return {
        status: "ambiguous" as const,
        mapping: null,
        candidates: candidates.map((candidate) => candidate.mapping).slice(0, 5),
        reason: "Multiple fields matched with similar confidence.",
      };
    }
    return {
      status: "resolved" as const,
      mapping: first.mapping,
      candidates: [first.mapping],
      reason: "Field matched through label, alias, tags, and accessibility metadata.",
    };
  }

  private score(mapping: FieldMappingRecord, query: string) {
    const parts = [
      mapping.fieldKey,
      mapping.label,
      mapping.fieldType,
      ...mapping.aliases,
      ...mapping.semanticTags,
    ];
    if (parts.some((part) => normalize(part) === normalize(query))) return 1;
    if (parts.some((part) => includesNormalized(part, query))) return 0.86;
    return 0;
  }
}

export class FormInteractionService {
  constructor(
    readonly store: DesktopStore,
    readonly fields: FieldMatchingService,
    readonly now: () => Date,
  ) {}

  async toSteps(ownerId: string, request: FormFillRequest) {
    const steps: SemanticInteractionRequest["steps"] = [];
    const failures: string[] = [];
    for (const field of request.fields) {
      const match = await this.fields.match(ownerId, field.field, request.formObjectId);
      if (match.status !== "resolved" || !match.mapping) {
        failures.push(`${field.field}: ${match.reason}`);
        continue;
      }
      const validation = this.validateValue(match.mapping, field.value);
      if (!validation.ok) {
        failures.push(`${field.field}: ${validation.reason}`);
        continue;
      }
      steps.push({
        action:
          field.mode === "clear"
            ? "clear"
            : field.mode === "append"
              ? "append"
              : field.mode === "fill"
                ? "set_value"
                : "replace",
        target: {
          objectId: match.mapping.objectId,
          query: null,
          fieldKey: match.mapping.fieldKey,
          applicationId: null,
          windowId: null,
          contextObjectId: request.formObjectId,
        },
        value: field.value,
      });
    }
    if (request.submit) {
      steps.push({
        action: "submit",
        target: {
          objectId: request.formObjectId,
          query: request.formObjectId ? null : "submit",
          fieldKey: null,
          applicationId: null,
          windowId: null,
          contextObjectId: request.formObjectId,
        },
      });
    }
    return { steps, failures };
  }

  validateValue(mapping: FieldMappingRecord, value: unknown) {
    const rule = mapping.validation;
    if (mapping.fieldType === "password" && !mapping.secureEntryAllowed) {
      return {
        ok: false,
        reason: "Secure password entry is not explicitly permitted for this field.",
      };
    }
    if (mapping.fieldType === "checkbox" || mapping.fieldType === "radio") {
      if (typeof value !== "boolean" && typeof value !== "string") {
        return {
          ok: false,
          reason: "Checkbox and radio values must be boolean or option text.",
        };
      }
    } else if (typeof value !== "string" && typeof value !== "number") {
      return { ok: false, reason: "Field value must be a string or number." };
    }
    const text = String(value);
    if (rule.required && text.length === 0)
      return { ok: false, reason: "Field is required." };
    if (rule.minLength !== null && text.length < rule.minLength) {
      return {
        ok: false,
        reason: `Value is shorter than ${rule.minLength} characters.`,
      };
    }
    if (rule.maxLength !== null && text.length > rule.maxLength) {
      return {
        ok: false,
        reason: `Value is longer than ${rule.maxLength} characters.`,
      };
    }
    if (rule.regex) {
      const regex = new RegExp(rule.regex);
      if (!regex.test(text))
        return { ok: false, reason: "Value does not match field pattern." };
    }
    if (mapping.fieldType === "number") {
      const numeric = Number(value);
      if (!Number.isFinite(numeric))
        return { ok: false, reason: "Value must be numeric." };
      if (rule.min !== null && numeric < rule.min)
        return { ok: false, reason: `Value is below ${rule.min}.` };
      if (rule.max !== null && numeric > rule.max)
        return { ok: false, reason: `Value is above ${rule.max}.` };
    }
    if (rule.allowedValues.length > 0 && !rule.allowedValues.includes(text)) {
      return {
        ok: false,
        reason: "Value is not one of the registered allowed values.",
      };
    }
    return { ok: true, reason: "Value validation passed." };
  }
}

export class InteractionVerificationService {
  constructor(
    readonly store: DesktopStore,
    readonly now: () => Date,
  ) {}

  async verify(input: {
    ownerId: string;
    interactionId: string;
    target: SemanticDesktopObjectRecord | null;
    action: SemanticInteractionAction;
    status: SemanticInteractionStatus;
    started: number;
  }) {
    const status =
      input.status === "completed" || input.status === "previewed"
        ? "passed"
        : "failed";
    const type =
      input.status === "previewed"
        ? "preview_visible"
        : input.action === "set_value" ||
            input.action === "replace" ||
            input.action === "append" ||
            input.action === "clear"
          ? "value_updated"
          : input.action === "select" ||
              input.action === "deselect" ||
              input.action === "toggle" ||
              input.action === "choose"
            ? "selection_changed"
            : input.action === "submit"
              ? "submission_completed"
              : input.action === "close" || input.action === "cancel"
                ? "dialog_closed"
                : "capability_recorded";
    const record = InteractionVerificationRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      interactionId: input.interactionId,
      targetObjectId: input.target?.id ?? null,
      verificationType: type,
      status,
      expected: input.action,
      observed:
        input.status === "completed" || input.status === "previewed"
          ? input.status
          : "provider unavailable or validation failed",
      latencyMs: Math.max(0, Math.round(performance.now() - input.started)),
      verifiedAt: this.now().toISOString(),
    });
    await this.store.saveInteractionVerification(record);
    return record;
  }
}

export class SemanticInteractionService {
  readonly targetResolution: TargetResolutionService;
  readonly fieldMatching: FieldMatchingService;
  readonly forms: FormInteractionService;
  readonly verification: InteractionVerificationService;

  constructor(
    readonly store: DesktopStore,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
  ) {
    this.targetResolution = new TargetResolutionService(store, now);
    this.fieldMatching = new FieldMatchingService(store);
    this.forms = new FormInteractionService(store, this.fieldMatching, now);
    this.verification = new InteractionVerificationService(store, now);
  }

  async ensureBaseline(ownerId: string, at: string) {
    if ((await this.store.listInteractionProfiles(ownerId, 1)).length === 0) {
      await this.store.saveInteractionProfile(
        DesktopInteractionProfileRecordSchema.parse({
          id: "interaction.profile.default",
          ownerId,
          name: "Deterministic semantic interaction profile",
          previewRequiredForRisk: ["high_risk", "critical"],
          safeRetryActions: [
            "focus",
            "hover",
            "highlight",
            "reveal",
            "scroll_into_view",
          ],
          securePasswordEntryDefault: false,
          updatedAt: at,
        }),
      );
    }
    const mappings = await this.store.listFieldMappings(ownerId, 1);
    if (mappings.length === 0) {
      const fields = [
        {
          objectId: "semantic.object.dashboard.command-palette",
          fieldKey: "global_command_palette",
          label: "Global Command Palette",
          aliases: ["command palette", "global search", "search"],
          fieldType: "search",
          semanticTags: ["command", "search", "dashboard"],
          validation: { required: false, maxLength: 240 },
        },
      ] as const;
      for (const field of fields) {
        await this.store.saveFieldMapping(
          FieldMappingRecordSchema.parse({
            id: crypto.randomUUID(),
            ownerId,
            ...field,
            validation: field.validation,
            secureEntryAllowed: false,
            updatedAt: at,
          }),
        );
      }
    }
    await this.store.saveInteractionMetric(
      DesktopInteractionMetricRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        metricName: "semantic_interaction_engine_readiness",
        value: 0.62,
        measuredAt: at,
      }),
    );
  }

  async interact(input: {
    ownerId: string;
    body: unknown;
    requestId: string;
    ipAddress: string;
  }): Promise<SemanticInteractionResponse> {
    const started = performance.now();
    const request = SemanticInteractionRequestSchema.parse(input.body);
    return this.executeRequest({ ...input, request, started });
  }

  async fillForm(input: {
    ownerId: string;
    body: FormFillRequest;
    requestId: string;
    ipAddress: string;
  }) {
    const started = performance.now();
    const { steps, failures } = await this.forms.toSteps(input.ownerId, input.body);
    if (failures.length > 0) {
      const request = SemanticInteractionRequestSchema.parse({
        origin: input.body.origin,
        action: "set_value",
        target: { objectId: input.body.formObjectId, query: null },
        preview: input.body.preview,
      });
      return this.recordFailure({
        ownerId: input.ownerId,
        request,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        code: "FORM_VALIDATION_FAILED",
        reason: failures.join(" "),
        started,
      });
    }
    const request = SemanticInteractionRequestSchema.parse({
      origin: input.body.origin,
      action: steps[0]?.action ?? "set_value",
      target: steps[0]?.target ?? { objectId: input.body.formObjectId, query: null },
      value: steps[0]?.value,
      preview: input.body.preview,
      steps,
    });
    return this.executeRequest({
      ownerId: input.ownerId,
      request,
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      started,
    });
  }

  private async executeRequest(input: {
    ownerId: string;
    request: SemanticInteractionRequest;
    requestId: string;
    ipAddress: string;
    started: number;
  }) {
    const at = this.now().toISOString();
    const interactionId = crypto.randomUUID();
    const steps =
      input.request.steps.length > 0
        ? input.request.steps
        : [
            {
              action: input.request.action,
              target: input.request.target,
              value: input.request.value,
            },
          ];
    const actionRecords = [];
    const verificationRecords: InteractionVerificationRecord[] = [];
    let firstTarget: SemanticDesktopObjectRecord | null = null;
    let finalStatus: SemanticInteractionStatus = input.request.preview
      ? "previewed"
      : "completed";
    let clarification: string | null = null;
    let failureReason: string | null = null;
    let capabilityId = "desktop.context.read";

    for (const [sequence, step] of steps.entries()) {
      const resolution = await this.targetResolution.resolve({
        ownerId: input.ownerId,
        request: step,
      });
      if (!resolution.target) {
        finalStatus =
          resolution.record.status === "ambiguous"
            ? "needs_clarification"
            : resolution.record.status === "denied"
              ? "denied"
              : "failed";
        clarification =
          resolution.record.status === "ambiguous"
            ? ambiguityPrompt(resolution.candidates)
            : null;
        failureReason = resolution.record.reason;
        break;
      }
      firstTarget ??= resolution.target;
      capabilityId =
        metadataOnlyActions.has(step.action) || input.request.preview
          ? "desktop.context.read"
          : (roleCapability[resolution.target.role] ??
            "accessibility.provider_required");
      const capability = await this.store.getCapability(input.ownerId, capabilityId);
      const provider = capability
        ? await this.store.getProvider(input.ownerId, capability.providerId)
        : null;
      const providerReady = provider?.status === "healthy";
      const executable =
        input.request.preview || metadataOnlyActions.has(step.action)
          ? capability?.status === "available" && providerReady
          : capability?.status === "available" &&
            providerReady &&
            !capability.approvalRequired;
      const status: SemanticInteractionStatus = input.request.preview
        ? "previewed"
        : executable
          ? "completed"
          : capability?.approvalRequired && providerReady
            ? "waiting_approval"
            : "denied";
      finalStatus = status;
      const semanticAction = SemanticActionRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        interactionId,
        sequence,
        action: step.action,
        targetObjectId: resolution.target.id,
        fieldMappingId: null,
        capabilityId,
        status,
        validationStatus: "passed",
        verificationStatus:
          status === "completed" || status === "previewed" ? "passed" : "failed",
        createdAt: at,
        completedAt: status === "completed" || status === "previewed" ? at : null,
      });
      await this.store.saveSemanticAction(semanticAction);
      actionRecords.push(semanticAction);
      await this.store.saveAction(
        DesktopActionRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          capabilityId,
          providerId: capability?.providerId ?? "unknown_provider",
          status:
            status === "completed" || status === "previewed"
              ? "completed"
              : status === "waiting_approval"
                ? "waiting_approval"
                : "denied",
          requestedInput: {
            semanticInteractionId: interactionId,
            targetObjectId: resolution.target.id,
            action: step.action,
            origin: input.request.origin,
            preview: input.request.preview,
          },
          safeOutput:
            status === "completed" || status === "previewed"
              ? {
                  message:
                    "Semantic interaction recorded through the Desktop Capability Layer.",
                }
              : {},
          riskLevel: capability?.riskLevel ?? "moderate_risk",
          approvalRequired: Boolean(
            capability?.approvalRequired && !input.request.preview,
          ),
          policyChecked: true,
          executionTimeMs: Math.max(0, Math.round(performance.now() - input.started)),
          warnings:
            status === "denied"
              ? ["No reviewed healthy semantic interaction provider is available."]
              : [],
          errorCode:
            status === "denied" ? "SEMANTIC_INTERACTION_PROVIDER_UNAVAILABLE" : null,
          rollbackAvailable: false,
          requestedAt: at,
          completedAt:
            status === "completed" || status === "previewed" || status === "denied"
              ? at
              : null,
        }),
      );
      const verification = await this.verification.verify({
        ownerId: input.ownerId,
        interactionId,
        target: resolution.target,
        action: step.action,
        status,
        started: input.started,
      });
      verificationRecords.push(verification);
      if (status !== "completed" && status !== "previewed") {
        failureReason =
          "Semantic interaction provider is unavailable or approval is required.";
        break;
      }
    }

    const interaction = SemanticInteractionRecordSchema.parse({
      id: interactionId,
      ownerId: input.ownerId,
      origin: input.request.origin,
      requestedAction: input.request.action,
      targetObjectId: firstTarget?.id ?? null,
      targetDisplayName: firstTarget?.displayName ?? null,
      targetRole: firstTarget?.role ?? null,
      semanticMetadata: {
        pipeline:
          "intent_resolution -> semantic_registry -> desktop_navigation_engine -> target_resolution -> validation -> interaction_execution -> verification -> audit",
        noCoordinates: true,
        noOcr: true,
        noComputerVision: true,
      },
      status: finalStatus,
      preview: input.request.preview,
      capabilityId,
      policyChecked: true,
      deterministic: true,
      aiUsed: false,
      ocrUsed: false,
      computerVisionUsed: false,
      coordinateAutomationUsed: false,
      ambiguityReason: clarification,
      failureReason,
      requestedAt: at,
      completedAt:
        finalStatus === "completed" ||
        finalStatus === "previewed" ||
        finalStatus === "denied"
          ? at
          : null,
    });
    await this.store.saveSemanticInteraction(interaction);
    await this.store.saveInteractionHistory(
      InteractionHistoryRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        interactionId,
        action: input.request.action,
        targetObjectId: firstTarget?.id ?? null,
        origin: input.request.origin,
        result: finalStatus,
        summary: summaryFor(interaction, firstTarget),
        createdAt: at,
      }),
    );
    if (failureReason) {
      await this.store.saveInteractionFailure(
        InteractionFailureRecordSchema.parse({
          id: crypto.randomUUID(),
          ownerId: input.ownerId,
          interactionId,
          targetObjectId: firstTarget?.id ?? null,
          failureCode:
            finalStatus === "needs_clarification"
              ? "AMBIGUOUS_TARGET"
              : finalStatus === "denied"
                ? "INTERACTION_DENIED"
                : "INTERACTION_FAILED",
          reason: failureReason,
          retrySafe: false,
          createdAt: at,
        }),
      );
    }
    await this.store.saveInteractionMetric(
      DesktopInteractionMetricRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        metricName:
          finalStatus === "completed" || finalStatus === "previewed"
            ? "interaction_completed"
            : "interaction_failed",
        value: 1,
        measuredAt: at,
      }),
    );
    await this.audit({
      eventType:
        finalStatus === "completed" || finalStatus === "previewed"
          ? "SEMANTIC_INTERACTION_COMPLETED"
          : finalStatus === "needs_clarification"
            ? "SEMANTIC_INTERACTION_AMBIGUOUS"
            : "SEMANTIC_INTERACTION_DENIED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome:
        finalStatus === "completed" || finalStatus === "previewed"
          ? "SUCCESS"
          : "DENIED",
      reason: summaryFor(interaction, firstTarget),
      requestId: input.requestId,
      metadata: {
        interactionId,
        targetObjectId: firstTarget?.id ?? null,
        requestedAction: input.request.action,
        origin: input.request.origin,
        capabilityId,
        deterministic: true,
        aiUsed: false,
        ocrUsed: false,
        computerVisionUsed: false,
        coordinateAutomationUsed: false,
      },
    });
    return SemanticInteractionResponseSchema.parse({
      interaction,
      target: firstTarget,
      actions: actionRecords,
      verification: verificationRecords,
      message: summaryFor(interaction, firstTarget),
      requiresClarification: finalStatus === "needs_clarification",
      clarificationPrompt: clarification,
      deterministic: true,
      aiUsed: false,
    });
  }

  private async recordFailure(input: {
    ownerId: string;
    request: SemanticInteractionRequest;
    requestId: string;
    ipAddress: string;
    code: string;
    reason: string;
    started: number;
  }) {
    const at = this.now().toISOString();
    const interaction = SemanticInteractionRecordSchema.parse({
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      origin: input.request.origin,
      requestedAction: input.request.action,
      targetObjectId: input.request.target.objectId,
      targetDisplayName: null,
      targetRole: null,
      semanticMetadata: { validationFailed: true },
      status: "failed",
      preview: input.request.preview,
      capabilityId: "accessibility.provider_required",
      policyChecked: true,
      deterministic: true,
      aiUsed: false,
      ocrUsed: false,
      computerVisionUsed: false,
      coordinateAutomationUsed: false,
      ambiguityReason: null,
      failureReason: input.reason,
      requestedAt: at,
      completedAt: at,
    });
    await this.store.saveSemanticInteraction(interaction);
    await this.store.saveInteractionFailure(
      InteractionFailureRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        interactionId: interaction.id,
        targetObjectId: interaction.targetObjectId,
        failureCode: input.code,
        reason: input.reason,
        retrySafe: false,
        createdAt: at,
      }),
    );
    const verification = await this.verification.verify({
      ownerId: input.ownerId,
      interactionId: interaction.id,
      target: null,
      action: input.request.action,
      status: "failed",
      started: input.started,
    });
    await this.audit({
      eventType: "SEMANTIC_INTERACTION_VALIDATION_FAILED",
      ownerId: input.ownerId,
      ipAddress: input.ipAddress,
      outcome: "DENIED",
      reason: input.reason,
      requestId: input.requestId,
      metadata: { interactionId: interaction.id, code: input.code },
    });
    return SemanticInteractionResponseSchema.parse({
      interaction,
      target: null,
      actions: [],
      verification: [verification],
      message: input.reason,
      requiresClarification: true,
      clarificationPrompt: input.reason,
      deterministic: true,
      aiUsed: false,
    });
  }
}

const ambiguityPrompt = (candidates: SemanticDesktopObjectRecord[]) =>
  `I found ${candidates.length} matching controls: ${candidates
    .slice(0, 3)
    .map((candidate) => `${candidate.displayName} in ${candidate.applicationId}`)
    .join("; ")}. Which would you like?`;

const summaryFor = (
  interaction: { status: SemanticInteractionStatus; requestedAction: string },
  target: SemanticDesktopObjectRecord | null,
) =>
  target
    ? `Semantic ${interaction.requestedAction} for ${target.displayName} ${interaction.status}.`
    : `Semantic ${interaction.requestedAction} ${interaction.status}.`;
