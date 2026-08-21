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
import type { Pool } from "pg";

import type { DesktopStore } from "./store.js";

const list = async <T>(
  pool: Pool,
  table: string,
  ownerId: string,
  order: string,
  limit: number,
  schema: { parse: (value: unknown) => T },
) => {
  const result = await pool.query<{ record: unknown }>(
    `SELECT record FROM ${table} WHERE owner_id=$1 ORDER BY ${order} DESC LIMIT $2`,
    [ownerId, limit],
  );
  return result.rows.map((row) => schema.parse(row.record));
};

const insertRecord = async (
  pool: Pool,
  table: string,
  record: { id: string; ownerId: string },
  columns: Record<string, string | number | boolean | null>,
) => {
  const names = ["id", "owner_id", ...Object.keys(columns), "record"];
  const values = [record.id, record.ownerId, ...Object.values(columns), record];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
  await pool.query(
    `INSERT INTO ${table}(${names.join(",")}) VALUES (${placeholders})
     ON CONFLICT (owner_id, id) DO UPDATE SET record=EXCLUDED.record`,
    values,
  );
};

export class PostgresDesktopStore implements DesktopStore {
  constructor(readonly pool: Pool) {}

  async saveCapability(record: DesktopCapability) {
    const parsed = DesktopCapabilitySchema.parse(record);
    await insertRecord(this.pool, "desktop_capabilities", parsed, {
      category: parsed.category,
      risk_level: parsed.riskLevel,
      status: parsed.status,
      provider_id: parsed.providerId,
      approval_required: parsed.approvalRequired,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listCapabilities(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_capabilities",
      ownerId,
      "updated_at",
      limit,
      DesktopCapabilitySchema,
    );
  }
  async getCapability(ownerId: string, id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM desktop_capabilities WHERE owner_id=$1 AND id=$2",
      [ownerId, id],
    );
    return result.rows[0] ? DesktopCapabilitySchema.parse(result.rows[0].record) : null;
  }
  async saveProvider(record: CapabilityProvider) {
    const parsed = CapabilityProviderSchema.parse(record);
    await insertRecord(this.pool, "capability_providers", parsed, {
      provider_type: parsed.providerType,
      status: parsed.status,
      last_checked_at: parsed.lastCheckedAt,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listProviders(ownerId: string, limit: number) {
    return list(
      this.pool,
      "capability_providers",
      ownerId,
      "updated_at",
      limit,
      CapabilityProviderSchema,
    );
  }
  async getProvider(ownerId: string, id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM capability_providers WHERE owner_id=$1 AND id=$2",
      [ownerId, id],
    );
    return result.rows[0]
      ? CapabilityProviderSchema.parse(result.rows[0].record)
      : null;
  }
  async saveContext(record: DesktopContext) {
    const parsed = DesktopContextSchema.parse(record);
    await insertRecord(this.pool, "desktop_context", parsed, {
      permission_state: parsed.permissionState,
      updated_at: parsed.updatedAt,
    });
  }
  listContexts(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_context",
      ownerId,
      "updated_at",
      limit,
      DesktopContextSchema,
    );
  }
  async saveApplication(record: DesktopApplicationRecord) {
    const parsed = DesktopApplicationRecordSchema.parse(record);
    await insertRecord(this.pool, "application_registry", parsed, {
      bundle_id: parsed.bundleId,
      status: parsed.status,
      pinned: parsed.pinned,
      recent: parsed.recent,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listApplications(ownerId: string, limit: number) {
    return list(
      this.pool,
      "application_registry",
      ownerId,
      "updated_at",
      limit,
      DesktopApplicationRecordSchema,
    );
  }
  async saveWindowLayout(record: WindowLayoutRecord) {
    const parsed = WindowLayoutRecordSchema.parse(record);
    await insertRecord(this.pool, "window_layouts", parsed, {
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listWindowLayouts(ownerId: string, limit: number) {
    return list(
      this.pool,
      "window_layouts",
      ownerId,
      "updated_at",
      limit,
      WindowLayoutRecordSchema,
    );
  }
  async saveClipboard(record: ClipboardHistoryRecord) {
    const parsed = ClipboardHistoryRecordSchema.parse(record);
    await insertRecord(this.pool, "clipboard_history", parsed, {
      format: parsed.format,
      sensitive: parsed.sensitive,
      captured_at: parsed.capturedAt,
    });
  }
  listClipboard(ownerId: string, limit: number) {
    return list(
      this.pool,
      "clipboard_history",
      ownerId,
      "captured_at",
      limit,
      ClipboardHistoryRecordSchema,
    );
  }
  async saveAction(record: DesktopActionRecord) {
    const parsed = DesktopActionRecordSchema.parse(record);
    await insertRecord(this.pool, "desktop_actions", parsed, {
      capability_id: parsed.capabilityId,
      provider_id: parsed.providerId,
      status: parsed.status,
      risk_level: parsed.riskLevel,
      approval_required: parsed.approvalRequired,
      requested_at: parsed.requestedAt,
      completed_at: parsed.completedAt,
    });
  }
  listActions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_actions",
      ownerId,
      "requested_at",
      limit,
      DesktopActionRecordSchema,
    );
  }
  async saveMetric(record: CapabilityMetricRecord) {
    const parsed = CapabilityMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "capability_metrics", parsed, {
      capability_id: parsed.capabilityId,
      metric_name: parsed.metricName,
      value: parsed.value,
      measured_at: parsed.measuredAt,
    });
  }
  listMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "capability_metrics",
      ownerId,
      "measured_at",
      limit,
      CapabilityMetricRecordSchema,
    );
  }
  async savePreference(record: DesktopPreferenceRecord) {
    const parsed = DesktopPreferenceRecordSchema.parse(record);
    await insertRecord(this.pool, "desktop_preferences", parsed, {
      key: parsed.key,
      updated_at: parsed.updatedAt,
    });
  }
  listPreferences(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_preferences",
      ownerId,
      "updated_at",
      limit,
      DesktopPreferenceRecordSchema,
    );
  }
  async saveDesktopObject(record: DesktopObjectRecord) {
    const parsed = DesktopObjectRecordSchema.parse(record);
    await insertRecord(this.pool, "desktop_objects", parsed, {
      object_type: parsed.objectType,
      provider_id: parsed.providerId,
      status: parsed.status,
      risk_level: parsed.riskLevel,
      current: parsed.current,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listDesktopObjects(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_objects",
      ownerId,
      "updated_at",
      limit,
      DesktopObjectRecordSchema,
    );
  }
  async getDesktopObject(ownerId: string, id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM desktop_objects WHERE owner_id=$1 AND id=$2",
      [ownerId, id],
    );
    return result.rows[0]
      ? DesktopObjectRecordSchema.parse(result.rows[0].record)
      : null;
  }
  async saveDesktopProfile(record: DesktopProfileRecord) {
    const parsed = DesktopProfileRecordSchema.parse(record);
    await insertRecord(this.pool, "desktop_profiles", parsed, {
      mode: parsed.mode,
      active: parsed.active,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listDesktopProfiles(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_profiles",
      ownerId,
      "updated_at",
      limit,
      DesktopProfileRecordSchema,
    );
  }
  async saveOverlaySettings(record: DesktopOverlaySettingsRecord) {
    const parsed = DesktopOverlaySettingsRecordSchema.parse(record);
    await insertRecord(this.pool, "desktop_overlay_settings", parsed, {
      enabled: parsed.enabled,
      monitor_id: parsed.monitorId,
      updated_at: parsed.updatedAt,
    });
  }
  listOverlaySettings(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_overlay_settings",
      ownerId,
      "updated_at",
      limit,
      DesktopOverlaySettingsRecordSchema,
    );
  }
  async saveDockItem(record: DockItemRecord) {
    const parsed = DockItemRecordSchema.parse(record);
    await insertRecord(this.pool, "dock_items", parsed, {
      item_type: parsed.itemType,
      target_id: parsed.targetId,
      position: parsed.position,
      pinned: parsed.pinned,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listDockItems(ownerId: string, limit: number) {
    return list(
      this.pool,
      "dock_items",
      ownerId,
      "updated_at",
      limit,
      DockItemRecordSchema,
    );
  }
  async saveDesktopPanel(record: DesktopPanelRecord) {
    const parsed = DesktopPanelRecordSchema.parse(record);
    await insertRecord(this.pool, "desktop_panels", parsed, {
      panel_type: parsed.panelType,
      visible: parsed.visible,
      created_at: parsed.createdAt,
      updated_at: parsed.updatedAt,
    });
  }
  listDesktopPanels(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_panels",
      ownerId,
      "updated_at",
      limit,
      DesktopPanelRecordSchema,
    );
  }
  async saveDesktopNavigationHistory(record: DesktopNavigationHistoryRecord) {
    const parsed = DesktopNavigationHistoryRecordSchema.parse(record);
    await insertRecord(this.pool, "desktop_navigation_history", parsed, {
      to_object_id: parsed.toObjectId,
      gesture: parsed.gesture,
      navigated_at: parsed.navigatedAt,
    });
  }
  listDesktopNavigationHistory(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_navigation_history",
      ownerId,
      "navigated_at",
      limit,
      DesktopNavigationHistoryRecordSchema,
    );
  }
  async saveDesktopMetric(record: DesktopMetricRecord) {
    const parsed = DesktopMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "desktop_metrics", parsed, {
      metric_name: parsed.metricName,
      value: parsed.value,
      measured_at: parsed.measuredAt,
    });
  }
  listDesktopMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_metrics",
      ownerId,
      "measured_at",
      limit,
      DesktopMetricRecordSchema,
    );
  }
  async saveDesktopWindow(record: DesktopWindowRecord) {
    const parsed = DesktopWindowRecordSchema.parse(record);
    await insertRecord(this.pool, "desktop_windows", parsed, {
      application_id: parsed.applicationId,
      role: parsed.role,
      focused: parsed.focused,
      visible: parsed.visible,
      modal: parsed.modal,
      updated_at: parsed.updatedAt,
    });
  }
  listDesktopWindows(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_windows",
      ownerId,
      "updated_at",
      limit,
      DesktopWindowRecordSchema,
    );
  }
  async saveSemanticObject(record: SemanticDesktopObjectRecord) {
    const parsed = SemanticDesktopObjectRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_objects", parsed, {
      application_id: parsed.applicationId,
      window_id: parsed.windowId,
      parent_id: parsed.parentId,
      role: parsed.role,
      display_name: parsed.displayName,
      visibility: parsed.visibility,
      source: parsed.source,
      updated_at: parsed.updatedAt,
    });
  }
  listSemanticObjects(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_objects",
      ownerId,
      "updated_at",
      limit,
      SemanticDesktopObjectRecordSchema,
    );
  }
  async getSemanticObject(ownerId: string, id: string) {
    const result = await this.pool.query<{ record: unknown }>(
      "SELECT record FROM semantic_objects WHERE owner_id=$1 AND id=$2",
      [ownerId, id],
    );
    return result.rows[0]
      ? SemanticDesktopObjectRecordSchema.parse(result.rows[0].record)
      : null;
  }
  async saveSemanticRelationship(record: SemanticRelationshipRecord) {
    const parsed = SemanticRelationshipRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_relationships", parsed, {
      from_object_id: parsed.fromObjectId,
      to_object_id: parsed.toObjectId,
      relationship: parsed.relationship,
      updated_at: parsed.updatedAt,
    });
  }
  listSemanticRelationships(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_relationships",
      ownerId,
      "updated_at",
      limit,
      SemanticRelationshipRecordSchema,
    );
  }
  async saveSemanticEvent(record: DesktopSemanticEventRecord) {
    const parsed = DesktopSemanticEventRecordSchema.parse(record);
    await insertRecord(this.pool, "desktop_events", parsed, {
      event_type: parsed.eventType,
      application_id: parsed.applicationId,
      window_id: parsed.windowId,
      object_id: parsed.objectId,
      occurred_at: parsed.occurredAt,
    });
  }
  listSemanticEvents(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_events",
      ownerId,
      "occurred_at",
      limit,
      DesktopSemanticEventRecordSchema,
    );
  }
  async saveAccessibilitySnapshot(record: AccessibilitySnapshotRecord) {
    const parsed = AccessibilitySnapshotRecordSchema.parse(record);
    await insertRecord(this.pool, "accessibility_snapshots", parsed, {
      provider_id: parsed.providerId,
      application_id: parsed.applicationId,
      status: parsed.status,
      captured_at: parsed.capturedAt,
    });
  }
  listAccessibilitySnapshots(ownerId: string, limit: number) {
    return list(
      this.pool,
      "accessibility_snapshots",
      ownerId,
      "captured_at",
      limit,
      AccessibilitySnapshotRecordSchema,
    );
  }
  async saveSemanticDesktopContext(record: SemanticDesktopContextRecord) {
    const parsed = SemanticDesktopContextRecordSchema.parse(record);
    await insertRecord(this.pool, "desktop_semantic_context", parsed, {
      current_application_id: parsed.currentApplicationId,
      current_window_id: parsed.currentWindowId,
      focused_object_id: parsed.focusedObjectId,
      updated_at: parsed.updatedAt,
    });
  }
  listSemanticDesktopContexts(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_semantic_context",
      ownerId,
      "updated_at",
      limit,
      SemanticDesktopContextRecordSchema,
    );
  }
  async saveNavigationGraph(record: NavigationGraphRecord) {
    const parsed = NavigationGraphRecordSchema.parse(record);
    await insertRecord(this.pool, "navigation_graph", parsed, {
      graph_version: parsed.graphVersion,
      node_count: parsed.nodeCount,
      edge_count: parsed.edgeCount,
      generated_at: parsed.generatedAt,
      deterministic: parsed.deterministic,
    });
  }
  listNavigationGraphs(ownerId: string, limit: number) {
    return list(
      this.pool,
      "navigation_graph",
      ownerId,
      "generated_at",
      limit,
      NavigationGraphRecordSchema,
    );
  }
  async saveFocusHistory(record: FocusHistoryRecord) {
    const parsed = FocusHistoryRecordSchema.parse(record);
    await insertRecord(this.pool, "focus_history", parsed, {
      object_id: parsed.objectId,
      previous_object_id: parsed.previousObjectId,
      focus_reason: parsed.focusReason,
      changed_at: parsed.changedAt,
    });
  }
  listFocusHistory(ownerId: string, limit: number) {
    return list(
      this.pool,
      "focus_history",
      ownerId,
      "changed_at",
      limit,
      FocusHistoryRecordSchema,
    );
  }
  async saveSemanticNavigationHistory(record: SemanticNavigationHistoryRecord) {
    const parsed = SemanticNavigationHistoryRecordSchema.parse(record);
    await insertRecord(this.pool, "navigation_history", parsed, {
      action: parsed.action,
      from_object_id: parsed.fromObjectId,
      to_object_id: parsed.toObjectId,
      status: parsed.status,
      occurred_at: parsed.occurredAt,
      read_only: parsed.readOnly,
      activated_control: parsed.activatedControl,
      typed_text: parsed.typedText,
      clicked_button: parsed.clickedButton,
    });
  }
  listSemanticNavigationHistory(ownerId: string, limit: number) {
    return list(
      this.pool,
      "navigation_history",
      ownerId,
      "occurred_at",
      limit,
      SemanticNavigationHistoryRecordSchema,
    );
  }
  async saveNavigationSession(record: NavigationSessionRecord) {
    const parsed = NavigationSessionRecordSchema.parse(record);
    await insertRecord(this.pool, "navigation_sessions", parsed, {
      status: parsed.status,
      current_object_id: parsed.currentObjectId,
      started_at: parsed.startedAt,
      updated_at: parsed.updatedAt,
    });
  }
  listNavigationSessions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "navigation_sessions",
      ownerId,
      "updated_at",
      limit,
      NavigationSessionRecordSchema,
    );
  }
  async saveNavigationTarget(record: NavigationTargetRecord) {
    const parsed = NavigationTargetRecordSchema.parse(record);
    await insertRecord(this.pool, "navigation_targets", parsed, {
      object_id: parsed.objectId,
      label: parsed.label,
      role: parsed.role,
      priority: parsed.priority,
      visible: parsed.visible,
      updated_at: parsed.updatedAt,
    });
  }
  listNavigationTargets(ownerId: string, limit: number) {
    return list(
      this.pool,
      "navigation_targets",
      ownerId,
      "updated_at",
      limit,
      NavigationTargetRecordSchema,
    );
  }
  async saveHighlightProfile(record: HighlightProfileRecord) {
    const parsed = HighlightProfileRecordSchema.parse(record);
    await insertRecord(this.pool, "highlight_profiles", parsed, {
      name: parsed.name,
      updated_at: parsed.updatedAt,
    });
  }
  listHighlightProfiles(ownerId: string, limit: number) {
    return list(
      this.pool,
      "highlight_profiles",
      ownerId,
      "updated_at",
      limit,
      HighlightProfileRecordSchema,
    );
  }
  async saveNavigationMetric(record: NavigationMetricRecord) {
    const parsed = NavigationMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "navigation_metrics", parsed, {
      metric_name: parsed.metricName,
      value: parsed.value,
      measured_at: parsed.measuredAt,
    });
  }
  listNavigationMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "navigation_metrics",
      ownerId,
      "measured_at",
      limit,
      NavigationMetricRecordSchema,
    );
  }
  async saveWindowNavigation(record: WindowNavigationRecord) {
    const parsed = WindowNavigationRecordSchema.parse(record);
    await insertRecord(this.pool, "window_navigation", parsed, {
      window_id: parsed.windowId,
      application_id: parsed.applicationId,
      focused_object_id: parsed.focusedObjectId,
      navigated_at: parsed.navigatedAt,
    });
  }
  listWindowNavigation(ownerId: string, limit: number) {
    return list(
      this.pool,
      "window_navigation",
      ownerId,
      "navigated_at",
      limit,
      WindowNavigationRecordSchema,
    );
  }
  async saveSemanticInteraction(record: SemanticInteractionRecord) {
    const parsed = SemanticInteractionRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_interactions", parsed, {
      origin: parsed.origin,
      requested_action: parsed.requestedAction,
      target_object_id: parsed.targetObjectId,
      status: parsed.status,
      requested_at: parsed.requestedAt,
      completed_at: parsed.completedAt,
    });
  }
  listSemanticInteractions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_interactions",
      ownerId,
      "requested_at",
      limit,
      SemanticInteractionRecordSchema,
    );
  }
  async saveInteractionHistory(record: InteractionHistoryRecord) {
    const parsed = InteractionHistoryRecordSchema.parse(record);
    await insertRecord(this.pool, "interaction_history", parsed, {
      interaction_id: parsed.interactionId,
      action: parsed.action,
      target_object_id: parsed.targetObjectId,
      origin: parsed.origin,
      result: parsed.result,
      created_at: parsed.createdAt,
    });
  }
  listInteractionHistory(ownerId: string, limit: number) {
    return list(
      this.pool,
      "interaction_history",
      ownerId,
      "created_at",
      limit,
      InteractionHistoryRecordSchema,
    );
  }
  async saveInteractionVerification(record: InteractionVerificationRecord) {
    const parsed = InteractionVerificationRecordSchema.parse(record);
    await insertRecord(this.pool, "interaction_verification", parsed, {
      interaction_id: parsed.interactionId,
      target_object_id: parsed.targetObjectId,
      verification_type: parsed.verificationType,
      status: parsed.status,
      verified_at: parsed.verifiedAt,
    });
  }
  listInteractionVerification(ownerId: string, limit: number) {
    return list(
      this.pool,
      "interaction_verification",
      ownerId,
      "verified_at",
      limit,
      InteractionVerificationRecordSchema,
    );
  }
  async saveFieldMapping(record: FieldMappingRecord) {
    const parsed = FieldMappingRecordSchema.parse(record);
    await insertRecord(this.pool, "field_mappings", parsed, {
      object_id: parsed.objectId,
      field_key: parsed.fieldKey,
      field_type: parsed.fieldType,
      updated_at: parsed.updatedAt,
    });
  }
  listFieldMappings(ownerId: string, limit: number) {
    return list(
      this.pool,
      "field_mappings",
      ownerId,
      "updated_at",
      limit,
      FieldMappingRecordSchema,
    );
  }
  async saveInteractionFailure(record: InteractionFailureRecord) {
    const parsed = InteractionFailureRecordSchema.parse(record);
    await insertRecord(this.pool, "interaction_failures", parsed, {
      interaction_id: parsed.interactionId,
      target_object_id: parsed.targetObjectId,
      failure_code: parsed.failureCode,
      retry_safe: parsed.retrySafe,
      created_at: parsed.createdAt,
    });
  }
  listInteractionFailures(ownerId: string, limit: number) {
    return list(
      this.pool,
      "interaction_failures",
      ownerId,
      "created_at",
      limit,
      InteractionFailureRecordSchema,
    );
  }
  async saveInteractionProfile(record: DesktopInteractionProfileRecord) {
    const parsed = DesktopInteractionProfileRecordSchema.parse(record);
    await insertRecord(this.pool, "desktop_interaction_profiles", parsed, {
      name: parsed.name,
      updated_at: parsed.updatedAt,
    });
  }
  listInteractionProfiles(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_interaction_profiles",
      ownerId,
      "updated_at",
      limit,
      DesktopInteractionProfileRecordSchema,
    );
  }
  async saveInteractionMetric(record: DesktopInteractionMetricRecord) {
    const parsed = DesktopInteractionMetricRecordSchema.parse(record);
    await insertRecord(this.pool, "desktop_interaction_metrics", parsed, {
      metric_name: parsed.metricName,
      value: parsed.value,
      measured_at: parsed.measuredAt,
    });
  }
  listInteractionMetrics(ownerId: string, limit: number) {
    return list(
      this.pool,
      "desktop_interaction_metrics",
      ownerId,
      "measured_at",
      limit,
      DesktopInteractionMetricRecordSchema,
    );
  }
  async saveSemanticAction(record: SemanticActionRecord) {
    const parsed = SemanticActionRecordSchema.parse(record);
    await insertRecord(this.pool, "semantic_actions", parsed, {
      interaction_id: parsed.interactionId,
      sequence: parsed.sequence,
      action: parsed.action,
      target_object_id: parsed.targetObjectId,
      status: parsed.status,
      created_at: parsed.createdAt,
    });
  }
  listSemanticActions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "semantic_actions",
      ownerId,
      "created_at",
      limit,
      SemanticActionRecordSchema,
    );
  }
  async saveTargetResolution(record: TargetResolutionRecord) {
    const parsed = TargetResolutionRecordSchema.parse(record);
    await insertRecord(this.pool, "target_resolution", parsed, {
      query: parsed.query,
      object_id: parsed.objectId,
      resolved_object_id: parsed.resolvedObjectId,
      status: parsed.status,
      confidence: parsed.confidence,
      created_at: parsed.createdAt,
    });
  }
  listTargetResolutions(ownerId: string, limit: number) {
    return list(
      this.pool,
      "target_resolution",
      ownerId,
      "created_at",
      limit,
      TargetResolutionRecordSchema,
    );
  }
}
