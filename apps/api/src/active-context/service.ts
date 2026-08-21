import {
  ActiveContextObservationSchema,
  ActiveContextResponseSchema,
  ActiveContextSchema,
  type ActiveContext,
  type ActiveConversationContext,
  type AIContextBlock,
} from "@alexa-control/shared";

import type { ApplicationAdapterStore } from "../application-adapters/store.js";
import type { ApplicationIntelligenceStore } from "../application-intelligence/store.js";
import type { CoreAdapterStore } from "../core-adapters/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";

const CONTEXT_TTL_MS = 15_000;
const SOURCE_FRESHNESS_MS = 15_000;
const blockedBundlePatterns = [
  /(?:^|\.)1password(?:\.|$)/i,
  /(?:^|\.)keychain(?:\.|$)/i,
  /bank|banking|authenticator|password/i,
];

const fresh = (timestamp: string, now: Date) =>
  now.getTime() - new Date(timestamp).getTime() <= SOURCE_FRESHNESS_MS;

const cleanUri = (value: string | null) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:", "file:"].includes(parsed.protocol)) return null;
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().slice(0, 2_000);
  } catch {
    return null;
  }
};

export class ActiveContextService {
  readonly #current = new Map<string, ActiveContext>();
  readonly #previous = new Map<string, ActiveContext>();

