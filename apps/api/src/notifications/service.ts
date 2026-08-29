import {
  ExecutivePushPayloadSchema,
  NotificationPreferencesResponseSchema,
  type ExecutiveNotificationCategory,
  type ExecutiveNotificationSeverity,
  type ExecutivePushPayload,
  type NotificationPreferenceValues,
} from "@alexa-control/shared";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { IdentityStore } from "../identity/store.js";
import { ApiSecurityError } from "../identity/errors.js";
import type { PushProvider } from "./provider.js";
import type {
  NotificationDelivery,
  NotificationStore,
  PushSubscription,
} from "./store.js";

const DEFAULT_PREFERENCES: NotificationPreferenceValues = {
  approvals: true,
  objectiveRisk: true,
  workflowFailures: true,
  budgetAlerts: true,
  securityAlerts: true,
  experimentResults: true,
  deviceEvents: true,
};

const preferenceFor = (
  category: ExecutiveNotificationCategory,
): keyof NotificationPreferenceValues => {
  if (category === "APPROVAL_REQUIRED") return "approvals";
  if (category === "OBJECTIVE_AT_RISK" || category === "OBJECTIVE_BLOCKED")
    return "objectiveRisk";
  if (category === "WORKFLOW_FAILED" || category === "WORKFLOW_BLOCKED")
    return "workflowFailures";
  if (category === "BUDGET_WARNING" || category === "BUDGET_APPROVAL")
    return "budgetAlerts";
  if (category === "SECURITY_EVENT") return "securityAlerts";
  if (category === "EXPERIMENT_COMPLETED") return "experimentResults";
  return "deviceEvents";
};

export interface ExecutiveNotificationEvent {
  ownerId: string;
  eventId: string;
  category: ExecutiveNotificationCategory;
  severity: ExecutiveNotificationSeverity;
  objectKind: ExecutivePushPayload["objectKind"];
  objectId: string;
  stateVersion: string;
  title: string;
}

export class ExecutiveNotificationService {
  constructor(
    readonly store: NotificationStore,
    readonly identities: IdentityStore,
    readonly provider: PushProvider,
    readonly audit: GovernanceAuditWriter,
    readonly now: () => Date = () => new Date(),
    readonly dedupeWindowMs = 60 * 60_000,
    readonly hourlyDeviceLimit = 30,
  ) {}

  async register(input: {
    ownerId: string;
    deviceId: string;
    token: string;
    appVersion: string;
    requestId: string;
    ipAddress: string;
  }) {
    const device = await this.identities.findDeviceById(input.deviceId);
    if (
      !device ||
      device.ownerId !== input.ownerId ||
      device.deviceType !== "ANDROID" ||
      device.trustStatus !== "TRUSTED"
    ) {
      throw new ApiSecurityError(
        403,
        "TRUSTED_ANDROID_DEVICE_REQUIRED",
        "A trusted Android device is required.",
      );
    }
    const at = this.now().toISOString();
    const existing = await this.store.findSubscription(input.deviceId);
    const subscription: PushSubscription = {
      ownerId: input.ownerId,
      deviceId: input.deviceId,
      token: input.token,
      platform: "ANDROID",
      appVersion: input.appVersion,
      enabled: true,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
      lastSeenAt: at,
    };
    await this.store.upsertSubscription(subscription);
    await this.audit({
      eventType: "DEVICE_PUSH_TOKEN_REGISTERED",
      ownerId: input.ownerId,
      deviceId: input.deviceId,
      outcome: "SUCCESS",
      reason: existing ? "Android push token rotated." : "Android push token registered.",
      metadata: { platform: "ANDROID", appVersion: input.appVersion },
      requestId: input.requestId,
      ipAddress: input.ipAddress,
    });
    return { registered: true, deviceId: input.deviceId, enabled: true, updatedAt: at };
  }

  async unregister(input: {
    ownerId: string;
    deviceId: string;
    requestId: string;
    ipAddress: string;
  }) {
    const current = await this.store.findSubscription(input.deviceId);
    if (current && current.ownerId !== input.ownerId) {
      throw new ApiSecurityError(404, "PUSH_SUBSCRIPTION_NOT_FOUND", "Push subscription was not found.");
    }
    const at = this.now().toISOString();
    await this.store.disableSubscription(input.deviceId, at);
    await this.audit({
      eventType: "DEVICE_PUSH_TOKEN_REMOVED",
      ownerId: input.ownerId,
      deviceId: input.deviceId,
      outcome: "SUCCESS",
      reason: "Android push token association removed.",
      requestId: input.requestId,
      ipAddress: input.ipAddress,
    });
    return { registered: false, deviceId: input.deviceId, enabled: false, updatedAt: at };
  }

  async preferences(ownerId: string) {
    const stored = await this.store.getPreferences(ownerId);
    return NotificationPreferencesResponseSchema.parse({
      preferences: stored?.values ?? DEFAULT_PREFERENCES,
      securityAlertsMandatory: true,
      updatedAt: stored?.updatedAt ?? this.now().toISOString(),
    });
  }

