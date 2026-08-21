import {
  CapabilityMetricRecordSchema,
  CapabilityProviderSchema,
  ClipboardHistoryRecordSchema,
  DesktopActionRecordSchema,
  DesktopApplicationRecordSchema,
  DesktopCapabilitySchema,
  DesktopContextSchema,
  DesktopSemanticEventRecordSchema,
  DesktopWindowRecordSchema,
  FocusHistoryRecordSchema,
  HighlightProfileRecordSchema,
  NavigationGraphRecordSchema,
  NavigationMetricRecordSchema,
  NavigationSessionRecordSchema,
  NavigationTargetRecordSchema,
  AccessibilitySnapshotRecordSchema,
  DesktopMetricRecordSchema,
  DesktopNavigationHistoryRecordSchema,
  DesktopObjectRecordSchema,
  DesktopOverlaySettingsRecordSchema,
  DesktopPanelRecordSchema,
  DesktopProfileRecordSchema,
  DesktopPreferenceRecordSchema,
  FieldMappingRecordSchema,
  SemanticDesktopContextRecordSchema,
  SemanticDesktopObjectRecordSchema,
  InteractionFailureRecordSchema,
  InteractionHistoryRecordSchema,
  DesktopInteractionMetricRecordSchema,
  DesktopInteractionProfileRecordSchema,
  InteractionVerificationRecordSchema,
  SemanticActionRecordSchema,
  SemanticInteractionRecordSchema,
  TargetResolutionRecordSchema,
  SemanticNavigationHistoryRecordSchema,
  SemanticRelationshipRecordSchema,
  WindowNavigationRecordSchema,
  DockItemRecordSchema,
  WindowLayoutRecordSchema,
  type CapabilityMetricRecord,
  type CapabilityProvider,
  type ClipboardHistoryRecord,
  type DesktopActionRecord,
  type DesktopApplicationRecord,
  type DesktopCapability,
  type DesktopContext,
  type DesktopSemanticEventRecord,
  type DesktopWindowRecord,
  type FocusHistoryRecord,
  type HighlightProfileRecord,
  type NavigationGraphRecord,
  type NavigationMetricRecord,
  type NavigationSessionRecord,
  type NavigationTargetRecord,
  type AccessibilitySnapshotRecord,
  type DesktopMetricRecord,
  type DesktopNavigationHistoryRecord,
  type DesktopObjectRecord,
  type DesktopOverlaySettingsRecord,
  type DesktopPanelRecord,
  type DesktopProfileRecord,
  type DesktopPreferenceRecord,
  type FieldMappingRecord,
  type SemanticDesktopContextRecord,
  type SemanticDesktopObjectRecord,
  type InteractionFailureRecord,
  type InteractionHistoryRecord,
  type DesktopInteractionMetricRecord,
  type DesktopInteractionProfileRecord,
  type InteractionVerificationRecord,
  type SemanticActionRecord,
  type SemanticInteractionRecord,
  type TargetResolutionRecord,
  type SemanticNavigationHistoryRecord,
  type SemanticRelationshipRecord,
  type WindowNavigationRecord,
  type DockItemRecord,
  type WindowLayoutRecord,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface DesktopStore {
  saveCapability(record: DesktopCapability): Awaitable<void>;
  listCapabilities(ownerId: string, limit: number): Awaitable<DesktopCapability[]>;
  getCapability(ownerId: string, id: string): Awaitable<DesktopCapability | null>;
  saveProvider(record: CapabilityProvider): Awaitable<void>;
  listProviders(ownerId: string, limit: number): Awaitable<CapabilityProvider[]>;
  getProvider(ownerId: string, id: string): Awaitable<CapabilityProvider | null>;
  saveContext(record: DesktopContext): Awaitable<void>;
  listContexts(ownerId: string, limit: number): Awaitable<DesktopContext[]>;
  saveApplication(record: DesktopApplicationRecord): Awaitable<void>;
  listApplications(
    ownerId: string,
    limit: number,
  ): Awaitable<DesktopApplicationRecord[]>;
  saveWindowLayout(record: WindowLayoutRecord): Awaitable<void>;
  listWindowLayouts(ownerId: string, limit: number): Awaitable<WindowLayoutRecord[]>;
  saveClipboard(record: ClipboardHistoryRecord): Awaitable<void>;
  listClipboard(ownerId: string, limit: number): Awaitable<ClipboardHistoryRecord[]>;
  saveAction(record: DesktopActionRecord): Awaitable<void>;
  listActions(ownerId: string, limit: number): Awaitable<DesktopActionRecord[]>;
  saveMetric(record: CapabilityMetricRecord): Awaitable<void>;
  listMetrics(ownerId: string, limit: number): Awaitable<CapabilityMetricRecord[]>;
  savePreference(record: DesktopPreferenceRecord): Awaitable<void>;
  listPreferences(ownerId: string, limit: number): Awaitable<DesktopPreferenceRecord[]>;
  saveDesktopObject(record: DesktopObjectRecord): Awaitable<void>;
  listDesktopObjects(ownerId: string, limit: number): Awaitable<DesktopObjectRecord[]>;
  getDesktopObject(ownerId: string, id: string): Awaitable<DesktopObjectRecord | null>;
  saveDesktopProfile(record: DesktopProfileRecord): Awaitable<void>;
  listDesktopProfiles(
    ownerId: string,
    limit: number,
  ): Awaitable<DesktopProfileRecord[]>;
  saveOverlaySettings(record: DesktopOverlaySettingsRecord): Awaitable<void>;
  listOverlaySettings(
    ownerId: string,
    limit: number,
  ): Awaitable<DesktopOverlaySettingsRecord[]>;
  saveDockItem(record: DockItemRecord): Awaitable<void>;
  listDockItems(ownerId: string, limit: number): Awaitable<DockItemRecord[]>;
  saveDesktopPanel(record: DesktopPanelRecord): Awaitable<void>;
  listDesktopPanels(ownerId: string, limit: number): Awaitable<DesktopPanelRecord[]>;
  saveDesktopNavigationHistory(record: DesktopNavigationHistoryRecord): Awaitable<void>;
  listDesktopNavigationHistory(
    ownerId: string,
    limit: number,
  ): Awaitable<DesktopNavigationHistoryRecord[]>;
  saveDesktopMetric(record: DesktopMetricRecord): Awaitable<void>;
  listDesktopMetrics(ownerId: string, limit: number): Awaitable<DesktopMetricRecord[]>;
  saveDesktopWindow(record: DesktopWindowRecord): Awaitable<void>;
  listDesktopWindows(ownerId: string, limit: number): Awaitable<DesktopWindowRecord[]>;
  saveSemanticObject(record: SemanticDesktopObjectRecord): Awaitable<void>;
  listSemanticObjects(
    ownerId: string,
    limit: number,
  ): Awaitable<SemanticDesktopObjectRecord[]>;
  getSemanticObject(
    ownerId: string,
    id: string,
  ): Awaitable<SemanticDesktopObjectRecord | null>;
  saveSemanticRelationship(record: SemanticRelationshipRecord): Awaitable<void>;
  listSemanticRelationships(
    ownerId: string,
    limit: number,
  ): Awaitable<SemanticRelationshipRecord[]>;
  saveSemanticEvent(record: DesktopSemanticEventRecord): Awaitable<void>;
  listSemanticEvents(
    ownerId: string,
    limit: number,
  ): Awaitable<DesktopSemanticEventRecord[]>;
  saveAccessibilitySnapshot(record: AccessibilitySnapshotRecord): Awaitable<void>;
  listAccessibilitySnapshots(
    ownerId: string,
    limit: number,
  ): Awaitable<AccessibilitySnapshotRecord[]>;
  saveSemanticDesktopContext(record: SemanticDesktopContextRecord): Awaitable<void>;
  listSemanticDesktopContexts(
    ownerId: string,
    limit: number,
  ): Awaitable<SemanticDesktopContextRecord[]>;
  saveNavigationGraph(record: NavigationGraphRecord): Awaitable<void>;
  listNavigationGraphs(
    ownerId: string,
    limit: number,
  ): Awaitable<NavigationGraphRecord[]>;
  saveFocusHistory(record: FocusHistoryRecord): Awaitable<void>;
  listFocusHistory(ownerId: string, limit: number): Awaitable<FocusHistoryRecord[]>;
  saveSemanticNavigationHistory(
    record: SemanticNavigationHistoryRecord,
  ): Awaitable<void>;
  listSemanticNavigationHistory(
    ownerId: string,
    limit: number,
  ): Awaitable<SemanticNavigationHistoryRecord[]>;
  saveNavigationSession(record: NavigationSessionRecord): Awaitable<void>;
  listNavigationSessions(
    ownerId: string,
    limit: number,
  ): Awaitable<NavigationSessionRecord[]>;
  saveNavigationTarget(record: NavigationTargetRecord): Awaitable<void>;
  listNavigationTargets(
    ownerId: string,
    limit: number,
  ): Awaitable<NavigationTargetRecord[]>;
  saveHighlightProfile(record: HighlightProfileRecord): Awaitable<void>;
  listHighlightProfiles(
    ownerId: string,
    limit: number,
  ): Awaitable<HighlightProfileRecord[]>;
  saveNavigationMetric(record: NavigationMetricRecord): Awaitable<void>;
  listNavigationMetrics(
    ownerId: string,
    limit: number,
  ): Awaitable<NavigationMetricRecord[]>;
  saveWindowNavigation(record: WindowNavigationRecord): Awaitable<void>;
  listWindowNavigation(
    ownerId: string,
    limit: number,
  ): Awaitable<WindowNavigationRecord[]>;
  saveSemanticInteraction(record: SemanticInteractionRecord): Awaitable<void>;
  listSemanticInteractions(
    ownerId: string,
    limit: number,
  ): Awaitable<SemanticInteractionRecord[]>;
  saveInteractionHistory(record: InteractionHistoryRecord): Awaitable<void>;
  listInteractionHistory(
    ownerId: string,
    limit: number,
  ): Awaitable<InteractionHistoryRecord[]>;
  saveInteractionVerification(record: InteractionVerificationRecord): Awaitable<void>;
  listInteractionVerification(
    ownerId: string,
    limit: number,
  ): Awaitable<InteractionVerificationRecord[]>;
  saveFieldMapping(record: FieldMappingRecord): Awaitable<void>;
  listFieldMappings(ownerId: string, limit: number): Awaitable<FieldMappingRecord[]>;
  saveInteractionFailure(record: InteractionFailureRecord): Awaitable<void>;
  listInteractionFailures(
    ownerId: string,
    limit: number,
  ): Awaitable<InteractionFailureRecord[]>;
  saveInteractionProfile(record: DesktopInteractionProfileRecord): Awaitable<void>;
  listInteractionProfiles(
    ownerId: string,
    limit: number,
  ): Awaitable<DesktopInteractionProfileRecord[]>;
  saveInteractionMetric(record: DesktopInteractionMetricRecord): Awaitable<void>;
  listInteractionMetrics(
    ownerId: string,
    limit: number,
  ): Awaitable<DesktopInteractionMetricRecord[]>;
  saveSemanticAction(record: SemanticActionRecord): Awaitable<void>;
  listSemanticActions(
    ownerId: string,
    limit: number,
  ): Awaitable<SemanticActionRecord[]>;
  saveTargetResolution(record: TargetResolutionRecord): Awaitable<void>;
  listTargetResolutions(
    ownerId: string,
    limit: number,
  ): Awaitable<TargetResolutionRecord[]>;
}

const clone = <T>(value: T): T => structuredClone(value);
const ordered = <T>(items: T[], field: keyof T, limit: number) =>
  items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const byField = String(right.item[field]).localeCompare(String(left.item[field]));
      // Events can legitimately share the same millisecond timestamp. In that
      // case the later saved record is the most recent activity.
      return byField || right.index - left.index;
    })
    .slice(0, limit)
    .map(({ item }) => clone(item));

