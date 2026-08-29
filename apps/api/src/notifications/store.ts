import type {
  ExecutiveNotificationCategory,
  NotificationPreferenceValues,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { Awaitable } from "../identity/store.js";

export interface PushSubscription {
  ownerId: string;
  deviceId: string;
  token: string;
  platform: "ANDROID";
  appVersion: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface NotificationPreferences {
  ownerId: string;
  values: NotificationPreferenceValues;
  updatedAt: string;
}

export interface NotificationDelivery {
  id: string;
  ownerId: string;
  deviceId: string;
  eventId: string;
  category: ExecutiveNotificationCategory;
  dedupeKey: string;
  outcome:
    | "ACCEPTED"
    | "REJECTED"
    | "DEDUPLICATED"
    | "RATE_LIMITED"
    | "PREFERENCE_SUPPRESSED";
  providerMessageId: string | null;
  reasonCode: string;
  createdAt: string;
}

export interface NotificationStore {
  upsertSubscription(subscription: PushSubscription): Awaitable<void>;
  findSubscription(deviceId: string): Awaitable<PushSubscription | undefined>;
  listSubscriptions(ownerId: string): Awaitable<PushSubscription[]>;
  disableSubscription(deviceId: string, updatedAt: string): Awaitable<void>;
  getPreferences(ownerId: string): Awaitable<NotificationPreferences | undefined>;
  savePreferences(preferences: NotificationPreferences): Awaitable<void>;
  saveDelivery(delivery: NotificationDelivery): Awaitable<void>;
  findRecentDelivery(
    ownerId: string,
    deviceId: string,
    dedupeKey: string,
    since: string,
  ): Awaitable<NotificationDelivery | undefined>;
  countRecentDeliveries(ownerId: string, deviceId: string, since: string): Awaitable<number>;
}

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryNotificationStore implements NotificationStore {
  readonly #subscriptions = new Map<string, PushSubscription>();
  readonly #preferences = new Map<string, NotificationPreferences>();
  readonly #deliveries: NotificationDelivery[] = [];

  upsertSubscription(subscription: PushSubscription) {
    this.#subscriptions.set(subscription.deviceId, clone(subscription));
  }

  findSubscription(deviceId: string) {
    const value = this.#subscriptions.get(deviceId);
    return value ? clone(value) : undefined;
  }

  listSubscriptions(ownerId: string) {
    return [...this.#subscriptions.values()]
      .filter((item) => item.ownerId === ownerId)
      .map(clone);
  }

  disableSubscription(deviceId: string, updatedAt: string) {
    const current = this.#subscriptions.get(deviceId);
    if (current) {
      this.#subscriptions.set(deviceId, {
        ...current,
        enabled: false,
        token: "",
        updatedAt,
        lastSeenAt: updatedAt,
      });
    }
  }

  getPreferences(ownerId: string) {
    const value = this.#preferences.get(ownerId);
    return value ? clone(value) : undefined;
  }

  savePreferences(preferences: NotificationPreferences) {
    this.#preferences.set(preferences.ownerId, clone(preferences));
  }

  saveDelivery(delivery: NotificationDelivery) {
    this.#deliveries.push(clone(delivery));
  }

  findRecentDelivery(ownerId: string, deviceId: string, dedupeKey: string, since: string) {
    return clone(
      [...this.#deliveries]
        .reverse()
        .find(
          (item) =>
            item.ownerId === ownerId &&
            item.deviceId === deviceId &&
            item.dedupeKey === dedupeKey &&
            item.createdAt >= since,
        ),
    );
  }

  countRecentDeliveries(ownerId: string, deviceId: string, since: string) {
    return this.#deliveries.filter(
      (item) =>
        item.ownerId === ownerId &&
        item.deviceId === deviceId &&
        item.createdAt >= since &&
        item.outcome === "ACCEPTED",
    ).length;
  }
}

export class PostgresNotificationStore implements NotificationStore {
  constructor(readonly pool: Pool) {}

  async upsertSubscription(subscription: PushSubscription) {
    await this.pool.query(
      `INSERT INTO notification_subscriptions(device_id, owner_id, record, updated_at)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(device_id) DO UPDATE SET owner_id=EXCLUDED.owner_id,
       record=EXCLUDED.record, updated_at=EXCLUDED.updated_at`,
      [subscription.deviceId, subscription.ownerId, subscription, subscription.updatedAt],
    );
  }

  async findSubscription(deviceId: string) {
    const result = await this.pool.query<{ record: PushSubscription }>(
      "SELECT record FROM notification_subscriptions WHERE device_id=$1",
      [deviceId],
    );
    return result.rows[0]?.record;
  }

  async listSubscriptions(ownerId: string) {
    const result = await this.pool.query<{ record: PushSubscription }>(
      "SELECT record FROM notification_subscriptions WHERE owner_id=$1 ORDER BY updated_at DESC",
      [ownerId],
    );
    return result.rows.map((row) => row.record);
  }

  async disableSubscription(deviceId: string, updatedAt: string) {
    const current = await this.findSubscription(deviceId);
    if (!current) return;
    await this.upsertSubscription({
      ...current,
      enabled: false,
      token: "",
      updatedAt,
      lastSeenAt: updatedAt,
    });
  }

  async getPreferences(ownerId: string) {
    const result = await this.pool.query<{ record: NotificationPreferences }>(
      "SELECT record FROM notification_preferences WHERE owner_id=$1",
      [ownerId],
    );
    return result.rows[0]?.record;
  }

  async savePreferences(preferences: NotificationPreferences) {
    await this.pool.query(
      `INSERT INTO notification_preferences(owner_id, record, updated_at)
       VALUES($1,$2,$3)
       ON CONFLICT(owner_id) DO UPDATE SET record=EXCLUDED.record,
       updated_at=EXCLUDED.updated_at`,
      [preferences.ownerId, preferences, preferences.updatedAt],
    );
  }

  async saveDelivery(delivery: NotificationDelivery) {
    await this.pool.query(
      `INSERT INTO notification_deliveries
       (id,owner_id,device_id,event_id,category,dedupe_key,outcome,record,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        delivery.id,
        delivery.ownerId,
        delivery.deviceId,
        delivery.eventId,
        delivery.category,
        delivery.dedupeKey,
        delivery.outcome,
        delivery,
        delivery.createdAt,
      ],
    );
  }

  async findRecentDelivery(ownerId: string, deviceId: string, dedupeKey: string, since: string) {
    const result = await this.pool.query<{ record: NotificationDelivery }>(
      `SELECT record FROM notification_deliveries
       WHERE owner_id=$1 AND device_id=$2 AND dedupe_key=$3 AND created_at >= $4
       ORDER BY created_at DESC LIMIT 1`,
      [ownerId, deviceId, dedupeKey, since],
    );
    return result.rows[0]?.record;
  }

  async countRecentDeliveries(ownerId: string, deviceId: string, since: string) {
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM notification_deliveries
       WHERE owner_id=$1 AND device_id=$2 AND created_at >= $3 AND outcome='ACCEPTED'`,
      [ownerId, deviceId, since],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}
