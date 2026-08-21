import {
  ApplicationInstallationRecordSchema,
  type ApplicationInstallationRecord,
  type DiscoveredApplicationSource,
} from "@alexa-control/shared";

import type { Awaitable } from "../identity/store.js";

export interface ApplicationDiscoveryStore {
  getInstallation(
    ownerId: string,
    deviceId: string,
    applicationId: string,
  ): Awaitable<ApplicationInstallationRecord | null>;
  upsertInstallation(
    record: ApplicationInstallationRecord,
  ): Awaitable<ApplicationInstallationRecord>;
  listInstallations(
    ownerId: string,
    deviceId?: string,
  ): Awaitable<ApplicationInstallationRecord[]>;
  markUnavailableMissing(
    ownerId: string,
    deviceId: string,
    source: DiscoveredApplicationSource,
    activeApplicationIds: string[],
    at: string,
  ): Awaitable<number>;
}

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryApplicationDiscoveryStore implements ApplicationDiscoveryStore {
  readonly #installations = new Map<string, ApplicationInstallationRecord>();

  getInstallation(ownerId: string, deviceId: string, applicationId: string) {
    return clone(
      this.#installations.get(`${ownerId}:${deviceId}:${applicationId}`) ?? null,
    );
  }

  upsertInstallation(record: ApplicationInstallationRecord) {
    const parsed = ApplicationInstallationRecordSchema.parse(record);
    this.#installations.set(
      `${parsed.ownerId}:${parsed.deviceId}:${parsed.applicationId}`,
      clone(parsed),
    );
    return clone(parsed);
  }

  listInstallations(ownerId: string, deviceId?: string) {
    return [...this.#installations.values()]
      .filter(
        (record) =>
          record.ownerId === ownerId && (!deviceId || record.deviceId === deviceId),
      )
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .map(clone);
  }

  markUnavailableMissing(
    ownerId: string,
    deviceId: string,
    _source: DiscoveredApplicationSource,
    activeApplicationIds: string[],
    at: string,
  ) {
    const active = new Set(activeApplicationIds);
    let changed = 0;
    for (const [key, record] of this.#installations) {
      if (
        record.ownerId !== ownerId ||
        record.deviceId !== deviceId ||
        !record.installed ||
        active.has(record.applicationId)
      ) {
        continue;
      }
      this.#installations.set(key, {
        ...record,
        installed: false,
        unavailableSince: at,
        lastSeenAt: at,
      });
      changed += 1;
    }
    return changed;
  }
}
