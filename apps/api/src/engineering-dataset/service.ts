import { createHash } from "node:crypto";
import {
  EngineeringDatasetDiffSchema,
  EngineeringDatasetExampleSchema,
  EngineeringDatasetSnapshotSchema,
  EngineeringExperienceSchema,
  EngineeringBenchmarkRunSchema,
  type EngineeringExperience,
  type EngineeringDatasetExample,
  type EngineeringTrainingScope,
  type EngineeringDiffResultSchema,
  type EngineeringIntegrationRun,
} from "@alexa-control/shared";
import type { EngineeringDatasetStore } from "./store.js";
import type { EngineeringOrchestrationStore } from "../engineering-orchestration/store.js";
import type { EngineeringIntegrationStore } from "../engineering-integration/store.js";
import type { EngineeringRuntimeStore } from "../engineering-runtime/store.js";

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
};
export const datasetHash = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
// Same secret classes as the finite Engineering runtime, with headers/AWS/JWT
// and sensitive-file guards added. Suspect examples are excluded, never masked
// into a falsely correct training target.
export const containsDatasetSecret = (value: unknown) => {
  const text = canonical(value);
  const pattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/-]{16,}|\b(?:sk|pk|ghp|github_pat)[-_A-Za-z0-9]{16,}\b|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\b(?:postgres(?:ql)?|mysql|mongodb):\/\/[^:\s]+:[^@\s]+@|\b(?:password|secret|api[_-]?key|access[_-]?token|authorization|cookie|set-cookie)\s*["']?\s*[:=]\s*["']?[^\s"']{8,}|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/i;
  // JSON escaping can hide quoted assignments inside prompt/patch strings.
  // Scan original strings as well as canonical object key/value representation.
  const scanStrings = (node: unknown): boolean => typeof node === "string" ? pattern.test(node) :
    node !== null && typeof node === "object" && Object.values(node).some(scanStrings);
  return pattern.test(text) || scanStrings(value);
};
export const sensitiveDatasetPath = (path: string) =>
  /(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|credentials\.json|\.ssh|\.aws)(?:\/|$)|\.(?:pem|key)$/.test(
    path,
  );