  constructor(
    private readonly applicationAdapters: ApplicationAdapterStore,
    private readonly coreAdapters: CoreAdapterStore,
    private readonly applicationIntelligence: ApplicationIntelligenceStore,
    private readonly audit: GovernanceAuditWriter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async update(input: {
    ownerId: string;
    deviceId: string;
    observation: unknown;
    requestId: string;
    ipAddress: string;
  }) {
    const started = performance.now();
    const observation = ActiveContextObservationSchema.parse(input.observation);
    const now = this.now();
    const observationFresh = fresh(observation.capturedAt, now);
    const [applications, snapshots, sessions] = await Promise.all([
      Promise.resolve(
        this.applicationAdapters.listTrustedApplications(input.ownerId, 1_000),
      ).catch(() => []),
      Promise.resolve(this.coreAdapters.listContextSnapshots(input.ownerId, 200)).catch(
        () => [],
      ),
      Promise.resolve(
        this.applicationIntelligence.listSessions(input.ownerId, 200),
      ).catch(() => []),
    ]);
    const application = applications.find(
      (item) =>
        item.bundleIdentifier.toLowerCase() ===
        observation.application.bundleIdentifier.toLowerCase(),
    );
    const explicitlyBlocked =
      blockedBundlePatterns.some((pattern) =>
        pattern.test(observation.application.bundleIdentifier),
      ) ||
      application?.status === "revoked" ||
      application?.status === "disabled";
    const trusted = application?.status === "trusted";
    const semanticRead = Boolean(
      trusted &&
      application.permissionsGranted.includes("read_semantic_structure") &&
      application.trustLevel !== "metadata_only",
    );
    const adapterSnapshot = snapshots.find(
      (item) => item.applicationId === application?.id && fresh(item.capturedAt, now),
    );
    const intelligenceSession = sessions.find(
      (item) =>
        item.applicationId === application?.id &&
        item.status === "active" &&
        fresh(item.updatedAt, now),
    );
    const secureContentSuppressed = Boolean(observation.selection?.secure);
    const contentAllowed =
      observationFresh && trusted && semanticRead && !explicitlyBlocked;
    const selectionText =
      contentAllowed && !secureContentSuppressed
        ? (adapterSnapshot?.currentSelection ?? observation.selection?.text ?? null)
        : null;
    const documentTitle = contentAllowed
      ? (adapterSnapshot?.currentDocument ?? observation.document?.title ?? null)
      : null;
    const windowTitle =
      observationFresh && trusted && !explicitlyBlocked
        ? (observation.window?.title ?? null)
        : null;
    const sources: ActiveContext["sources"] = [];
    if (adapterSnapshot) sources.push("REVIEWED_ADAPTER");
    if (intelligenceSession) sources.push("APPLICATION_INTELLIGENCE");
    sources.push("REVIEWED_NATIVE_PROVIDER");
    if (observation.accessibilityTrusted && !explicitlyBlocked)
      sources.push("ACCESSIBILITY_METADATA");
    sources.push("APPLICATION_IDENTITY");
    const status: ActiveContext["status"] = !observationFresh
      ? "STALE"
      : explicitlyBlocked
        ? "DENIED"
        : contentAllowed
          ? "CURRENT"
          : "DEGRADED";
    const contextSummary = this.summary({
      applicationName: observation.application.name,
      windowTitle,
      documentTitle,
      selectionLength: selectionText?.length ?? 0,
      denied: explicitlyBlocked,
    });
    const context = ActiveContextSchema.parse({
      ownerId: input.ownerId,
      deviceId: input.deviceId,
      status,
      application: {
        id: application?.id ?? null,
        name: observation.application.name,
        bundleIdentifier: observation.application.bundleIdentifier,
      },
      window: windowTitle ? { title: windowTitle } : null,
      document:
        documentTitle || (contentAllowed && observation.document)
          ? {
              title: documentTitle,
              type: observation.document?.type ?? null,
              uri: contentAllowed ? cleanUri(observation.document?.uri ?? null) : null,
            }
          : null,
      selection: selectionText
        ? {
            text: selectionText,
            semanticType: observation.selection?.semanticType ?? "text",
            characterCount: selectionText.length,
          }
        : null,
      semanticObjects: intelligenceSession?.currentObjectId
        ? [
            {
              id: intelligenceSession.currentObjectId,
              label: intelligenceSession.contextSummary,
              type: intelligenceSession.domain,
              confidence: 0.9,
            },
          ]
        : [],
      capabilityReferences: application?.capabilities.slice(0, 30) ?? [],
      sources: [...new Set(sources)],
      confidence: !observationFresh
        ? 0.2
        : explicitlyBlocked
          ? 1
          : contentAllowed
            ? 0.92
            : trusted
              ? 0.68
              : 0.45,
      permission: explicitlyBlocked
        ? "DENIED"
        : contentAllowed
          ? "ALLOWED"
          : "IDENTITY_ONLY",
      secureContentSuppressed,
      contextSummary,
      capturedAt: observation.capturedAt,
      lastConfirmedAt: now.toISOString(),
      staleAt: new Date(now.getTime() + CONTEXT_TTL_MS).toISOString(),
      authority: "CONTEXT_ONLY",
    });
    const key = this.key(input.ownerId, input.deviceId);
    const existing = this.#current.get(key);
    if (existing) this.#previous.set(key, structuredClone(existing));
    this.#current.set(key, structuredClone(context));
    if (
      (explicitlyBlocked || secureContentSuppressed) &&
      (!existing ||
        existing.application.bundleIdentifier !==
          context.application.bundleIdentifier ||
        existing.secureContentSuppressed !== secureContentSuppressed ||
        existing.permission !== context.permission)
    ) {
      await this.audit({
        eventType: "POLICY_DENIED",
        ownerId: input.ownerId,
        ipAddress: input.ipAddress,
        outcome: "DENIED",
        reason: explicitlyBlocked
          ? "Active application context access was denied by existing trust policy."
          : "Secure input content was suppressed from active context.",
        requestId: input.requestId,
        metadata: {
          deviceId: input.deviceId,
          applicationId: application?.id ?? null,
          secureContentSuppressed,
          contextAuthority: "CONTEXT_ONLY",
        },
      });
    }
    return ActiveContextResponseSchema.parse({
      context,
      refreshed: performance.now() - started >= 0,
    });
  }

  current(ownerId: string, deviceId: string) {
    const context = this.#current.get(this.key(ownerId, deviceId));
    if (!context)
      return ActiveContextResponseSchema.parse({ context: null, refreshed: false });
    if (new Date(context.staleAt) <= this.now()) {
      return ActiveContextResponseSchema.parse({
        context: {
          ...context,
          status: "STALE",
          window: null,
          document: null,
          selection: null,
          semanticObjects: [],
          capabilityReferences: [],
          confidence: 0.2,
          contextSummary: `${context.application.name} context is stale.`,
        },
        refreshed: false,
      });
    }
    return ActiveContextResponseSchema.parse({
      context: structuredClone(context),
      refreshed: false,
    });
  }

  snapshot(ownerId: string, deviceId: string) {
    const current = this.current(ownerId, deviceId).context;
    return current?.status === "STALE" ? null : structuredClone(current);
  }

  previous(ownerId: string, deviceId: string) {
    return structuredClone(this.#previous.get(this.key(ownerId, deviceId)) ?? null);
  }

  toAIContext(context: ActiveContext): AIContextBlock {
    return {
      sourceType: "EXTERNAL",
      trustLevel: "UNTRUSTED",
      content: {
        kind: "ACTIVE_DESKTOP_CONTEXT",
        authority: "CONTEXT_ONLY",
        application: context.application,
        window: context.window,
        document: context.document,
        selection: context.selection,
        semanticObjects: context.semanticObjects,
        provenance: context.sources,
        capturedAt: context.capturedAt,
      },
    };
  }

  toConversationContext(context: ActiveContext): ActiveConversationContext {
    return {
      deviceId: context.deviceId,
      applicationId: context.application.id,
      applicationName: context.application.name,
      windowId: null,
      windowTitle: context.window?.title ?? null,
      documentTitle: context.document?.title ?? null,
      url: context.document?.uri?.startsWith("http") ? context.document.uri : null,
      workspaceId: null,
      projectId: null,
      selectedText: context.selection?.text ?? null,
      focusedElement: context.selection?.semanticType ?? null,
      semanticContentReference: context.document?.uri ?? null,
      adapterId: context.sources.includes("REVIEWED_ADAPTER")
        ? context.application.id
        : null,
      providerId: context.sources.includes("ACCESSIBILITY_METADATA")
        ? "macos.accessibility.metadata"
        : "macos.application.identity",
      capturedAt: context.capturedAt,
      authority: "CONTEXT_ONLY",
    };
  }

  private key(ownerId: string, deviceId: string) {
    return `${ownerId}:${deviceId}`;
  }

  private summary(input: {
    applicationName: string;
    windowTitle: string | null;
    documentTitle: string | null;
    selectionLength: number;
    denied: boolean;
  }) {
    if (input.denied) return `${input.applicationName} · context unavailable`;
    const detail = input.documentTitle ?? input.windowTitle;
    const selection = input.selectionLength
      ? ` · ${input.selectionLength} characters selected`
      : "";
    return `${input.applicationName}${detail ? ` · ${detail}` : ""}${selection}`.slice(
      0,
      300,
    );
  }
}
