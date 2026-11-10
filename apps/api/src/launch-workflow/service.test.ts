import { describe, expect, it } from "vitest";
import type { WorkforceRuntimeTask } from "@alexa-control/shared";
import { companyScope } from "../companies/scope.js";
import { LaunchWorkflowService } from "./service.js";
import { InMemoryLaunchPackageStore } from "./store.js";

const ownerId = crypto.randomUUID(),
  companyA = crypto.randomUUID(),
  companyB = crypto.randomUUID(),
  objectiveId = crypto.randomUUID();
const scoped = (companyId: string, operation: () => Promise<unknown>) =>
  companyScope.run(
    { ownerId, companyId, role: "OWNER", requestId: crypto.randomUUID() },
    operation,
  );
const context = { ownerId, requestId: crypto.randomUUID(), ipAddress: "127.0.0.1" };

const harness = () => {
  const tasks = new Map<string, WorkforceRuntimeTask>(),
    audits: unknown[] = [];
  const workforce = {
    createTask(input: { body: unknown }) {
      const id = crypto.randomUUID(),
        body = input.body as { inputs: Record<string, unknown>; objective: string; idempotencyKey: string };
      tasks.set(id, {
        id,
        idempotencyKey: body.idempotencyKey,
        inputs: body.inputs,
        objective: body.objective,
        status: "QUEUED",
      } as WorkforceRuntimeTask);
      return Promise.resolve({ task: { id } });
    },
    findTask(_owner: string, id: string) {
      return Promise.resolve(tasks.get(id));
    },
  };
  const service = new LaunchWorkflowService(
    new InMemoryLaunchPackageStore(),
    {
      findObjectiveExecution: (_owner, id) =>
        Promise.resolve(id === objectiveId ? { id } : undefined),
    },
    workforce,
    (event) => {
      audits.push(event);
    },
  );
  const complete = (id: string, summary: string, research = false) => {
    const current = tasks.get(id)!;
    tasks.set(id, {
      ...current,
      status: "COMPLETED",
      runtimeActivity: research ? "RESEARCH_VERIFIED" : "MODEL_RESULT_VERIFIED",
      resultSummary: summary,
      assignedAgentId: "reviewed-agent",
      providerId: "fixture-model",
      actualCost: 3,
      startedAt: "2026-10-13T10:00:00.000Z",
      completedAt: "2026-10-13T10:00:02.000Z",
      evidenceRefs: research ? ["https://example.org/source"] : [],
      retrievedSourceEvidence: research
        ? [
            {
              sourceUrl: "https://example.org/source",
              retrievedAt: "2026-10-13T10:00:00.000Z",
              providerId: "fixture-search",
              modelRequestId: crypto.randomUUID(),
              tool: "web.research",
            },
          ]
        : [],
      completionProvenance: {
        completionType: "EXECUTED",
        agentSessionId: crypto.randomUUID(),
        modelRequestId: crypto.randomUUID(),
        evidenceRefs: [],
        artifactRefs: [],
        recordedAt: "2026-10-13T10:00:02.000Z",
      },
    });
  };
  return { service, tasks, audits, complete };
};

