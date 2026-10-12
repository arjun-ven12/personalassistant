import { describe, it, expect, vi } from "vitest";
import { AthenaDistillationService, type ReviewedTrainer, type ReviewedVersionRuntime } from "./service.js";
import { InMemoryDistillationStore } from "./store.js";
import { prepareDataset } from "./preparation.js";
import { decidePromotion, evaluationMetrics } from "./evaluation.js";
import { fixtureBase, fixtureEvaluation, fixtureExport, fixtureRequest, fixtureScope, fixtureTime } from "./fixtures.js";
const context = { ...fixtureScope, requestId: "synthetic-request", ipAddress: "127.0.0.1" };
const digest = "d".repeat(64);
const create = (options: { trainer?: ReviewedTrainer; realSimulation?: boolean; runtime?: ReviewedVersionRuntime } = {}) => {
  const store = new InMemoryDistillationStore();
  if (options.realSimulation) Object.defineProperty(store, "durable", { value: true });
  let source = fixtureExport(), stopped = false;
  const audit = vi.fn(() => Promise.resolve());
  const exported = vi.fn(() => Promise.resolve(source));
  const trainer = options.trainer ?? { evidence: options.realSimulation ? "REAL" as const : "SYNTHETIC" as const, train: vi.fn(({ run, prepared }: Parameters<ReviewedTrainer["train"]>[0]) => Promise.resolve({ adapterDigest: digest, baseDigest: run.base.digest, manifestDigest: prepared.manifestDigest, evidence: options.realSimulation ? "REAL" as const : "SYNTHETIC" as const, hardware: "synthetic-test-hardware", runtime: "fixture-only", durationMs: 1, computeCostUsd: null, trainLoss: null, validationLoss: null })) };
  const service = new AthenaDistillationService(store, { exportVerified: exported }, audit, () => Promise.resolve(stopped), [fixtureBase], trainer,
    { evaluate: async ({ run }) => {
      const evaluation = fixtureEvaluation(run.artifact!.adapterDigest, options.realSimulation ? "REAL" : "SYNTHETIC");
      const active = await store.active(run);
      if (active) { evaluation.currentBaseline = evaluation.cases.map(v => ({ ...v, taskId: crypto.randomUUID() })); evaluation.currentVersionId = active.id; evaluation.currentArtifactDigest = active.artifact!.adapterDigest; }
      return evaluation;
    } }, options.runtime, !options.realSimulation, () => new Date(fixtureTime));
  return { store, service, trainer, audit, exported, stop: () => { stopped = true; }, revoke: () => { source = fixtureExport(fixtureScope, 0); } };
};
describe("Phase 28.6 synthetic implementation evidence (not live training)", () => {
  it("formats deterministically with independent held-out groups and no target reasoning", () => {
    const source = fixtureExport();
    const first = prepareDataset(fixtureScope, "synthetic-v1", source, 42)!;
    expect(first).toEqual(prepareDataset(fixtureScope, "synthetic-v1", source, 42));
    const all = [first.train, first.validation, first.evaluation];
    expect(all.map(v => v.length)).toEqual([3, 1, 1]);
    expect(new Set(all.flat().map(v => v.objectiveId)).size).toBe(5);
    expect(first.train[0]?.response).toContain("diff --git");
    expect(JSON.stringify(first)).not.toContain("toolActions");
  });
  it("rejects wrong tenant, secret-shaped context, insufficient groups, truncation and counts", () => {
    expect(() => prepareDataset({ ...fixtureScope, companyId: crypto.randomUUID() }, "v1", fixtureExport(), 1)).toThrow("SOURCE_DENIED");
    const input = fixtureExport();
    const lines = input.jsonl.split("\n").map(line => JSON.parse(line) as Record<string, unknown>);
    lines[0]!.expectedPatch = 'password = "synthetic-canary-credential"';
    expect(() => prepareDataset(fixtureScope, "v1", { ...input, jsonl: lines.map(v => JSON.stringify(v)).join("\n") }, 1)).toThrow("SOURCE_DENIED");
    expect(() => prepareDataset(fixtureScope, "v1", fixtureExport(fixtureScope, 2), 1)).toThrow("INDEPENDENT_GROUPS_REQUIRED");
    expect(() => prepareDataset(fixtureScope, "v1", { ...input, jsonl: input.jsonl.slice(0, 25) }, 1)).toThrow();
    expect(() => prepareDataset(fixtureScope, "v1", { ...input, exampleCount: 1 }, 1)).toThrow("COUNT_MISMATCH");
  });
  it("persists one idempotent run and a genuinely empty snapshot stays pending", async () => {
    const f = create();
    const [a, b] = await Promise.all([f.service.prepare(context, fixtureRequest), f.service.prepare(context, fixtureRequest)]);
    expect(a.id).toBe(b.id);
    expect((await f.service.list(context)).length).toBe(1);
    await expect(f.service.prepare(context, { ...fixtureRequest, config: { ...fixtureRequest.config, seed: 4 } })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    f.revoke();
    const pending = await f.service.prepare(context, { ...fixtureRequest, idempotencyKey: "empty-fixture" });
    expect(pending.state).toBe("PENDING_REAL_DATASET");
    await expect(f.service.train(context, pending.id)).rejects.toThrow("STATE_DENIED");
  });
  it("proves synthetic train/evaluate flow but never promotes or activates it", async () => {
    const f = create(), run = await f.service.prepare(context, fixtureRequest);
    expect((await f.service.train(context, run.id)).state).toBe("TRAINED");
    const evaluated = await f.service.evaluate(context, run.id);
    expect(evaluated.promotionReasons).toContain("synthetic-evidence");
    expect(evaluated.activation).toBe("INACTIVE");
    await expect(f.service.modelAction(context, run.id, "ACTIVATE")).rejects.toThrow("PROMOTION_DENIED");
    expect((await f.service.compare(context))[0]?.metrics?.paidCost.average).toBeNull();
    expect(JSON.stringify(f.audit.mock.calls)).not.toContain("Synthetic fixture card");
    const lineage = await f.service.lineage(context, run.id);
    expect(lineage.examples).toHaveLength(5);
    expect(lineage.artifactDigest).toBe(digest);
    expect(JSON.stringify(lineage)).not.toContain("Synthetic fixture card");
    await expect(f.service.lineage({ ...context, companyId: crypto.randomUUID() }, run.id)).rejects.toThrow("RECORD_UNAVAILABLE");
    f.revoke();
    await expect(f.service.lineage(context, run.id)).rejects.toThrow("PROVENANCE_CHANGED");
  });
  it("fails closed without a reviewed trainer or production storage", async () => {
    const source = fixtureExport();
    const production = new AthenaDistillationService(new InMemoryDistillationStore(), { exportVerified: () => Promise.resolve(source) }, () => Promise.resolve(), () => Promise.resolve(false), [fixtureBase]);
    await expect(production.prepare(context, fixtureRequest)).rejects.toThrow("AUTHORITY_UNAVAILABLE");
    const fixture = new AthenaDistillationService(new InMemoryDistillationStore(), { exportVerified: () => Promise.resolve(source) }, () => Promise.resolve(), () => Promise.resolve(false), [fixtureBase], undefined, undefined, undefined, true);
    const run = await fixture.prepare(context, fixtureRequest);
    expect((await fixture.train(context, run.id)).state).toBe("TRAINER_UNAVAILABLE");
  });
  it("rejects unregistered bases and client-supplied paths, evidence and authority", async () => {
    const f = create();
    await expect(f.service.prepare(context, { ...fixtureRequest, baseModelId: "unreviewed" })).rejects.toThrow("BASE_UNREVIEWED");
    for (const field of ["executable", "path", "evidence", "ownerId", "risk", "trainer", "evaluation"]) await expect(f.service.prepare(context, { ...fixtureRequest, [field]: "caller-authority" })).rejects.toThrow();
  });
  it("denies corrupt artifacts, revoked datasets, cross-tenant reads and emergency stop", async () => {
    const bad: ReviewedTrainer = { evidence: "SYNTHETIC", train: () => Promise.resolve({ adapterDigest: digest, baseDigest: "b".repeat(64), manifestDigest: digest, evidence: "SYNTHETIC", hardware: "fixture", runtime: "fixture", durationMs: 0, computeCostUsd: null, trainLoss: null, validationLoss: null }) };
    const f = create({ trainer: bad }), run = await f.service.prepare(context, fixtureRequest);
    expect((await f.service.train(context, run.id)).state).toBe("FAILED");
    await expect(f.service.get({ ...context, companyId: crypto.randomUUID() }, run.id)).rejects.toThrow("UNAVAILABLE");
    const revoked = create(), r = await revoked.service.prepare(context, fixtureRequest);
    revoked.revoke();
    await expect(revoked.service.train(context, r.id)).rejects.toThrow("PROVENANCE_CHANGED");
    f.stop();
    await expect(f.service.prepare(context, { ...fixtureRequest, idempotencyKey: "stopped" })).rejects.toThrow("AUTHORITY_UNAVAILABLE");
  });
  it("bounds concurrent claims to one trainer invocation and cancels without resurrecting a run", async () => {
    let complete: ((value: Awaited<ReturnType<ReviewedTrainer["train"]>>) => void) | undefined;
    let claimed: Parameters<ReviewedTrainer["train"]>[0] | undefined;
    let invocations = 0;
    const trainer: ReviewedTrainer = { evidence: "SYNTHETIC", train: vi.fn<ReviewedTrainer["train"]>(input => { invocations++; claimed = input; return new Promise(resolve => { complete = resolve; }); }) };
    const f = create({ trainer }), run = await f.service.prepare(context, fixtureRequest);
    const first = f.service.train(context, run.id);
    await vi.waitFor(() => expect(claimed).toBeDefined());
    await expect(f.service.train(context, run.id)).rejects.toThrow("STATE_DENIED");
    await f.service.modelAction(context, run.id, "CANCEL");
    complete!({ adapterDigest: digest, baseDigest: fixtureBase.digest, manifestDigest: claimed!.prepared.manifestDigest, evidence: "SYNTHETIC", hardware: "fixture", runtime: "fixture", durationMs: 1, computeCostUsd: null, trainLoss: null, validationLoss: null });
    expect((await first).state).toBe("CANCELLED");
    expect(invocations).toBe(1);
  });
  it("rolls back persisted state when audit persistence fails", async () => {
    const f = create();
    f.audit.mockRejectedValueOnce(new Error("fixture audit outage"));
    await expect(f.service.prepare(context, fixtureRequest)).rejects.toThrow("audit outage");
    expect(await f.service.list(context)).toEqual([]);
  });
  it("simulation of reviewed durable activation, replacement, rollback and retirement uses one existing runtime", async () => {
    const runtime = { matches: vi.fn(() => Promise.resolve(true)), select: vi.fn(() => Promise.resolve()), disable: vi.fn(() => Promise.resolve()) };
    const f = create({ realSimulation: true, runtime });
    const a = await f.service.prepare(context, fixtureRequest);
    await f.service.train(context, a.id);
    await expect(f.service.modelAction(context, a.id, "ACTIVATE")).rejects.toThrow("PROMOTION_DENIED");
    await f.service.evaluate(context, a.id);
    expect((await f.service.modelAction(context, a.id, "ACTIVATE")).activation).toBe("ACTIVE");
    const b = await f.service.prepare(context, { ...fixtureRequest, idempotencyKey: "version-2" });
    await f.service.train(context, b.id); await f.service.evaluate(context, b.id);
    expect((await f.service.modelAction(context, b.id, "ACTIVATE")).rollbackTarget).toBe(a.id);
    expect((await f.service.modelAction(context, b.id, "ROLLBACK")).id).toBe(a.id);
    expect((await f.service.modelAction(context, a.id, "RETIRE")).activation).toBe("RETIRED");
    expect(runtime.select).toHaveBeenCalledTimes(3);
    expect(runtime.disable).toHaveBeenCalledTimes(1);
  });
  it("requires genuine baselines, all categories, independent cases, safety and no material regression", () => {
    const good = fixtureEvaluation(digest, "REAL");
    expect(decidePromotion(good, { minimumCases: 8, minimumPassRate: 0.9, maximumRegressions: 0, maximumDurationRatio: 1.5 }).promotion).toBe("ELIGIBLE");
    const policy = { minimumCases: 8, minimumPassRate: 0.9, maximumRegressions: 0 as const, maximumDurationRatio: 1.5 };
    expect(decidePromotion({ ...good, lunaBaseline: null }, policy).promotionReasons).toContain("luna-baseline-missing");
    const bad = structuredClone(good); bad.cases[7]!.securityPass = false;
    expect(decidePromotion(bad, policy).promotionReasons).toContain("quality-or-safety-failed");
    bad.cases[0]!.durationMs = 5000;
    expect(decidePromotion(bad, policy).promotionReasons).toContain("latency-regression-or-unknown");
    const duplicate = structuredClone(good); duplicate.cases[1]!.taskId = duplicate.cases[0]!.taskId;
    expect(decidePromotion(duplicate, policy).promotionReasons).toContain("duplicate-evaluation");
    expect(evaluationMetrics(good.cases).computeCost).toMatchObject({ average: null, unknownSamples: 8 });
  });
});
