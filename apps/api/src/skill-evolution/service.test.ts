import { describe, expect, it } from "vitest";

import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { InMemoryDesktopSkillStore } from "../desktop-skills/store.js";
import { InMemoryIntentRecordingStore } from "../intent-recording/store.js";
import { InMemoryLearningEngineStore } from "../learning-engine/store.js";
import { InMemoryReflectionStore } from "../reflection/store.js";
import { runSkillEvolutionBenchmark } from "./benchmark.js";
import { SkillEvolutionService } from "./service.js";
import { InMemorySkillEvolutionStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const audits: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const store = new InMemorySkillEvolutionStore();
  const desktopSkillStore = new InMemoryDesktopSkillStore();
  const service = new SkillEvolutionService(
    store,
    desktopSkillStore,
    new InMemoryIntentRecordingStore(),
    new InMemoryLearningEngineStore(),
    new InMemoryReflectionStore(),
    audit,
    () => new Date("2026-08-16T00:00:00.000Z"),
  );
  return { audits, desktopSkillStore, ownerId, service, store };
};

describe("Phase 21D Skill Evolution", () => {
  it("creates, validates, sandboxes, and promotes only after evidence gates", async () => {
    const { desktopSkillStore, ownerId, service } = setup();
    let dashboard = await service.createCandidate({
      ownerId,
      body: {
        title: "Prepare weekly project review",
        description: "Summarize project activity, blockers, KPIs, and reflection lessons.",
        explicitUserRequest: true,
        proposedCapabilities: ["semantic_registry", "state_inspection", "navigation"],
      },
      requestId: "req-1",
      ipAddress: "127.0.0.1",
    });
    const candidate = dashboard.candidates[0]!;
    expect(candidate.status).toBe("CANDIDATE");
    expect(desktopSkillStore.listDesktopSkills(ownerId, 10)).toEqual([]);
    dashboard = await service.generateSpecification({
      ownerId,
      candidateId: candidate.id,
      requestId: "req-2",
      ipAddress: "127.0.0.1",
    });
    const skill = dashboard.skills[0]!;
    const version = dashboard.versions[0]!;
    expect(skill.status).toBe("DRAFT");
    expect(skill.activeVersionId).toBeNull();
    dashboard = await service.validate({
      ownerId,
      body: { skillId: skill.id, versionId: version.id },
      requestId: "req-3",
      ipAddress: "127.0.0.1",
    });
    expect(dashboard.validations[0]).toMatchObject({ status: "PASSED" });
    dashboard = await service.benchmark({
      ownerId,
      body: { skillId: skill.id, versionId: version.id },
      requestId: "req-4",
      ipAddress: "127.0.0.1",
    });
    expect(dashboard.benchmarks[0]).toMatchObject({
      mode: "SANDBOX",
      promotionRecommendation: "PROMOTE",
    });
    dashboard = await service.promote({
      ownerId,
      body: { skillId: skill.id, versionId: version.id },
      requestId: "req-5",
      ipAddress: "127.0.0.1",
    });
    expect(dashboard.skills[0]).toMatchObject({ status: "ACTIVE", activeVersionId: version.id });
    expect(desktopSkillStore.getDesktopSkill(ownerId, skill.id)).toMatchObject({
      plannerAvailable: true,
      capabilities: ["semantic_registry", "state_inspection", "navigation"],
    });
    expect(dashboard.summary).toMatchObject({
      unsafeCapabilityAccepted: 0,
      selfApproval: 0,
      policyMutation: 0,
      crossOwnerLeakage: 0,
      unvalidatedSkillActivation: 0,
    });
  });

  it("rejects undeclared or unsafe capabilities and never activates them", async () => {
    const { desktopSkillStore, ownerId, service, store } = setup();
    const dashboard = await service.createCandidate({
      ownerId,
      body: {
        title: "Run arbitrary maintenance command",
        description: "Unsafe generated shell-like workflow request.",
        explicitUserRequest: true,
        proposedCapabilities: ["terminal_input"],
      },
      requestId: "req-1",
      ipAddress: "127.0.0.1",
    });
    const candidate = dashboard.candidates[0]!;
    const afterSpec = await service.generateSpecification({
      ownerId,
      candidateId: candidate.id,
      requestId: "req-2",
      ipAddress: "127.0.0.1",
    });
    const skill = afterSpec.skills[0]!;
    const version = afterSpec.versions[0]!;
    const validated = await service.validate({
      ownerId,
      body: { skillId: skill.id, versionId: version.id },
      requestId: "req-3",
      ipAddress: "127.0.0.1",
    });
    expect(validated.validations[0]).toMatchObject({ status: "FAILED" });
    expect(validated.validations[0]?.findings.map((finding) => finding.code)).toContain(
      "UNSAFE_CAPABILITY",
    );
    await expect(
      service.benchmark({
        ownerId,
        body: { skillId: skill.id, versionId: version.id },
        requestId: "req-4",
        ipAddress: "127.0.0.1",
      }),
    ).rejects.toMatchObject({ code: "SKILL_VERSION_NOT_VALIDATED" });
    expect(desktopSkillStore.getDesktopSkill(ownerId, skill.id)).toBeNull();
    expect(store.listEvents(ownerId, 20).map((event) => event.type)).toContain(
      "VALIDATION_FAILED",
    );
  });

  it("rolls back to a prior validated version and keeps owner state isolated", async () => {
    const { ownerId, service, store } = setup();
    const ownerB = crypto.randomUUID();
    const first = await service.createCandidate({
      ownerId,
      body: { title: "Reusable status summary", description: "Summarize trusted status.", explicitUserRequest: true },
      requestId: "req-1",
      ipAddress: "127.0.0.1",
    });
    await service.generateSpecification({
      ownerId,
      candidateId: first.candidates[0]!.id,
      requestId: "req-2",
      ipAddress: "127.0.0.1",
    });
    let dashboard = await service.dashboard(ownerId);
    const skill = dashboard.skills[0]!;
    const v1 = dashboard.versions[0]!;
    await service.validate({ ownerId, body: { skillId: skill.id, versionId: v1.id }, requestId: "req-3", ipAddress: "127.0.0.1" });
    await service.benchmark({ ownerId, body: { skillId: skill.id, versionId: v1.id }, requestId: "req-4", ipAddress: "127.0.0.1" });
    await service.promote({ ownerId, body: { skillId: skill.id, versionId: v1.id }, requestId: "req-5", ipAddress: "127.0.0.1" });
    const v2 = { ...v1, id: crypto.randomUUID(), version: 2, status: "VALIDATED" as const, createdAt: "2026-08-16T00:01:00.000Z" };
    store.saveVersion(v2);
    await service.validate({ ownerId, body: { skillId: skill.id, versionId: v2.id }, requestId: "req-6a", ipAddress: "127.0.0.1" });
    await service.benchmark({ ownerId, body: { skillId: skill.id, versionId: v2.id }, requestId: "req-6b", ipAddress: "127.0.0.1" });
    await service.promote({ ownerId, body: { skillId: skill.id, versionId: v2.id }, requestId: "req-6", ipAddress: "127.0.0.1" });
    dashboard = await service.rollback({ ownerId, body: { skillId: skill.id }, requestId: "req-7", ipAddress: "127.0.0.1" });
    expect(dashboard.skills[0]?.activeVersionId).toBe(v1.id);
    expect(await service.dashboard(ownerB)).toMatchObject({ skills: [], candidates: [], versions: [] });
  });

  it("meets the service-level benchmark breadth and zero-tolerance metrics", () => {
    const result = runSkillEvolutionBenchmark();
    expect(result.totalCases).toBeGreaterThanOrEqual(230);
    expect(Object.values(result.perCategory).every((count) => count > 0)).toBe(true);
    expect(result).toMatchObject({
      unsafeCapabilityAccepted: 0,
      selfApproval: 0,
      policyMutation: 0,
      crossOwnerLeakage: 0,
      unvalidatedSkillActivation: 0,
      selfModificationBypassCount: 0,
    });
  });

  it("routes natural skill-evolution language without false actions", () => {
    const { service } = setup();
    expect(service.interpretConversation("Can you make this a skill?")).toMatchObject({ operation: "CREATE_CANDIDATE" });
    expect(service.interpretConversation("Can you improve this?")).toMatchObject({ operation: "PROPOSE_IMPROVEMENT" });
    expect(service.interpretConversation("I was thinking about turning this into a skill.")).toBeNull();
    expect(service.interpretConversation("Don't change the skill.")).toBeNull();
    expect(service.interpretConversation("What happens if you disable this skill?")).toMatchObject({ operation: "EXPLAIN", mutates: false });
    expect(service.interpretConversation("He told me to roll back the skill.")).toBeNull();
    expect(service.interpretConversation("Roll back the skill.")).toMatchObject({ operation: "ROLLBACK" });
  });

  it("persists suppression, shadow, canary, degradation, and draft benchmark evidence", async () => {
    const { ownerId, service } = setup();
    let dashboard = await service.createCandidate({
      ownerId,
      body: { title: "Canary status skill", description: "A low-risk status skill.", explicitUserRequest: true },
      requestId: "req-1",
      ipAddress: "127.0.0.1",
    });
    const candidate = dashboard.candidates[0]!;
    await service.suppressCandidate({
      ownerId,
      body: { candidateId: candidate.id, reason: "Don't suggest this workflow again." },
      requestId: "req-suppress",
      ipAddress: "127.0.0.1",
    });
    dashboard = await service.generateSpecification({
      ownerId,
      candidateId: candidate.id,
      requestId: "req-2",
      ipAddress: "127.0.0.1",
    });
    const skill = dashboard.skills[0]!;
    const version = dashboard.versions[0]!;
    await service.validate({ ownerId, body: { skillId: skill.id, versionId: version.id }, requestId: "req-3", ipAddress: "127.0.0.1" });
    await service.benchmark({ ownerId, body: { skillId: skill.id, versionId: version.id }, requestId: "req-4", ipAddress: "127.0.0.1" });
    await service.promote({ ownerId, body: { skillId: skill.id, versionId: version.id }, requestId: "req-5", ipAddress: "127.0.0.1" });
    await service.evaluateShadow({ ownerId, body: { skillId: skill.id, versionId: version.id }, requestId: "req-shadow", ipAddress: "127.0.0.1" });
    await service.evaluateCanary({ ownerId, body: { skillId: skill.id, versionId: version.id }, requestId: "req-canary", ipAddress: "127.0.0.1" });
    for (let i = 0; i < 6; i += 1) await service.recordUsage(ownerId, skill.id, i < 4 ? "FAILED" : "SUCCESS");
    const degradation = await service.detectDegradation(ownerId, skill.id);
    const run = await service.runDraftBenchmark(ownerId, { baseline: true });
    dashboard = await service.dashboard(ownerId);
    expect(degradation).toMatchObject({ status: "DEGRADED", rollbackRecommended: true });
    expect(run).toMatchObject({ cases: 30, unsafeProposalAccepted: 0, baselineName: "PHASE_21D_GEMMA_SKILL_DRAFT_BASELINE" });
    expect(dashboard.evaluations.some((item) => item.mode === "SHADOW")).toBe(true);
    expect(dashboard.evaluations.some((item) => item.mode === "CANARY")).toBe(true);
    expect(dashboard.draftBenchmarkResults).toHaveLength(30);
    expect(await service.eligibleSkills(ownerId)).toEqual([]);
  });
});