describe("governed product launch review package", () => {
  it("orchestrates sourced research, branding, marketing, and social into one owner-approved package without publishing", async () => {
    const { service, complete, audits, tasks } = harness();
    const created = (await scoped(companyA, () =>
      service.create({
        ...context,
        body: {
          objectiveId,
          product: "A secure team assistant",
          channels: ["LINKEDIN"],
        },
      }),
    )) as Awaited<ReturnType<typeof service.create>>;
    expect(created.status).toBe("DRAFT");
    const replayed = (await scoped(companyA, () =>
      service.create({
        ...context,
        body: {
          objectiveId,
          product: "A secure team assistant",
          channels: ["LINKEDIN"],
        },
      }),
    )) as Awaited<ReturnType<typeof service.create>>;
    expect(replayed.id).toBe(created.id);
    const outputs = [
      "Evidence-backed product summary.",
      JSON.stringify({
        positioning: "Private assistant for teams",
        targetAudience: "Small teams",
        valueProposition: "Governed work",
        brandVoice: "Clear and careful",
        messagingPillars: ["Trust", "Speed"],
        visualDirection: "Calm geometric forms",
        typography: "Readable sans serif",
        colors: ["#124578"],
        assetBrief: "Create a reviewed wordmark",
      }),
      JSON.stringify({
        strategy: "Owner-reviewed launch",
        channelPlan: ["Website and email"],
        copyVariants: ["Work with confidence"],
        landingPagePlan: "Request a reviewed landing page build",
        creativeRequests: ["Wordmark design brief"],
        analyticsInstrumentation: "Track consented signup conversions",
      }),
      JSON.stringify({
        posts: [
          {
            channel: "LINKEDIN",
            concept: "Launch announcement",
            caption: "Meet the secure assistant.",
            mediaAssetRef: null,
            proposedAt: null,
          },
        ],
      }),
    ];
    for (const [index, stage] of (
      ["research", "branding", "marketing", "social"] as const
    ).entries()) {
      const queued = (await scoped(companyA, () =>
        service.advance({ ...context, id: created.id }),
      )) as Awaited<ReturnType<typeof service.advance>>;
      expect(queued.taskIds[stage]).toBeTruthy();
      if (stage === "branding") expect(tasks.get(queued.taskIds[stage]!)?.objective).toContain("Evidence-backed product summary");
      if (stage === "marketing") expect(tasks.get(queued.taskIds[stage]!)?.objective).toContain("Private assistant for teams");
      if (stage === "social") expect(tasks.get(queued.taskIds[stage]!)?.objective).toContain("Owner-reviewed launch");
      const queuedReplay = (await scoped(companyA, () =>
        service.advance({ ...context, id: created.id }),
      )) as Awaited<ReturnType<typeof service.advance>>;
      expect(queuedReplay.version).toBe(queued.version);
      complete(queued.taskIds[stage]!, outputs[index]!, stage === "research");
      await scoped(companyA, () => service.advance({ ...context, id: created.id }));
    }
    const ready = (await scoped(companyA, () =>
      service.find(ownerId, created.id),
    )) as Awaited<ReturnType<typeof service.find>>;
    expect(ready.status).toBe("READY_FOR_REVIEW");
    expect(ready.research?.sources).toHaveLength(1);
    expect(ready.branding?.creativeProviderStatus).toBe("BLOCKED_PROVIDER");
    expect(ready.marketing?.provenance.costCredits).toBe(3);
    expect(ready.social?.posts[0]).toMatchObject({
      status: "READY_FOR_REVIEW",
      publishStatus: "BLOCKED_PROVIDER",
      accountId: null,
      providerReceiptId: null,
    });
    await expect(
      scoped(companyB, () => service.find(ownerId, created.id)),
    ).rejects.toMatchObject({ code: "LAUNCH_PACKAGE_NOT_FOUND" });
    await expect(
      scoped(companyA, () =>
        service.approve({
          ...context,
          id: created.id,
          body: { expectedDigest: "0".repeat(64) },
        }),
      ),
    ).rejects.toMatchObject({ code: "LAUNCH_DIGEST_CHANGED" });
    const approved = (await scoped(companyA, () =>
      service.approve({
        ...context,
        id: created.id,
        body: { expectedDigest: ready.approvalDigest },
      }),
    )) as Awaited<ReturnType<typeof service.approve>>;
    expect(approved.social?.posts[0]).toMatchObject({
      status: "APPROVED",
      publishStatus: "BLOCKED_PROVIDER",
      providerReceiptId: null,
    });
    const revised = (await scoped(companyA, () =>
      service.revisePost({
        ...context,
        id: created.id,
        body: {
          postId: approved.social!.posts[0]!.id,
          expectedVersion: approved.version,
          caption: "Revised announcement",
        },
      }),
    )) as Awaited<ReturnType<typeof service.revisePost>>;
    expect(revised).toMatchObject({ status: "READY_FOR_REVIEW", approvedAt: null });
    expect(revised.approvalDigest).not.toBe(ready.approvalDigest);
    await expect(
      scoped(companyA, () =>
        service.revisePost({
          ...context,
          id: created.id,
          body: {
            postId: approved.social!.posts[0]!.id,
            expectedVersion: approved.version,
            caption: "Stale overwrite",
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "LAUNCH_POST_NOT_EDITABLE" });
    await expect(
      scoped(companyA, () =>
        service.approve({
          ...context,
          id: created.id,
          body: { expectedDigest: ready.approvalDigest },
        }),
      ),
    ).rejects.toMatchObject({ code: "LAUNCH_DIGEST_CHANGED" });
    const cancelled = (await scoped(companyA, () =>
      service.cancelPost({
        ...context,
        id: created.id,
        body: {
          postId: approved.social!.posts[0]!.id,
          expectedVersion: revised.version,
        },
      }),
    )) as Awaited<ReturnType<typeof service.cancelPost>>;
    expect(cancelled).toMatchObject({
      status: "REQUIRES_OWNER_ACTION",
      approvalDigest: null,
    });
    expect(cancelled.social?.posts[0]?.status).toBe("REQUIRES_OWNER_ACTION");
    const historical = (await scoped(companyA, () =>
      service.findVersion(ownerId, created.id, approved.version),
    )) as Awaited<ReturnType<typeof service.findVersion>>;
    expect(historical.status).toBe("APPROVED");
    expect(historical.social?.posts[0]?.caption).toBe("Meet the secure assistant.");
    await expect(
      scoped(companyB, () =>
        service.findVersion(ownerId, created.id, approved.version),
      ),
    ).rejects.toMatchObject({ code: "LAUNCH_VERSION_NOT_FOUND" });
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "LAUNCH_PACKAGE_APPROVED" }),
      ]),
    );
  });

  it("blocks an unsupported or synthetic research result without creating brand assets", async () => {
    const { service, complete, tasks, audits } = harness();
    const created = (await scoped(companyA, () =>
      service.create({
        ...context,
        body: { objectiveId, product: "Another product", channels: ["LINKEDIN"] },
      }),
    )) as Awaited<ReturnType<typeof service.create>>;
    const queued = (await scoped(companyA, () =>
      service.advance({ ...context, id: created.id }),
    )) as Awaited<ReturnType<typeof service.advance>>;
    complete(queued.taskIds.research!, "Unsourced claim", false);
    const blocked = (await scoped(companyA, () =>
      service.advance({ ...context, id: created.id }),
    )) as Awaited<ReturnType<typeof service.advance>>;
    expect(blocked).toMatchObject({
      status: "REQUIRES_OWNER_ACTION",
      research: null,
      branding: null,
      marketing: null,
      social: null,
    });
    await expect(
      scoped(companyA, () =>
        service.retryBlockedStage({
          ...context,
          id: created.id,
          body: { expectedVersion: queued.version },
        }),
      ),
    ).rejects.toMatchObject({ code: "LAUNCH_RETRY_NOT_AVAILABLE" });
    const retried = (await scoped(companyA, () =>
      service.retryBlockedStage({
        ...context,
        id: created.id,
        body: { expectedVersion: blocked.version },
      }),
    )) as Awaited<ReturnType<typeof service.retryBlockedStage>>;
    expect(retried.taskIds.research).toBeNull();
    await expect(
      scoped(companyA, () =>
        service.retryBlockedStage({
          ...context,
          id: created.id,
          body: { expectedVersion: blocked.version },
        }),
      ),
    ).rejects.toMatchObject({ code: "LAUNCH_RETRY_NOT_AVAILABLE" });
    const newAttempt = (await scoped(companyA, () =>
      service.advance({ ...context, id: created.id }),
    )) as Awaited<ReturnType<typeof service.advance>>;
    expect(newAttempt.taskIds.research).not.toBe(queued.taskIds.research);
    expect(tasks.size).toBe(2);
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "LAUNCH_STAGE_RETRY_REQUESTED" }),
      ]),
    );
  });
});