export class InMemoryDesktopStore implements DesktopStore {
  readonly #capabilities = new Map<string, DesktopCapability>();
  readonly #providers = new Map<string, CapabilityProvider>();
  readonly #contexts = new Map<string, DesktopContext>();
  readonly #applications = new Map<string, DesktopApplicationRecord>();
  readonly #layouts = new Map<string, WindowLayoutRecord>();
  readonly #clipboard = new Map<string, ClipboardHistoryRecord>();
  readonly #actions = new Map<string, DesktopActionRecord>();
  readonly #metrics = new Map<string, CapabilityMetricRecord>();
  readonly #preferences = new Map<string, DesktopPreferenceRecord>();
  readonly #desktopObjects = new Map<string, DesktopObjectRecord>();
  readonly #desktopProfiles = new Map<string, DesktopProfileRecord>();
  readonly #overlaySettings = new Map<string, DesktopOverlaySettingsRecord>();
  readonly #dockItems = new Map<string, DockItemRecord>();
  readonly #desktopPanels = new Map<string, DesktopPanelRecord>();
  readonly #desktopNavigationHistory = new Map<
    string,
    DesktopNavigationHistoryRecord
  >();
  readonly #desktopMetrics = new Map<string, DesktopMetricRecord>();
  readonly #desktopWindows = new Map<string, DesktopWindowRecord>();
  readonly #semanticObjects = new Map<string, SemanticDesktopObjectRecord>();
  readonly #semanticRelationships = new Map<string, SemanticRelationshipRecord>();
  readonly #semanticEvents = new Map<string, DesktopSemanticEventRecord>();
  readonly #accessibilitySnapshots = new Map<string, AccessibilitySnapshotRecord>();
  readonly #semanticDesktopContexts = new Map<string, SemanticDesktopContextRecord>();
  readonly #navigationGraphs = new Map<string, NavigationGraphRecord>();
  readonly #focusHistory = new Map<string, FocusHistoryRecord>();
  readonly #semanticNavigationHistory = new Map<
    string,
    SemanticNavigationHistoryRecord
  >();
  readonly #navigationSessions = new Map<string, NavigationSessionRecord>();
  readonly #navigationTargets = new Map<string, NavigationTargetRecord>();
  readonly #highlightProfiles = new Map<string, HighlightProfileRecord>();
  readonly #navigationMetrics = new Map<string, NavigationMetricRecord>();
  readonly #windowNavigation = new Map<string, WindowNavigationRecord>();
  readonly #semanticInteractions = new Map<string, SemanticInteractionRecord>();
  readonly #interactionHistory = new Map<string, InteractionHistoryRecord>();
  readonly #interactionVerification = new Map<string, InteractionVerificationRecord>();
  readonly #fieldMappings = new Map<string, FieldMappingRecord>();
  readonly #interactionFailures = new Map<string, InteractionFailureRecord>();
  readonly #interactionProfiles = new Map<string, DesktopInteractionProfileRecord>();
  readonly #interactionMetrics = new Map<string, DesktopInteractionMetricRecord>();
  readonly #semanticActions = new Map<string, SemanticActionRecord>();
  readonly #targetResolutions = new Map<string, TargetResolutionRecord>();

