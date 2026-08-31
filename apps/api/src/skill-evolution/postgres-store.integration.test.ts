import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InMemoryDesktopSkillStore } from "../desktop-skills/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { InMemoryIntentRecordingStore } from "../intent-recording/store.js";
import { InMemoryLearningEngineStore } from "../learning-engine/store.js";
import { PostgresDatabase } from "../persistence/database.js";
import { safeTestDatabaseUrl } from "../persistence/test-database.js";
import { InMemoryReflectionStore } from "../reflection/store.js";
import { PostgresSkillEvolutionStore } from "./postgres-store.js";
import { SkillEvolutionService } from "./service.js";

const connectionString = safeTestDatabaseUrl();
const ownerA = crypto.randomUUID();
const ownerB = crypto.randomUUID();

describe.skipIf(!connectionString)(
  "Phase 21D PostgreSQL skill evolution persistence",
  () => {
    let administration: PostgresDatabase;
    let database: PostgresDatabase;
    let schema: string;
    const audit: GovernanceAuditWriter = () => {};

    beforeAll(async () => {
      administration = new PostgresDatabase(connectionString!);
      schema = `phase21d_${crypto.randomUUID().replaceAll("-", "")}`;
      await administration.pool.query(`CREATE SCHEMA "${schema}"`);
      const isolated = new URL(connectionString!);
      isolated.hostname = isolated.hostname.replace("-pooler.", ".");
      if (isolated.searchParams.get("sslmode") !== "disable")
        isolated.searchParams.set("sslmode", "verify-full");
      isolated.searchParams.set("options", `-c search_path=${schema}`);
      database = new PostgresDatabase(isolated.toString());
      await database.migrate();
      await database.pool.query(`
      CREATE TABLE IF NOT EXISTS skill_evolution_artifacts(
       id uuid PRIMARY KEY,
       owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
       kind text NOT NULL CHECK(kind IN('CANDIDATE','SKILL','VERSION','VALIDATION','BENCHMARK','EVALUATION','DRAFT_RUN','DRAFT_RESULT','USAGE','EVENT')),
       updated_at timestamptz NOT NULL,
       record jsonb NOT NULL
      )
    `);
      await database.pool.query(`
      CREATE INDEX IF NOT EXISTS skill_evolution_artifacts_owner_kind_updated_idx
        ON skill_evolution_artifacts(owner_id,kind,updated_at DESC)
    `);
      for (const [id, email] of [
        [ownerA, `skill-evolution-${ownerA}@example.test`],
        [ownerB, `skill-evolution-${ownerB}@example.test`],
      ])
        await database.pool.query(
          `INSERT INTO owners(id,email,password_hash,record,created_at,updated_at)
         VALUES($1,$2,'test-only',$3,NOW(),NOW())
         ON CONFLICT(id) DO NOTHING`,
          [id, email, { id, email }],
        );
    }, 60_000);

    afterAll(async () => {
      await database?.close();
      if (administration && schema) {
        await administration.pool.query(`DROP SCHEMA "${schema}" CASCADE`);
        await administration.close();
      }
    });

    it("survives service reconstruction with owner isolation and active pointer intact", async () => {
      const desktopSkillStore = new InMemoryDesktopSkillStore();
      const first = new SkillEvolutionService(
        new PostgresSkillEvolutionStore(database.pool),
        desktopSkillStore,
        new InMemoryIntentRecordingStore(),
        new InMemoryLearningEngineStore(),
        new InMemoryReflectionStore(),
        audit,
        () => new Date("2026-08-16T00:00:00.000Z"),
      );
      const candidateDashboard = await first.createCandidate({
        ownerId: ownerA,
        body: {
          title: "PostgreSQL durable review skill",
          description: "Create a durable skill evolution record.",
          explicitUserRequest: true,
          proposedCapabilities: ["semantic_registry", "state_inspection"],
        },
        requestId: "pg-1",
        ipAddress: "127.0.0.1",
      });
      await first.generateSpecification({
        ownerId: ownerA,
        candidateId: candidateDashboard.candidates[0]!.id,
        requestId: "pg-2",
        ipAddress: "127.0.0.1",
      });
      const specified = await first.dashboard(ownerA);
      const skill = specified.skills[0]!;
      const version = specified.versions[0]!;
      await first.validate({
        ownerId: ownerA,
        body: { skillId: skill.id, versionId: version.id },
        requestId: "pg-3",
        ipAddress: "127.0.0.1",
      });
      await first.benchmark({
        ownerId: ownerA,
        body: { skillId: skill.id, versionId: version.id },
        requestId: "pg-4",
        ipAddress: "127.0.0.1",
      });
      await first.promote({
        ownerId: ownerA,
        body: { skillId: skill.id, versionId: version.id },
        requestId: "pg-5",
        ipAddress: "127.0.0.1",
      });
      await first.suppressCandidate({
        ownerId: ownerA,
        body: {
          candidateId: candidateDashboard.candidates[0]!.id,
          reason: "Do not suggest again.",
        },
        requestId: "pg-6",
        ipAddress: "127.0.0.1",
      });
      await first.evaluateShadow({
        ownerId: ownerA,
        body: { skillId: skill.id, versionId: version.id },
        requestId: "pg-7",
        ipAddress: "127.0.0.1",
      });
      await first.evaluateCanary({
        ownerId: ownerA,
        body: { skillId: skill.id, versionId: version.id },
        requestId: "pg-8",
        ipAddress: "127.0.0.1",
      });
      for (let i = 0; i < 6; i += 1)
        await first.recordUsage(ownerA, skill.id, i < 4 ? "FAILED" : "SUCCESS");
      await first.detectDegradation(ownerA, skill.id);
      await first.runDraftBenchmark(ownerA, { baseline: true });
      const restarted = new SkillEvolutionService(
        new PostgresSkillEvolutionStore(database.pool),
        desktopSkillStore,
        new InMemoryIntentRecordingStore(),
        new InMemoryLearningEngineStore(),
        new InMemoryReflectionStore(),
        audit,
        () => new Date("2026-08-16T00:01:00.000Z"),
      );
      const recovered = await restarted.dashboard(ownerA);
      expect(recovered.skills[0]).toMatchObject({
        id: skill.id,
        activeVersionId: version.id,
        status: "QUARANTINED",
        plannerEligible: false,
      });
      expect(recovered.candidates).toHaveLength(1);
      expect(recovered.versions).toHaveLength(1);
      expect(recovered.benchmarks).toHaveLength(1);
      expect(recovered.evaluations.some((item) => item.mode === "SHADOW")).toBe(true);
      expect(
        recovered.evaluations.some((item) => item.status === "ROLLBACK_RECOMMENDED"),
      ).toBe(true);
      expect(recovered.draftBenchmarkRuns[0]).toMatchObject({
        baselineName: "PHASE_21D_GEMMA_SKILL_DRAFT_BASELINE",
        unsafeProposalAccepted: 0,
      });
      expect(recovered.draftBenchmarkResults).toHaveLength(30);
      expect(recovered.candidates[0]).toMatchObject({ status: "SUPPRESSED" });
      expect(await restarted.dashboard(ownerB)).toMatchObject({
        skills: [],
        candidates: [],
        versions: [],
        benchmarks: [],
      });
    });
  },
);