  async updatePreferences(input: {
    ownerId: string;
    deviceId: string;
    patch: { [K in keyof NotificationPreferenceValues]?: NotificationPreferenceValues[K] | undefined };
    requestId: string;
    ipAddress: string;
  }) {
    const current = await this.preferences(input.ownerId);
    const updatedAt = this.now().toISOString();
    const values: NotificationPreferenceValues = { ...current.preferences };
    for (const [key, value] of Object.entries(input.patch)) {
      if (typeof value === "boolean" && key !== "securityAlerts") {
        values[key as Exclude<keyof NotificationPreferenceValues, "securityAlerts">] = value;
      }
    }
    values.securityAlerts = true;
    await this.store.savePreferences({ ownerId: input.ownerId, values, updatedAt });
    await this.audit({
      eventType: "NOTIFICATION_PREFERENCE_UPDATED",
      ownerId: input.ownerId,
      deviceId: input.deviceId,
      outcome: "SUCCESS",
      reason: "Owner updated bounded executive notification preferences.",
      metadata: { securityAlertsMandatory: true },
      requestId: input.requestId,
      ipAddress: input.ipAddress,
    });
    return NotificationPreferencesResponseSchema.parse({
      preferences: values,
      securityAlertsMandatory: true,
      updatedAt,
    });
  }

  async dispatch(input: ExecutiveNotificationEvent) {
    const preferences = await this.preferences(input.ownerId);
    const subscriptions = await this.store.listSubscriptions(input.ownerId);
    await Promise.all(
      subscriptions.filter((item) => item.enabled).map(async (subscription) => {
        const device = await this.identities.findDeviceById(subscription.deviceId);
        if (!device || device.trustStatus !== "TRUSTED" || device.ownerId !== input.ownerId) {
          await this.store.disableSubscription(subscription.deviceId, this.now().toISOString());
          return;
        }
        const dedupeKey = `${input.category}:${input.objectKind}:${input.objectId}:${input.stateVersion}`;
        const since = new Date(this.now().getTime() - this.dedupeWindowMs).toISOString();
        if (
          await this.store.findRecentDelivery(
            input.ownerId,
            subscription.deviceId,
            dedupeKey,
            since,
          )
        ) {
          await this.record(input, subscription.deviceId, dedupeKey, "DEDUPLICATED", "DUPLICATE_STATE", null);
          return;
        }
        if (!preferences.preferences[preferenceFor(input.category)]) {
          await this.record(input, subscription.deviceId, dedupeKey, "PREFERENCE_SUPPRESSED", "OWNER_PREFERENCE", null);
          return;
        }
        const oneHourAgo = new Date(this.now().getTime() - 60 * 60_000).toISOString();
        if (
          input.severity !== "CRITICAL" &&
          (await this.store.countRecentDeliveries(input.ownerId, subscription.deviceId, oneHourAgo)) >=
            this.hourlyDeviceLimit
        ) {
          await this.record(input, subscription.deviceId, dedupeKey, "RATE_LIMITED", "DEVICE_HOURLY_LIMIT", null);
          return;
        }
        const payload = ExecutivePushPayloadSchema.parse({
          type: input.category,
          objectKind: input.objectKind,
          objectId: input.objectId,
          eventId: input.eventId,
          severity: input.severity,
          title: input.title,
        });
        await Promise.resolve(this.audit({
          eventType: "PUSH_NOTIFICATION_ATTEMPTED",
          ownerId: input.ownerId,
          deviceId: subscription.deviceId,
          outcome: "SUCCESS",
          reason: "Executive push submitted to the configured provider.",
          metadata: { category: input.category, eventId: input.eventId },
          requestId: `push-attempt:${input.eventId}:${subscription.deviceId}`,
          ipAddress: "internal",
        })).catch(() => undefined);
        const result = await this.provider.send(subscription.token, payload);
        await this.record(
          input,
          subscription.deviceId,
          dedupeKey,
          result.accepted ? "ACCEPTED" : "REJECTED",
          result.reasonCode,
          result.messageId,
        );
        if (result.invalidateToken) {
          await this.store.disableSubscription(subscription.deviceId, this.now().toISOString());
        }
      }),
    );
  }

  private async record(
    input: ExecutiveNotificationEvent,
    deviceId: string,
    dedupeKey: string,
    outcome: NotificationDelivery["outcome"],
    reasonCode: string,
    providerMessageId: string | null,
  ) {
    const delivery: NotificationDelivery = {
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      deviceId,
      eventId: input.eventId,
      category: input.category,
      dedupeKey,
      outcome,
      providerMessageId,
      reasonCode,
      createdAt: this.now().toISOString(),
    };
    await this.store.saveDelivery(delivery);
    const eventType =
      outcome === "ACCEPTED"
        ? "PUSH_NOTIFICATION_ACCEPTED"
        : outcome === "DEDUPLICATED"
          ? "PUSH_NOTIFICATION_DEDUPLICATED"
          : outcome === "RATE_LIMITED"
            ? "PUSH_NOTIFICATION_RATE_LIMITED"
            : outcome === "PREFERENCE_SUPPRESSED"
              ? "PUSH_NOTIFICATION_SUPPRESSED"
              : "PUSH_NOTIFICATION_REJECTED";
    await this.audit({
      eventType,
      ownerId: input.ownerId,
      deviceId,
      outcome: outcome === "ACCEPTED" ? "SUCCESS" : "DENIED",
      reason: reasonCode,
      metadata: { category: input.category, eventId: input.eventId },
      requestId: `push:${delivery.id}`,
      ipAddress: "internal",
    });
  }
}