  saveCapability(record: DesktopCapability) {
    this.#capabilities.set(
      `${record.ownerId}:${record.id}`,
      clone(DesktopCapabilitySchema.parse(record)),
    );
  }
  listCapabilities(ownerId: string, limit: number) {
    return ordered(
      [...this.#capabilities.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getCapability(ownerId: string, id: string) {
    const capability = this.#capabilities.get(`${ownerId}:${id}`);
    return capability ? clone(capability) : null;
  }
  saveProvider(record: CapabilityProvider) {
    this.#providers.set(
      `${record.ownerId}:${record.id}`,
      clone(CapabilityProviderSchema.parse(record)),
    );
  }
  listProviders(ownerId: string, limit: number) {
    return ordered(
      [...this.#providers.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getProvider(ownerId: string, id: string) {
    const provider = this.#providers.get(`${ownerId}:${id}`);
    return provider ? clone(provider) : null;
  }
  saveContext(record: DesktopContext) {
    this.#contexts.set(record.id, clone(DesktopContextSchema.parse(record)));
  }
  listContexts(ownerId: string, limit: number) {
    return ordered(
      [...this.#contexts.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveApplication(record: DesktopApplicationRecord) {
    this.#applications.set(
      `${record.ownerId}:${record.id}`,
      clone(DesktopApplicationRecordSchema.parse(record)),
    );
  }
  listApplications(ownerId: string, limit: number) {
    return ordered(
      [...this.#applications.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveWindowLayout(record: WindowLayoutRecord) {
    this.#layouts.set(record.id, clone(WindowLayoutRecordSchema.parse(record)));
  }
  listWindowLayouts(ownerId: string, limit: number) {
    return ordered(
      [...this.#layouts.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveClipboard(record: ClipboardHistoryRecord) {
    this.#clipboard.set(record.id, clone(ClipboardHistoryRecordSchema.parse(record)));
  }
  listClipboard(ownerId: string, limit: number) {
    return ordered(
      [...this.#clipboard.values()].filter((item) => item.ownerId === ownerId),
      "capturedAt",
      limit,
    );
  }
  saveAction(record: DesktopActionRecord) {
    this.#actions.set(record.id, clone(DesktopActionRecordSchema.parse(record)));
  }
  listActions(ownerId: string, limit: number) {
    return ordered(
      [...this.#actions.values()].filter((item) => item.ownerId === ownerId),
      "requestedAt",
      limit,
    );
  }
  saveMetric(record: CapabilityMetricRecord) {
    this.#metrics.set(record.id, clone(CapabilityMetricRecordSchema.parse(record)));
  }
  listMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#metrics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  savePreference(record: DesktopPreferenceRecord) {
    this.#preferences.set(
      `${record.ownerId}:${record.key}`,
      clone(DesktopPreferenceRecordSchema.parse(record)),
    );
  }
  listPreferences(ownerId: string, limit: number) {
    return ordered(
      [...this.#preferences.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveDesktopObject(record: DesktopObjectRecord) {
    this.#desktopObjects.set(
      `${record.ownerId}:${record.id}`,
      clone(DesktopObjectRecordSchema.parse(record)),
    );
  }
  listDesktopObjects(ownerId: string, limit: number) {
    return ordered(
      [...this.#desktopObjects.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getDesktopObject(ownerId: string, id: string) {
    const object = this.#desktopObjects.get(`${ownerId}:${id}`);
    return object ? clone(object) : null;
  }
  saveDesktopProfile(record: DesktopProfileRecord) {
    this.#desktopProfiles.set(
      `${record.ownerId}:${record.id}`,
      clone(DesktopProfileRecordSchema.parse(record)),
    );
  }
  listDesktopProfiles(ownerId: string, limit: number) {
    return ordered(
      [...this.#desktopProfiles.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveOverlaySettings(record: DesktopOverlaySettingsRecord) {
    this.#overlaySettings.set(
      `${record.ownerId}:${record.id}`,
      clone(DesktopOverlaySettingsRecordSchema.parse(record)),
    );
  }
  listOverlaySettings(ownerId: string, limit: number) {
    return ordered(
      [...this.#overlaySettings.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveDockItem(record: DockItemRecord) {
    this.#dockItems.set(
      `${record.ownerId}:${record.id}`,
      clone(DockItemRecordSchema.parse(record)),
    );
  }
  listDockItems(ownerId: string, limit: number) {
    return ordered(
      [...this.#dockItems.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveDesktopPanel(record: DesktopPanelRecord) {
    this.#desktopPanels.set(
      `${record.ownerId}:${record.id}`,
      clone(DesktopPanelRecordSchema.parse(record)),
    );
  }
  listDesktopPanels(ownerId: string, limit: number) {
    return ordered(
      [...this.#desktopPanels.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveDesktopNavigationHistory(record: DesktopNavigationHistoryRecord) {
    this.#desktopNavigationHistory.set(
      record.id,
      clone(DesktopNavigationHistoryRecordSchema.parse(record)),
    );
  }
  listDesktopNavigationHistory(ownerId: string, limit: number) {
    return ordered(
      [...this.#desktopNavigationHistory.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "navigatedAt",
      limit,
    );
  }
  saveDesktopMetric(record: DesktopMetricRecord) {
    this.#desktopMetrics.set(record.id, clone(DesktopMetricRecordSchema.parse(record)));
  }
  listDesktopMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#desktopMetrics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  saveDesktopWindow(record: DesktopWindowRecord) {
    this.#desktopWindows.set(
      `${record.ownerId}:${record.id}`,
      clone(DesktopWindowRecordSchema.parse(record)),
    );
  }
  listDesktopWindows(ownerId: string, limit: number) {
    return ordered(
      [...this.#desktopWindows.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveSemanticObject(record: SemanticDesktopObjectRecord) {
    this.#semanticObjects.set(
      `${record.ownerId}:${record.id}`,
      clone(SemanticDesktopObjectRecordSchema.parse(record)),
    );
  }
  listSemanticObjects(ownerId: string, limit: number) {
    return ordered(
      [...this.#semanticObjects.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  getSemanticObject(ownerId: string, id: string) {
    const object = this.#semanticObjects.get(`${ownerId}:${id}`);
    return object ? clone(object) : null;
  }
  saveSemanticRelationship(record: SemanticRelationshipRecord) {
    this.#semanticRelationships.set(
      record.id,
      clone(SemanticRelationshipRecordSchema.parse(record)),
    );
  }
  listSemanticRelationships(ownerId: string, limit: number) {
    return ordered(
      [...this.#semanticRelationships.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }
  saveSemanticEvent(record: DesktopSemanticEventRecord) {
    this.#semanticEvents.set(
      record.id,
      clone(DesktopSemanticEventRecordSchema.parse(record)),
    );
  }
  listSemanticEvents(ownerId: string, limit: number) {
    return ordered(
      [...this.#semanticEvents.values()].filter((item) => item.ownerId === ownerId),
      "occurredAt",
      limit,
    );
  }
  saveAccessibilitySnapshot(record: AccessibilitySnapshotRecord) {
    this.#accessibilitySnapshots.set(
      record.id,
      clone(AccessibilitySnapshotRecordSchema.parse(record)),
    );
  }
  listAccessibilitySnapshots(ownerId: string, limit: number) {
    return ordered(
      [...this.#accessibilitySnapshots.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "capturedAt",
      limit,
    );
  }
  saveSemanticDesktopContext(record: SemanticDesktopContextRecord) {
    this.#semanticDesktopContexts.set(
      record.id,
      clone(SemanticDesktopContextRecordSchema.parse(record)),
    );
  }
  listSemanticDesktopContexts(ownerId: string, limit: number) {
    return ordered(
      [...this.#semanticDesktopContexts.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }
  saveNavigationGraph(record: NavigationGraphRecord) {
    this.#navigationGraphs.set(
      record.id,
      clone(NavigationGraphRecordSchema.parse(record)),
    );
  }
  listNavigationGraphs(ownerId: string, limit: number) {
    return ordered(
      [...this.#navigationGraphs.values()].filter((item) => item.ownerId === ownerId),
      "generatedAt",
      limit,
    );
  }
  saveFocusHistory(record: FocusHistoryRecord) {
    this.#focusHistory.set(record.id, clone(FocusHistoryRecordSchema.parse(record)));
  }
  listFocusHistory(ownerId: string, limit: number) {
    return ordered(
      [...this.#focusHistory.values()].filter((item) => item.ownerId === ownerId),
      "changedAt",
      limit,
    );
  }
  saveSemanticNavigationHistory(record: SemanticNavigationHistoryRecord) {
    this.#semanticNavigationHistory.set(
      record.id,
      clone(SemanticNavigationHistoryRecordSchema.parse(record)),
    );
  }
  listSemanticNavigationHistory(ownerId: string, limit: number) {
    return ordered(
      [...this.#semanticNavigationHistory.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "occurredAt",
      limit,
    );
  }
  saveNavigationSession(record: NavigationSessionRecord) {
    this.#navigationSessions.set(
      record.id,
      clone(NavigationSessionRecordSchema.parse(record)),
    );
  }
  listNavigationSessions(ownerId: string, limit: number) {
    return ordered(
      [...this.#navigationSessions.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveNavigationTarget(record: NavigationTargetRecord) {
    this.#navigationTargets.set(
      record.id,
      clone(NavigationTargetRecordSchema.parse(record)),
    );
  }
  listNavigationTargets(ownerId: string, limit: number) {
    return ordered(
      [...this.#navigationTargets.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveHighlightProfile(record: HighlightProfileRecord) {
    this.#highlightProfiles.set(
      `${record.ownerId}:${record.id}`,
      clone(HighlightProfileRecordSchema.parse(record)),
    );
  }
  listHighlightProfiles(ownerId: string, limit: number) {
    return ordered(
      [...this.#highlightProfiles.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveNavigationMetric(record: NavigationMetricRecord) {
    this.#navigationMetrics.set(
      record.id,
      clone(NavigationMetricRecordSchema.parse(record)),
    );
  }
  listNavigationMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#navigationMetrics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  saveWindowNavigation(record: WindowNavigationRecord) {
    this.#windowNavigation.set(
      record.id,
      clone(WindowNavigationRecordSchema.parse(record)),
    );
  }
  listWindowNavigation(ownerId: string, limit: number) {
    return ordered(
      [...this.#windowNavigation.values()].filter((item) => item.ownerId === ownerId),
      "navigatedAt",
      limit,
    );
  }
  saveSemanticInteraction(record: SemanticInteractionRecord) {
    this.#semanticInteractions.set(
      record.id,
      clone(SemanticInteractionRecordSchema.parse(record)),
    );
  }
  listSemanticInteractions(ownerId: string, limit: number) {
    return ordered(
      [...this.#semanticInteractions.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "requestedAt",
      limit,
    );
  }
  saveInteractionHistory(record: InteractionHistoryRecord) {
    this.#interactionHistory.set(
      record.id,
      clone(InteractionHistoryRecordSchema.parse(record)),
    );
  }
  listInteractionHistory(ownerId: string, limit: number) {
    return ordered(
      [...this.#interactionHistory.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveInteractionVerification(record: InteractionVerificationRecord) {
    this.#interactionVerification.set(
      record.id,
      clone(InteractionVerificationRecordSchema.parse(record)),
    );
  }
  listInteractionVerification(ownerId: string, limit: number) {
    return ordered(
      [...this.#interactionVerification.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "verifiedAt",
      limit,
    );
  }
  saveFieldMapping(record: FieldMappingRecord) {
    this.#fieldMappings.set(
      `${record.ownerId}:${record.objectId}:${record.fieldKey}`,
      clone(FieldMappingRecordSchema.parse(record)),
    );
  }
  listFieldMappings(ownerId: string, limit: number) {
    return ordered(
      [...this.#fieldMappings.values()].filter((item) => item.ownerId === ownerId),
      "updatedAt",
      limit,
    );
  }
  saveInteractionFailure(record: InteractionFailureRecord) {
    this.#interactionFailures.set(
      record.id,
      clone(InteractionFailureRecordSchema.parse(record)),
    );
  }
  listInteractionFailures(ownerId: string, limit: number) {
    return ordered(
      [...this.#interactionFailures.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "createdAt",
      limit,
    );
  }
  saveInteractionProfile(record: DesktopInteractionProfileRecord) {
    this.#interactionProfiles.set(
      `${record.ownerId}:${record.id}`,
      clone(DesktopInteractionProfileRecordSchema.parse(record)),
    );
  }
  listInteractionProfiles(ownerId: string, limit: number) {
    return ordered(
      [...this.#interactionProfiles.values()].filter(
        (item) => item.ownerId === ownerId,
      ),
      "updatedAt",
      limit,
    );
  }
  saveInteractionMetric(record: DesktopInteractionMetricRecord) {
    this.#interactionMetrics.set(
      record.id,
      clone(DesktopInteractionMetricRecordSchema.parse(record)),
    );
  }
  listInteractionMetrics(ownerId: string, limit: number) {
    return ordered(
      [...this.#interactionMetrics.values()].filter((item) => item.ownerId === ownerId),
      "measuredAt",
      limit,
    );
  }
  saveSemanticAction(record: SemanticActionRecord) {
    this.#semanticActions.set(
      record.id,
      clone(SemanticActionRecordSchema.parse(record)),
    );
  }
  listSemanticActions(ownerId: string, limit: number) {
    return ordered(
      [...this.#semanticActions.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
  saveTargetResolution(record: TargetResolutionRecord) {
    this.#targetResolutions.set(
      record.id,
      clone(TargetResolutionRecordSchema.parse(record)),
    );
  }
  listTargetResolutions(ownerId: string, limit: number) {
    return ordered(
      [...this.#targetResolutions.values()].filter((item) => item.ownerId === ownerId),
      "createdAt",
      limit,
    );
  }
}
