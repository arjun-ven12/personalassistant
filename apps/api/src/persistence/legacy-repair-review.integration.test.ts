import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createIsolatedTestDatabase, safeTestDatabaseUrl } from "./test-database.js";
import { CANONICAL_REPAIR, LEGACY_REPAIR } from "./legacy-repair-review.js";

const connection = safeTestDatabaseUrl();
describe.skipIf(!connection)(
  "operator-reviewed historical cross-device diagnostic label",
  () => {
    let isolated: Awaited<ReturnType<typeof createIsolatedTestDatabase>>;
    let manifest: {
      acknowledgement: "OWNER_REVIEWED_HISTORICAL_SQL_AND_RECOVERY";
      migrations: { version: string; digest: string }[];
      legacyRepairReview: {
        acknowledgement: "OWNER_REVIEWED_LEGACY_REPAIR_SCHEMA_AND_RECOVERY";
        originalSqlStatus: "UNAVAILABLE_NOT_CONTENT_VERIFIED";
        recoveryBranchId: string;
      };
    };
    beforeAll(async () => {
      isolated = await createIsolatedTestDatabase(connection!, "legacyrepair");
      const files = await isolated.database.migrationFiles();
      manifest = {
        acknowledgement: "OWNER_REVIEWED_HISTORICAL_SQL_AND_RECOVERY",
        migrations: await Promise.all(
          files.map(async (file) => ({
            version: file.version,
            digest: createHash("sha256")
              .update(await readFile(file.path))
              .digest("hex"),
          })),
        ),
        legacyRepairReview: {
          acknowledgement: "OWNER_REVIEWED_LEGACY_REPAIR_SCHEMA_AND_RECOVERY",
          originalSqlStatus: "UNAVAILABLE_NOT_CONTENT_VERIFIED",
          recoveryBranchId: "br-synthetic-recovery-fixture",
        },
      };
      await isolated.database.pool.query(
        "INSERT INTO schema_migrations(version,applied_at) VALUES($1,'2026-09-02T07:57:49.216852Z')",
        [LEGACY_REPAIR],
      );
      await isolated.database.pool.query(
        "UPDATE schema_migrations SET applied_at='2026-09-02T08:03:35.010588Z' WHERE version=$1",
        [CANONICAL_REPAIR],
      );
    }, 120000);
    afterAll(async () => {
      await isolated?.cleanup();
    });

    it("unreviewed diagnostic label denies even with matching canonical tables", async () => {
      expect((await isolated.database.status()).issues).toContain(
        "UNEXPECTED_APPLIED_VERSION",
      );
      await expect(isolated.database.migrate()).rejects.toThrow(
        "LEGACY_REPAIR_OPERATOR_REVIEW_REQUIRED",
      );
    });

    it("records explicit uncertainty, preserves historical row/timestamp and never assigns a fake digest", async () => {
      await isolated.database.recordReviewedHistory(manifest);
      await isolated.database.recordReviewedHistory(manifest);
      const row = await isolated.database.pool.query<{
        content_sha256: string | null;
        at: string;
        legacy_repair_review: { originalSqlStatus: string };
      }>(
        "SELECT content_sha256,legacy_repair_review,to_char(applied_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS at FROM schema_migrations WHERE version=$1",
        [LEGACY_REPAIR],
      );
      expect(row.rows).toHaveLength(1);
      const stored = row.rows[0];
      if (!stored) throw new Error("Expected isolated receipt row");
      expect(stored.content_sha256).toBeNull();
      expect(stored.at).toBe("2026-09-02T07:57:49.216852Z");
      expect(stored.legacy_repair_review.originalSqlStatus).toBe(
        "UNAVAILABLE_NOT_CONTENT_VERIFIED",
      );
      expect((await isolated.database.status()).state).toBe("current");
      await isolated.database.migrate();
    });

    it("cannot approve a different recovery receipt or omit known migration review", async () => {
      await expect(
        isolated.database.recordReviewedHistory({
          ...manifest,
          legacyRepairReview: {
            ...manifest.legacyRepairReview,
            recoveryBranchId: "br-different-fixture",
          },
        }),
      ).rejects.toThrow("RECEIPT_CANNOT_BE_REWRITTEN");
      await expect(
        isolated.database.recordReviewedHistory({
          ...manifest,
          migrations: manifest.migrations.slice(1),
        }),
      ).rejects.toThrow("LINEAGE_MISMATCH");
    });

    it("every other unknown version still denies and cannot use this review", async () => {
      await isolated.database.pool.query(
        "INSERT INTO schema_migrations(version) VALUES('9999_unreviewed_fixture')",
      );
      try {
        await expect(isolated.database.migrate()).rejects.toThrow(
          "MIGRATION_LINEAGE_DENIED",
        );
        await expect(isolated.database.recordReviewedHistory(manifest)).rejects.toThrow(
          "LINEAGE_MISMATCH",
        );
      } finally {
        await isolated.database.pool.query(
          "DELETE FROM schema_migrations WHERE version='9999_unreviewed_fixture'",
        );
      }
    });

    it("schema drift denies; receipt is not permission to waive isolation", async () => {
      const client = await isolated.database.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DROP INDEX cross_device_commands_company_idempotency_idx");
        const { verifyLegacyRepairReview } = await import("./legacy-repair-review.js");
        await expect(
          verifyLegacyRepairReview(
            client,
            new Map(manifest.migrations.map((m) => [m.version, m.digest])),
            [...manifest.migrations.map((m) => m.version), LEGACY_REPAIR],
          ),
        ).rejects.toThrow("SCHEMA_REVIEW_DENIED");
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });

    it("changed canonical digest and fabricated legacy content hash deny", async () => {
      const row = await isolated.database.pool.query<{
        legacy_repair_review: Record<string, unknown>;
      }>("SELECT legacy_repair_review FROM schema_migrations WHERE version=$1", [
        LEGACY_REPAIR,
      ]);
      const stored = row.rows[0];
      if (!stored) throw new Error("Expected isolated receipt row");
      const receipt = stored.legacy_repair_review;
      await isolated.database.pool.query(
        "UPDATE schema_migrations SET legacy_repair_review=$2 WHERE version=$1",
        [LEGACY_REPAIR, { ...receipt, canonicalSha256: "f".repeat(64) }],
      );
      try {
        await expect(isolated.database.migrate()).rejects.toThrow(
          "CANONICAL_DIGEST_CHANGED",
        );
      } finally {
        await isolated.database.pool.query(
          "UPDATE schema_migrations SET legacy_repair_review=$2 WHERE version=$1",
          [LEGACY_REPAIR, receipt],
        );
      }
      await isolated.database.pool.query(
        "UPDATE schema_migrations SET content_sha256=$2 WHERE version=$1",
        [LEGACY_REPAIR, "a".repeat(64)],
      );
      try {
        await expect(isolated.database.migrate()).rejects.toThrow(
          "LEGACY_SQL_DIGEST_MUST_REMAIN_UNKNOWN",
        );
      } finally {
        await isolated.database.pool.query(
          "UPDATE schema_migrations SET content_sha256=NULL WHERE version=$1",
          [LEGACY_REPAIR],
        );
      }
    });
  },
);
