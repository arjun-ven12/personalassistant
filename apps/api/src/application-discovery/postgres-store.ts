import {
  ApplicationInstallationRecordSchema,
  type ApplicationInstallationRecord,
  type DiscoveredApplicationSource,
} from "@alexa-control/shared";
import type { Pool } from "pg";

import type { ApplicationDiscoveryStore } from "./store.js";

export class PostgresApplicationDiscoveryStore implements ApplicationDiscoveryStore {
  constructor(readonly pool: Pool) {}

  async getInstallation(ownerId: string, deviceId: string, applicationId: string) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM application_installations
       WHERE owner_id=$1 AND device_id=$2 AND application_id=$3`,
      [ownerId, deviceId, applicationId],
    );
    return result.rows[0]
      ? ApplicationInstallationRecordSchema.parse(result.rows[0].record)
      : null;
  }

  async upsertInstallation(record: ApplicationInstallationRecord) {
    const parsed = ApplicationInstallationRecordSchema.parse(record);
    const result = await this.pool.query<{ record: unknown }>(
      `INSERT INTO application_installations(
        id, owner_id, device_id, application_id, bundle_identifier, bundle_path,
        installed, last_seen_at, unavailable_since, source, record
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (owner_id, device_id, application_id) DO UPDATE SET
        bundle_identifier=EXCLUDED.bundle_identifier,
        bundle_path=EXCLUDED.bundle_path,
        installed=EXCLUDED.installed,
        last_seen_at=EXCLUDED.last_seen_at,
        unavailable_since=EXCLUDED.unavailable_since,
        source=EXCLUDED.source,
        record=EXCLUDED.record
      RETURNING record`,
      [
        parsed.id,
        parsed.ownerId,
        parsed.deviceId,
        parsed.applicationId,
        parsed.bundleIdentifier,
        parsed.bundlePath,
        parsed.installed,
        parsed.lastSeenAt,
        parsed.unavailableSince,
        parsed.source,
        parsed,
      ],
    );
    return ApplicationInstallationRecordSchema.parse(result.rows[0]!.record);
  }

  async listInstallations(ownerId: string, deviceId?: string) {
    const result = await this.pool.query<{ record: unknown }>(
      `SELECT record FROM application_installations
       WHERE owner_id=$1 AND ($2::uuid IS NULL OR device_id=$2)
       ORDER BY record->>'displayName' ASC`,
      [ownerId, deviceId ?? null],
    );
    return result.rows.map((row) =>
      ApplicationInstallationRecordSchema.parse(row.record),
    );
  }

  async markUnavailableMissing(
    ownerId: string,
    deviceId: string,
    _source: DiscoveredApplicationSource,
    activeApplicationIds: string[],
    at: string,
  ) {
    const result = await this.pool.query(
      `UPDATE application_installations
       SET installed=false,
           last_seen_at=$4::timestamptz,
           unavailable_since=$4::timestamptz,
           record=jsonb_set(
             jsonb_set(
               jsonb_set(record, '{installed}', 'false'::jsonb),
               '{lastSeenAt}',
               to_jsonb($4::text)
             ),
             '{unavailableSince}',
             to_jsonb($4::text)
           )
       WHERE owner_id=$1
         AND device_id=$2
         AND installed=true
         AND NOT (application_id = ANY($3::text[]))`,
      [ownerId, deviceId, activeApplicationIds, at],
    );
    return result.rowCount ?? 0;
  }
}