export class EngineeringDatasetService {
  constructor(
    readonly store: EngineeringDatasetStore,
    readonly orchestration: EngineeringOrchestrationStore,
    readonly integration: EngineeringIntegrationStore,
    readonly runtime: EngineeringRuntimeStore,
    readonly now: () => Date = () => new Date(),
    readonly isAthenaRepository: (
      companyId: string,
      repositoryId: string,
    ) => boolean = () => false,
  ) {}
  async setPolicy(
    ownerId: string,
    companyId: string,
    repositoryId: string,
    scope: EngineeringTrainingScope,
  ) {
    if (!(await this.runtime.findRepository(ownerId, companyId, repositoryId)))
      throw new Error("Registered company repository required.");
    if (scope === "GLOBAL_SAFE")
      throw new Error(
        "Global pooling is unavailable without a reviewed publication policy.",
      );
    if (
      scope === "ATHENA_INTERNAL" &&
      !this.isAthenaRepository(companyId, repositoryId)
    )
      throw new Error("Athena repository binding required.");
    return this.store.save({
      kind: "POLICY",
      ownerId,
      companyId,
      key: repositoryId,
      scope,
      approvedByOwnerAt: this.now().toISOString(),
    });
  }
  private async policy(ownerId: string, companyId: string, repositoryId: string) {
    const record = await this.store.get(ownerId, companyId, "POLICY", repositoryId);
    if (
      record?.kind !== "POLICY" ||
      record.scope === "EXCLUDED" ||
      record.scope === "GLOBAL_SAFE" ||
      (record.scope === "ATHENA_INTERNAL" &&
        !this.isAthenaRepository(companyId, repositoryId))
    )
      return "EXCLUDED";
    return record.scope;
  }
  async capture(experience: EngineeringExperience) {
    if (
      (await this.policy(
        experience.ownerId,
        experience.companyId,
        experience.repositoryId,
      )) === "EXCLUDED"
    )
      return;
    const parsed = EngineeringExperienceSchema.parse(experience);
    const task = await this.orchestration.findTask(
      parsed.ownerId,
      parsed.companyId,
      parsed.taskId,
    );
    if (
      !task ||
      task.repositoryId !== parsed.repositoryId ||
      task.objectiveId !== parsed.objectiveId ||
      task.workspaceId !== parsed.workspaceId ||
      parsed.generation > task.leaseGeneration ||
      (parsed.context &&
        (parsed.context.taskId !== task.id ||
          parsed.context.objectiveId !== task.objectiveId))
    )
      return;
    if (
      parsed.integrity === "SECRET_DETECTED" ||
      containsDatasetSecret(parsed) ||
      parsed.inspectedFiles.some(sensitiveDatasetPath)
    ) {
      // Retain only opaque provenance and outcome. No suspect text is persisted.
      await this.store.save({
        ...parsed,
        context: null,
        rounds: [],
        toolActions: [],
        inspectedFiles: [],
        failures: [],
        integrity: "SECRET_DETECTED",
      });
    } else await this.store.save(parsed);
  }
  async recordDiff(
    ownerId: string,
    companyId: string,
    run: EngineeringIntegrationRun,
    headCommit: string,
    diff: ReturnType<typeof EngineeringDiffResultSchema.parse>,
  ) {
    if (
      (await this.policy(ownerId, companyId, run.repositoryId)) === "EXCLUDED" ||
      !run.integrationWorkspaceId ||
      diff.truncated ||
      diff.redactions.length ||
      diff.files.some((v) => v.binary || sensitiveDatasetPath(v.path)) ||
      containsDatasetSecret(diff)
    )
      return;
    if (!diff.patch) return;
    await this.store.save(
      EngineeringDatasetDiffSchema.parse({
        kind: "DIFF",
        ownerId,
        companyId,
        key: datasetHash([run.id, headCommit]),
        runId: run.id,
        repositoryId: run.repositoryId,
        workspaceId: run.integrationWorkspaceId,
        baseCommit: run.baseCommit,
        headCommit,
        patch: diff.patch,
        createdAt: this.now().toISOString(),
      }),
    );
  }
  /** Caller supplies only source identity. All acceptance truth is reloaded canonically. */
  async collectAccepted(ownerId: string, companyId: string, runId: string) {
    const run = await this.integration.findRun(ownerId, companyId, runId);
    const candidate = await this.integration.findCandidateByRun(
      ownerId,
      companyId,
      runId,
    );
    if (
      !run ||
      !candidate ||
      run.status !== "READY" ||
      candidate.status !== "MERGED" ||
      !candidate.mergedAt ||
      !candidate.mergeIdempotencyKey ||
      candidate.mergedHeadCommit !== candidate.headCommit ||
      candidate.validatedHeadCommit !== candidate.headCommit ||
      candidate.reviewedHeadCommit !== candidate.headCommit ||
      candidate.validationReportId !== run.validationReportId ||
      candidate.reviewReportId !== run.reviewId ||
      candidate.repositoryId !== run.repositoryId ||
      candidate.objectiveId !== run.objectiveId ||
      candidate.baseCommit !== run.baseCommit ||
      candidate.integrationWorkspaceId !== run.integrationWorkspaceId
    )
      return [];
    if ((await this.policy(ownerId, companyId, run.repositoryId)) === "EXCLUDED")
      return [];
    const [objective, repository, validation, reviews, tasks, results, records, diff] =
      await Promise.all([
        this.orchestration.findObjective(ownerId, companyId, run.objectiveId),
        this.runtime.findRepository(ownerId, companyId, run.repositoryId),
        this.runtime.findValidation(ownerId, companyId, candidate.validationReportId),
        this.integration.listReviews(ownerId, companyId, run.id),
        this.orchestration.listTasks(ownerId, companyId, run.objectiveId),
        this.orchestration.listResults(ownerId, companyId, run.objectiveId),
        this.store.list(ownerId, companyId, "EXPERIENCE"),
        this.store.get(
          ownerId,
          companyId,
          "DIFF",
          datasetHash([run.id, candidate.headCommit]),
        ),
      ]);
    if (
      !objective ||
      !repository ||
      repository.status !== "ACTIVE" ||
      !validation ||
      validation.status !== "PASS" ||
      validation.workspaceId !== candidate.integrationWorkspaceId ||
      diff?.kind !== "DIFF" ||
      diff.baseCommit !== candidate.baseCommit ||
      diff.repositoryId !== candidate.repositoryId ||
      diff.workspaceId !== candidate.integrationWorkspaceId ||
      containsDatasetSecret(diff)
    )
      return [];
    const authors = new Set(
      results
        .filter((v) => candidate.tasksIncluded.includes(v.taskId))
        .map((v) => v.agentId),
    );
    const required = [candidate.reviewReportId];
    if (
      run.securityReviewRequired ||
      ["HIGH", "CRITICAL"].includes(objective.riskLevel)
    ) {
      if (
        !candidate.securityReviewId ||
        candidate.securityReviewId !== run.securityReviewId
      )
        return [];
      required.push(candidate.securityReviewId);
    }
    // Warnings/findings are excluded conservatively until a resolved-security
    // finding contract exists; PASS prose alone cannot certify their resolution.
    if (
      required.some(
        (id) =>
          !reviews.some(
            (v) =>
              v.id === id &&
              v.runId === run.id &&
              v.headCommit === candidate.headCommit &&
              v.verdict === "PASS" &&
              v.findings.length === 0 &&
              !authors.has(v.reviewerAgentId) &&
              v.acceptanceEvidence.every((e) => e.satisfied) &&
              objective.acceptanceCriteria.every(criterion => v.acceptanceEvidence.some(e => e.criterion === criterion && e.satisfied)),
          ),
      )
    )
      return [];
    const collected: EngineeringDatasetExample[] = [];
    for (const taskId of candidate.tasksIncluded) {
      const task = tasks.find((v) => v.id === taskId);
      const result = results.find((v) => v.taskId === taskId);
      const experiences = records
        .filter(
          (v): v is EngineeringExperience =>
            v.kind === "EXPERIENCE" &&
            v.taskId === taskId &&
            v.objectiveId === run.objectiveId &&
            v.repositoryId === run.repositoryId,
        )
        .sort((a, b) => a.generation - b.generation || a.attempt - b.attempt);
      const last = experiences.at(-1);
      if (
        !task ||
        !result ||
        task.status !== "COMPLETE" ||
        task.readOnly ||
        result.status !== "SUCCEEDED" ||
        result.validationStatus !== "PASS" ||
        !last ||
        last.outcome !== "SUCCEEDED" ||
        !last.context ||
        experiences.some((v) => v.integrity !== "CLEAN") ||
        last.workspaceId !== result.workspaceId ||
        ["FAIL", "PENDING"].includes(result.reviewStatus) ||
        (task.reviewRequired && result.reviewStatus !== "PASS") ||
        last.attempt !== task.attempt ||
        last.generation !== task.leaseGeneration ||
        (!task.readOnly &&
          (!result.filesChanged.length ||
            !last.toolActions.some((v) =>
              ["repository.file_patch", "repository.file_create"].includes(
                v.capability,
              ),
            )))
      )
        continue;
      const instruction = `${objective.title}\n${objective.description}\n${task.title}\n${task.description}\n${task.acceptanceCriteria.join("\n")}`;
      if (
        instruction.length > 16000 ||
        containsDatasetSecret([instruction, repository.metadata])
      )
        continue;
      const fields = {
        kind: "EXAMPLE" as const,
        ownerId,
        companyId,
        schemaVersion: "1" as const,
        key: datasetHash([
          run.repositoryId,
          taskId,
          candidate.baseCommit,
          candidate.headCommit,
          datasetHash(diff.patch),
        ]),
        objectiveId: run.objectiveId,
        taskId,
        repositoryId: run.repositoryId,
        candidateId: candidate.id,
        integrationRunId: run.id,
        workspaceId: candidate.integrationWorkspaceId,
        baseCommit: candidate.baseCommit,
        headCommit: candidate.headCommit,
        taskCategory:
          task.taskType === "FRONTEND"
            ? ("UI" as const)
            : task.taskType === "BACKEND"
              ? ("CRUD" as const)
              : task.taskType === "TESTING"
                ? ("TESTS" as const)
                : task.taskType === "DOCUMENTATION"
                  ? ("DOCS" as const)
                  : ("OTHER" as const),
        risk: task.riskLevel,
        complexity: task.estimatedDifficulty,
        instruction,
        repositoryMetadata: repository.metadata,
        experienceKeys: experiences.map((v) => v.key),
        experienceHashes: experiences.map((v) => datasetHash(v)),
        acceptedPatchHash: datasetHash(diff),
        acceptedPatchKey: diff.key,
        validationId: validation.id,
        reviewIds: required,
        repairTaskIds: run.repairTaskIds,
        provider: result.modelProvider,
        model: result.modelName,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        paidModelCostUsd: null,
        workspaceCostUsd: null,
        durationMs: result.durationMs,
        accepted: true as const,
        outcome: "SUCCEEDED" as const,
      };
      const payload = {...fields, createdAt: this.now().toISOString()};
      const example = EngineeringDatasetExampleSchema.parse({...payload, contentHash: datasetHash(payload)});
      const saved = await this.store.save(example);
      if (saved.kind === "EXAMPLE") {
        // Recollection must attest today's canonical source, not blindly return an old immutable example.
        // Preserve its original timestamp while comparing every other reconstructed source field.
        if (datasetHash({ ...payload, createdAt: saved.createdAt }) !== saved.contentHash)
          throw new Error("Accepted dataset canonical source changed; training denied.");
        collected.push(saved);
      }
    }
    return collected;
  }
  async eligible(ownerId: string, companyId: string) {
    const records = await this.store.list(ownerId, companyId, "EXAMPLE");
    const result: EngineeringDatasetExample[] = [];
    for (const v of records)
      if (
        v.kind === "EXAMPLE" &&
        (await this.policy(ownerId, companyId, v.repositoryId)) !== "EXCLUDED" &&
        !(await this.store.get(ownerId, companyId, "EXCLUSION", v.key))
      )
        result.push(v);
    return result;
  }
  async exclude(ownerId: string, companyId: string, key: string) {
    if (!(await this.store.get(ownerId, companyId, "EXAMPLE", key)))
      throw new Error("Scoped example unavailable.");
    return this.store.save({
      kind: "EXCLUSION",
      ownerId,
      companyId,
      key,
      reason: "OWNER_EXCLUDED",
      createdAt: this.now().toISOString(),
    });
  }
  async freeze(ownerId: string, companyId: string, version: string) {
    const members = (await this.eligible(ownerId, companyId))
      .map((v) => ({ key: v.key, hash: v.contentHash }))
      .sort((a, b) => a.key.localeCompare(b.key));
    return this.store.save(
      EngineeringDatasetSnapshotSchema.parse({
        kind: "SNAPSHOT",
        ownerId,
        companyId,
        key: version,
        schemaVersion: "1",
        members,
        contentHash: datasetHash(members),
        createdAt: this.now().toISOString(),
        evidence: members.length ? "ACCEPTED_ENGINEERING" : "EMPTY",
      }),
    );
  }
  async exportJsonl(ownerId: string, companyId: string, version: string) {
    const snapshot = await this.store.get(ownerId, companyId, "SNAPSHOT", version);
    if (
      snapshot?.kind !== "SNAPSHOT" ||
      snapshot.contentHash !== datasetHash(snapshot.members)
    )
      throw new Error("Frozen snapshot unavailable or corrupt.");
    const eligible = new Map(
      (await this.eligible(ownerId, companyId)).map((v) => [v.key, v]),
    );
    const lines: string[] = [];
    let exportBytes = 0;
    for (const member of snapshot.members) {
      const example = eligible.get(member.key);
      if (!example || example.contentHash !== member.hash)
        throw new Error(
          "Snapshot source policy revoked, example excluded, or integrity mismatch; export denied.",
        );
      const fields = Object.fromEntries(
        Object.entries(example).filter(
          ([key]) => key !== "contentHash",
        ),
      );
      if (datasetHash(fields) !== member.hash)
        throw new Error("Example content hash mismatch.");
      const experiences = await Promise.all(
        example.experienceKeys.map((key) =>
          this.store.get(ownerId, companyId, "EXPERIENCE", key),
        ),
      );
      const patch = await this.store.get(
        ownerId,
        companyId,
        "DIFF",
        example.acceptedPatchKey,
      );
      if (
        patch?.kind !== "DIFF" ||
        experiences.some((v) => v?.kind !== "EXPERIENCE" || v.integrity !== "CLEAN")
      )
        throw new Error("Snapshot source evidence unavailable.");
      if (
        datasetHash(patch) !== example.acceptedPatchHash ||
        experiences.some(
          (v, index) => datasetHash(v) !== example.experienceHashes[index],
        )
      )
        throw new Error("Immutable source evidence hash mismatch.");
      const data = {
        schemaVersion: "1",
        instruction: example.instruction,
        example,
        context: experiences,
        expectedPatch: patch.patch,
      };
      if (containsDatasetSecret(data)) throw new Error("Secret scan denied export.");
      const line = JSON.stringify(data);
      exportBytes += Buffer.byteLength(line, "utf8") + 1;
      if (exportBytes > 16 * 1024 * 1024)
        throw new Error("Bounded export quota exceeded; use a smaller frozen version.");
      lines.push(line);
    }
    return {
      contentHash: snapshot.contentHash,
      exampleCount: lines.length,
      jsonl: lines.join("\n") + (lines.length ? "\n" : ""),
    };
  }
  async recordOwnerBenchmark(ownerId: string, companyId: string, input: unknown) {
    const run = EngineeringBenchmarkRunSchema.parse(input);
    if (
      run.system !== "CODEX" ||
      run.source !== "OWNER_ENTERED" ||
      containsDatasetSecret(run)
    )
      throw new Error("Owner-entered non-secret Codex timing required.");
    return this.store.save({
      kind: "OWNER_BENCHMARK",
      ownerId,
      companyId,
      key: datasetHash(run),
      run,
    });
  }
  async stats(ownerId: string, companyId: string) {
    const [examples, all, failures, snapshots] = await Promise.all([
      this.eligible(ownerId, companyId),
      this.store.list(ownerId, companyId, "EXAMPLE"),
      this.store.list(ownerId, companyId, "EXPERIENCE"),
      this.store.list(ownerId, companyId, "SNAPSHOT"),
    ]);
    const distribution = (select: (v: EngineeringDatasetExample) => string[]) => {
      const counts: Record<string, number> = {};
      for (const v of examples)
        for (const key of select(v)) counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    };
    const costs = examples.flatMap((v) =>
      v.paidModelCostUsd === null ? [] : [Number(v.paidModelCostUsd)],
    );
    return {
      eligibleExamples: examples.length,
      excludedExamples: all.length - examples.length,
      failedAttempts: failures.filter(
        (v) => v.kind === "EXPERIENCE" && v.outcome !== "SUCCEEDED",
      ).length,
      categories: distribution((v) => [v.taskCategory]),
      models: distribution((v) => [v.model ?? "UNKNOWN"]),
      languages: distribution((v) => v.repositoryMetadata.languages),
      frameworks: distribution((v) => v.repositoryMetadata.frameworks),
      risks: distribution((v) => [v.risk]),
      averagePaidModelCostUsd: costs.length
        ? costs.reduce((a, b) => a + b, 0) / costs.length
        : null,
      averageDurationMs: examples.length
        ? examples.reduce((a, b) => a + b.durationMs, 0) / examples.length
        : null,
      snapshots,
      comparisonStatus: "PENDING_LIVE_BASELINE" as const,
    };
  }
}
