import crypto from "node:crypto";

import {
  CreateEngineeringProjectSessionRequestSchema,
  EngineeringProjectSessionSchema,
  EngineeringProjectSessionViewSchema,
  SendEngineeringProjectMessageRequestSchema,
  UpdateEngineeringProjectSessionQueueRequestSchema,
  type EngineeringProjectInstructionClassification,
  type EngineeringDelivery,
} from "@alexa-control/shared";

import type { EngineeringRuntimeStore } from "../engineering-runtime/store.js";
import type { EngineeringDeliveryContext } from "./service.js";
import type { EngineeringDeliveryService } from "./service.js";
import type { EngineeringProjectSessionStore } from "./session-store.js";

export class EngineeringProjectSessionError extends Error {
  readonly statusCode: number;
  constructor(readonly code: string, message: string, statusCode = 409) {
    super(message);
    this.name = "EngineeringProjectSessionError";
    this.statusCode = statusCode;
  }
}

const terminalDelivery = (status: string) =>
  ["DONE", "DONE_WITH_WARNINGS", "BLOCKED", "FAILED", "CANCELLED", "OWNER_INPUT_REQUIRED"].includes(status);

export const classifyProjectInstruction = (
  instruction: string,
  active: boolean,
): EngineeringProjectInstructionClassification => {
  const text = instruction.trim().toLowerCase();
  if (/^(what|which|why|how|is|are|did|was|show|tell)\b/.test(text) || text.endsWith("?"))
    return "QUESTION";
  if (/^(stop|cancel|pause|resume|retry|start|run|restart)\b/.test(text))
    return "CONTROL_ACTION";
  if (active && /^(after this|after that|when (?:this|that|it)(?: is)? (?:done|complete)|next[, :]?)/.test(text))
    return "NEW_INDEPENDENT_REQUEST";
  if (active && /^(actually|instead|change that|replace that|scratch that|make it)/.test(text))
    return "MODIFY_CURRENT_REQUIREMENT";
  if (active && /^(also|and also|plus|additionally)\b/.test(text))
    return "ADD_REQUIREMENT";
  return active ? "MODIFY_CURRENT_REQUIREMENT" : "NEW_INDEPENDENT_REQUEST";
};

export class EngineeringProjectSessionService {
  constructor(
    readonly store: EngineeringProjectSessionStore,
    readonly runtime: EngineeringRuntimeStore,
    readonly deliveries: EngineeringDeliveryService,
    readonly now: () => Date = () => new Date(),
  ) {}

  list(ownerId: string, companyId: string) { return this.store.list(ownerId, companyId); }

  async create(context: EngineeringDeliveryContext, body: unknown) {
    const input = CreateEngineeringProjectSessionRequestSchema.parse(body);
    const prior = await this.store.findByKey(context.ownerId, context.companyId, input.idempotencyKey);
    if (prior) {
      if (prior.repositoryId !== input.repositoryId) throw new EngineeringProjectSessionError("IDEMPOTENCY_CONFLICT", "This session identity belongs to another project.");
      return this.view(context.ownerId, context.companyId, prior.id);
    }
    const repository = await this.runtime.findRepository(context.ownerId, context.companyId, input.repositoryId);
    if (!repository || repository.status !== "ACTIVE") throw new EngineeringProjectSessionError("REPOSITORY_NOT_FOUND", "Select an active repository in the current company.", 404);
    const at = this.now().toISOString();
    const session = await this.store.create(EngineeringProjectSessionSchema.parse({
      schemaVersion: "1", id: crypto.randomUUID(), ownerId: context.ownerId,
      companyId: context.companyId, repositoryId: repository.id,
      conversationId: crypto.randomUUID(), projectName: repository.displayName,
      messages: [], deliveryIds: [], activeDeliveryId: null, createdAt: at, updatedAt: at,
    }), input.idempotencyKey);
    if (session.repositoryId !== repository.id) throw new EngineeringProjectSessionError("IDEMPOTENCY_CONFLICT", "This session identity belongs to another project.");
    return this.view(context.ownerId, context.companyId, session.id);
  }

  async view(ownerId: string, companyId: string, id: string) {
    const session = await this.require(ownerId, companyId, id);
    const runs = await Promise.all(session.deliveryIds.map(async (deliveryId) => {
      const delivery = await this.deliveries.store.find(ownerId, companyId, deliveryId);
      if (!delivery) throw new EngineeringProjectSessionError("INCONSISTENT_STATE", "A project run is missing from this company scope.");
      return { deliveryId, status: delivery.status, request: delivery.sourceRequest,
        filesChanged: delivery.filesChanged.length,
        costUsd: (delivery.modelUsage ?? []).reduce((sum, item) => sum + Number(item.costUsd), 0).toFixed(8),
        durationMs: Math.max(0, new Date(delivery.completedAt ?? delivery.updatedAt).getTime() - new Date(delivery.createdAt ?? delivery.updatedAt).getTime()),
        updatedAt: delivery.updatedAt };
    }));
    const byDelivery = new Map(runs.map((run) => [run.deliveryId, run]));
    const queuedRequests = session.queuedRequests.map((request) => {
      const run = request.deliveryId ? byDelivery.get(request.deliveryId) : undefined;
      const status = !run ? request.status
        : ["DONE", "DONE_WITH_WARNINGS"].includes(run.status) ? "COMPLETED"
          : ["BLOCKED", "FAILED", "OWNER_INPUT_REQUIRED"].includes(run.status) ? "BLOCKED"
            : run.status === "CANCELLED" ? "CANCELLED" : "STARTED";
      return { ...request, status };
    });
    const messages = session.messages.map((message) => {
      const run = message.deliveryId ? byDelivery.get(message.deliveryId) : undefined;
      const state = !run ? message.state
        : ["DONE", "DONE_WITH_WARNINGS"].includes(run.status) ? "COMPLETE"
          : ["BLOCKED", "FAILED", "CANCELLED", "OWNER_INPUT_REQUIRED"].includes(run.status) ? "BLOCKED" : "ACTIVE";
      return { ...message, state };
    });
    const transcript = [] as typeof messages;
    const acknowledged = new Set<string>();
    for (const message of messages) {
      transcript.push(message);
      if (!message.deliveryId || acknowledged.has(message.deliveryId)) continue;
      const run = byDelivery.get(message.deliveryId);
      if (!run) continue;
      acknowledged.add(message.deliveryId);
      transcript.push({ id: message.deliveryId, role: "ALEXA", deliveryId: message.deliveryId,
        text: ["DONE", "DONE_WITH_WARNINGS"].includes(run.status)
          ? `Done. ${run.filesChanged} files changed.`
          : ["BLOCKED", "FAILED", "CANCELLED", "OWNER_INPUT_REQUIRED"].includes(run.status)
            ? `Run ${run.status.toLowerCase().replaceAll("_", " ")}. Open the run for details.`
            : `Run ${run.status.toLowerCase().replaceAll("_", " ")}.`,
        state: message.state, idempotencyKey: null, classification: null, createdAt: run.updatedAt });
    }
    return EngineeringProjectSessionViewSchema.parse({ session: { ...session, queuedRequests, messages: transcript.slice(-500) }, runs });
  }

  async send(context: EngineeringDeliveryContext, id: string, body: unknown) {
    const input = SendEngineeringProjectMessageRequestSchema.parse(body);
    let session = await this.require(context.ownerId, context.companyId, id);
    const duplicate = session.messages.find((message) => message.idempotencyKey === input.idempotencyKey);
    if (duplicate && duplicate.state !== "QUEUED") {
      if (duplicate.text !== input.instruction) throw new EngineeringProjectSessionError("IDEMPOTENCY_CONFLICT", "This message identity has different text.");
      return this.view(context.ownerId, context.companyId, id);
    }
    if (duplicate && duplicate.text !== input.instruction) throw new EngineeringProjectSessionError("IDEMPOTENCY_CONFLICT", "This message identity has different text.");
    if (session.queuedRequests.some((request) => request.idempotencyKey === input.idempotencyKey))
      return this.view(context.ownerId, context.companyId, id);
    const repository = await this.runtime.findRepository(context.ownerId, context.companyId, session.repositoryId);
    if (!repository || repository.status !== "ACTIVE") throw new EngineeringProjectSessionError("REPOSITORY_NOT_FOUND", "The selected repository is no longer active in this company.");
    if (typeof this.runtime.listRepositories === "function") {
      const instruction = input.instruction.toLowerCase();
      const others = (await this.runtime.listRepositories(context.ownerId, context.companyId))
        .filter((candidate) => candidate.id !== repository.id && candidate.displayName.trim().length >= 3);
      if (others.some((candidate) => instruction.includes(candidate.displayName.toLowerCase())))
        throw new EngineeringProjectSessionError("WRONG_PROJECT_REFERENCE", "This session is bound to another project. Switch projects explicitly before sending that instruction.");
    }
    if (/^(?:sudo\s+|curl\b|wget\b|(?:pnpm|npm|yarn|pip|uv|gradle)\s+(?:add|install|remove|uninstall)\b)/i.test(input.instruction.trim()))
      throw new EngineeringProjectSessionError("RAW_COMMAND_DENIED", "Use a natural-language project dependency request; raw shell and package-manager commands are not accepted.");
    const active = session.activeDeliveryId ? await this.deliveries.store.find(context.ownerId, context.companyId, session.activeDeliveryId) : undefined;
    const isActive = Boolean(active && !terminalDelivery(active.status));
    const classification = classifyProjectInstruction(input.instruction, isActive);
    const at = this.now().toISOString();
    if (/^(?:please\s+)?(?:undo|revert)\b/i.test(input.instruction)) {
      if (isActive) throw new EngineeringProjectSessionError("PROJECT_RUN_ACTIVE", "Wait for the current modification to finish before starting a governed revert.");
      const deliveries: EngineeringDelivery[] = [];
      for (const deliveryId of session.deliveryIds) {
        const delivery = await this.deliveries.store.find(context.ownerId, context.companyId, deliveryId);
        if (delivery && ["DONE", "DONE_WITH_WARNINGS"].includes(delivery.status)) deliveries.push(delivery);
      }
      const latest = deliveries.at(-1);
      if (!latest) throw new EngineeringProjectSessionError("OWNER_CLARIFICATION_REQUIRED", "No completed project-session modification is available to revert.");
      const specific = input.instruction.toLowerCase()
        .replace(/\b(please|undo|revert|the|last|change|modification|what|we|did|to|just|made)\b/g, " ")
        .split(/[^a-z0-9]+/).filter((word) => word.length > 2);
      const matching = specific.length
        ? deliveries.filter((delivery) => specific.some((word) => delivery.sourceRequest.toLowerCase().includes(word)))
        : [latest];
      if (matching.length !== 1)
        throw new EngineeringProjectSessionError("OWNER_CLARIFICATION_REQUIRED", "The revert target is ambiguous. Name one recent project-session change.");
      if (matching[0]!.id !== latest.id)
        throw new EngineeringProjectSessionError("OWNER_CLARIFICATION_REQUIRED", "That change has later dependent project-session work. Review a repair or revert plan instead.");
      if (!latest.integrationRunId)
        throw new EngineeringProjectSessionError("OWNER_CLARIFICATION_REQUIRED", "The last change has no governed integration history to revert.");
      const integration = await this.deliveries.integration.view(context.ownerId, context.companyId, latest.integrationRunId);
      const commit = integration.candidate?.status === "MERGED" ? integration.candidate.mergedHeadCommit : null;
      if (!commit)
        throw new EngineeringProjectSessionError("OWNER_CLARIFICATION_REQUIRED", "The last change was not merged into the project working state, so there is no deterministic merge commit to revert.");
      const reverted = await this.deliveries.create(context, {
        request: `Governed revert commit ${commit}. ${input.instruction}`,
        repositoryId: repository.id, developmentRootWorkspaceId: null, projectName: repository.displayName,
        acceptanceCriteria: [`Commit ${commit} is deterministically reverted and validation passes.`],
        constraints: ["Do not reconstruct source from model memory.", "Fail closed if the registered repository head moved."],
        deadlineAt: null, visibleMode: false, idempotencyKey: input.idempotencyKey,
      });
      const updated = EngineeringProjectSessionSchema.parse({ ...session, activeDeliveryId: reverted.delivery.id,
        deliveryIds: [...session.deliveryIds, reverted.delivery.id],
        messages: [...session.messages, { id: crypto.randomUUID(), role: "OWNER", text: input.instruction,
          deliveryId: reverted.delivery.id, state: "ACTIVE", idempotencyKey: input.idempotencyKey,
          classification: "NEW_INDEPENDENT_REQUEST", createdAt: at }],
        updatedAt: new Date(Math.max(this.now().getTime(), new Date(session.updatedAt).getTime() + 1)).toISOString(),
      });
      if (!await this.store.saveIfUpdatedAt(updated, session.updatedAt)) throw new EngineeringProjectSessionError("SESSION_CONFLICT", "The project session changed while starting the revert.");
      return this.view(context.ownerId, context.companyId, id);
    }
    const question = input.instruction.trim().replace(/\?$/, "").toLowerCase();
    const previewAction = question.replace(/[.!]$/, "");
    if (["start it", "run the app", "start the dev server", "start dev server", "restart the server", "restart the dev server", "stop the server", "stop the dev server"].includes(previewAction)) {
      const latestId = session.deliveryIds.at(-1);
      const latest = latestId ? await this.deliveries.store.find(context.ownerId, context.companyId, latestId) : undefined;
      if (!latest || latest.repositoryId !== repository.id)
        throw new EngineeringProjectSessionError("PREVIEW_UNAVAILABLE", "This project has no completed engineering run with a governed preview workspace.");
      const preview = previewAction.startsWith("stop")
        ? latest.preview?.previewId
          ? await this.deliveries.previewControl(context, latest.id, "stop")
          : (() => { throw new EngineeringProjectSessionError("PREVIEW_UNAVAILABLE", "This project has no running governed preview."); })()
        : previewAction.startsWith("restart") && latest.preview?.previewId
          ? await this.deliveries.previewControl(context, latest.id, "restart")
          : await this.deliveries.startPreview(context, latest.id);
      const answer = preview.delivery.preview?.state === "RUNNING"
        ? `Preview running at ${preview.delivery.preview.url ?? "the registered development address"}.`
        : `Preview ${preview.delivery.preview?.state?.toLowerCase() ?? "stopped"}. Open the run for details.`;
      if (session.messages.length > 498) throw new EngineeringProjectSessionError("SESSION_FULL", "Start a new project session to continue.");
      const replied = EngineeringProjectSessionSchema.parse({ ...session, updatedAt: new Date(Math.max(this.now().getTime(), new Date(session.updatedAt).getTime() + 1)).toISOString(),
        messages: [...session.messages,
          { id: crypto.randomUUID(), role: "OWNER", text: input.instruction, deliveryId: null, state: "COMPLETE", idempotencyKey: input.idempotencyKey, classification, createdAt: at },
          { id: crypto.randomUUID(), role: "ALEXA", text: answer, deliveryId: null, state: "COMPLETE", idempotencyKey: null, classification: null, createdAt: at }],
      });
      if (!await this.store.saveIfUpdatedAt(replied, session.updatedAt)) throw new EngineeringProjectSessionError("SESSION_CONFLICT", "The project session changed. Refresh and retry.");
      return this.view(context.ownerId, context.companyId, id);
    }
    const questionKind =
      /what (?:did you|was) change|what was the last change/.test(question) ? "CHANGED"
        : /what(?:'s| is) currently running|what are you (?:doing|working on)/.test(question) ? "RUNNING"
          : /what(?:'s| is) queued/.test(question) ? "QUEUED"
            : /what failed/.test(question) ? "FAILED"
              : /which files are changing/.test(question) ? "FILES"
                : /why is this blocked/.test(question) ? "BLOCKED"
                  : /how much (?:has this|did this session) cost/.test(question) ? "COST"
                    : /how long has it been running/.test(question) ? "DURATION" : null;
    if (classification === "QUESTION") {
      const current = session.activeDeliveryId
        ? await this.deliveries.controlCenter(context.ownerId, context.companyId, session.activeDeliveryId)
        : null;
      const views = questionKind === "COST"
        ? await Promise.all(session.deliveryIds.map((deliveryId) => this.deliveries.controlCenter(context.ownerId, context.companyId, deliveryId)))
        : [];
      const previous = session.deliveryIds.at(-1)
        ? await this.deliveries.store.find(context.ownerId, context.companyId, session.deliveryIds.at(-1)!)
        : undefined;
      const answer = questionKind === "QUEUED"
        ? session.queuedRequests.filter((item) => ["QUEUED", "READY", "BLOCKED"].includes(item.status)).map((item) => item.instruction).join("; ") || "Nothing is queued."
        : questionKind === "CHANGED" ? previous
          ? `${previous.sourceRequest} ${previous.filesChanged.length ? `Changed: ${previous.filesChanged.slice(0, 12).join(", ")}.` : "No integrated files are recorded."}`
          : "No completed project modification is recorded in this session."
        : questionKind === "FAILED" ? previous && ["FAILED", "BLOCKED", "OWNER_INPUT_REQUIRED"].includes(previous.status)
          ? `Last unsuccessful run: ${previous.sourceRequest} (${previous.status.replaceAll("_", " ")}).`
          : "No failed project run is recorded as the latest session action."
        : questionKind === "COST" ? `Recorded session model cost: $${views.flatMap((view) => view.delivery.modelUsage).reduce((sum, item) => sum + Number(item.costUsd), 0).toFixed(4)}.`
        : !current ? "No engineering run has started in this project session yet."
        : questionKind === "RUNNING" ? `Current run: ${current.delivery.status.replaceAll("_", " ")}. ${current.activeAgents.length} active engineers. ${current.timeline.at(-1)?.summary ?? "No activity recorded yet."}`
          : questionKind === "FILES" ? current.delivery.filesChanged.length
            ? `Recorded changed files: ${current.delivery.filesChanged.slice(0, 12).join(", ")}.`
            : "No integrated changed files are recorded yet. Open the run for task-level evidence."
          : questionKind === "BLOCKED" ? current.blocker
            ? `${current.blocker.message} ${current.blocker.action}`
            : `This run is ${current.delivery.status.replaceAll("_", " ").toLowerCase()}; no actionable blocker is recorded.`
          : questionKind === "DURATION" ? `Elapsed time: ${Math.floor(current.elapsedMs / 60_000)} minutes ${Math.floor(current.elapsedMs / 1_000) % 60} seconds.`
            : `Current run: ${current.delivery.status.replaceAll("_", " ")}. Open the full run for recorded activity, files, validation, and blockers.`;
      if (session.messages.length > 498) throw new EngineeringProjectSessionError("SESSION_FULL", "Start a new project session to continue.");
      const replied = EngineeringProjectSessionSchema.parse({ ...session, updatedAt: new Date(Math.max(this.now().getTime(), new Date(session.updatedAt).getTime() + 1)).toISOString(),
        messages: [...session.messages,
          { id: crypto.randomUUID(), role: "OWNER", text: input.instruction, deliveryId: null, state: "COMPLETE", idempotencyKey: input.idempotencyKey, classification, createdAt: at },
          { id: crypto.randomUUID(), role: "ALEXA", text: answer.slice(0, 2_000), deliveryId: null, state: "COMPLETE", idempotencyKey: null, classification: null, createdAt: at }],
      });
      if (!await this.store.saveIfUpdatedAt(replied, session.updatedAt)) throw new EngineeringProjectSessionError("SESSION_CONFLICT", "The project session changed. Refresh and retry.");
      return this.view(context.ownerId, context.companyId, id);
    }
    if (classification === "CONTROL_ACTION" && isActive && active) {
      if (/^(stop|cancel)\b/i.test(input.instruction)) await this.deliveries.cancel(context, active.id);
      else if (/^pause\b/i.test(input.instruction)) await this.deliveries.pause(context, active.id);
      else if (/^(resume|retry)\b/i.test(input.instruction)) await this.deliveries.resume(context, active.id);
      else throw new EngineeringProjectSessionError("CONTROL_ACTION_UNAVAILABLE", "That control action is not available for the current run.");
      const controlled = EngineeringProjectSessionSchema.parse({ ...session,
        updatedAt: new Date(Math.max(this.now().getTime(), new Date(session.updatedAt).getTime() + 1)).toISOString(),
        messages: [...session.messages, { id: crypto.randomUUID(), role: "OWNER", text: input.instruction,
          deliveryId: active.id, state: "COMPLETE", idempotencyKey: input.idempotencyKey, classification, createdAt: at }],
      });
      if (!await this.store.saveIfUpdatedAt(controlled, session.updatedAt)) throw new EngineeringProjectSessionError("SESSION_CONFLICT", "The project session changed. Refresh and retry.");
      return this.view(context.ownerId, context.companyId, id);
    }
    if (classification === "NEW_INDEPENDENT_REQUEST" && isActive && active) {
      if (session.queuedRequests.length >= 100) throw new EngineeringProjectSessionError("QUEUE_FULL", "Finish or cancel a queued project request before adding another.");
      const request = { id: crypto.randomUUID(), sessionId: session.id, repositoryId: session.repositoryId,
        instruction: input.instruction, classification: "NEW_INDEPENDENT_REQUEST" as const, status: "QUEUED" as const,
        deliveryId: null, idempotencyKey: input.idempotencyKey, createdAt: at, updatedAt: at };
      const queued = EngineeringProjectSessionSchema.parse({ ...session,
        updatedAt: new Date(Math.max(this.now().getTime(), new Date(session.updatedAt).getTime() + 1)).toISOString(),
        queuedRequests: [...session.queuedRequests, request],
        messages: [...session.messages, { id: crypto.randomUUID(), role: "OWNER", text: input.instruction,
          deliveryId: null, state: "QUEUED", idempotencyKey: input.idempotencyKey, classification, createdAt: at }],
      });
      if (!await this.store.saveIfUpdatedAt(queued, session.updatedAt)) throw new EngineeringProjectSessionError("SESSION_CONFLICT", "The project session changed. Refresh and retry.");
      return this.view(context.ownerId, context.companyId, id);
    }
    if (session.messages.length >= 500) throw new EngineeringProjectSessionError("SESSION_FULL", "Start a new project session to continue.");
    const next = EngineeringProjectSessionSchema.parse({ ...session, updatedAt: at,
      messages: duplicate ? session.messages : [...session.messages, { id: crypto.randomUUID(), role: "OWNER", text: input.instruction,
        deliveryId: isActive && active ? active.id : null, state: "QUEUED",
        idempotencyKey: input.idempotencyKey, classification, createdAt: at }],
      activeDeliveryId: isActive && active ? active.id : session.activeDeliveryId,
    });
    if (!duplicate && !await this.store.saveIfUpdatedAt(next, session.updatedAt)) throw new EngineeringProjectSessionError("SESSION_CONFLICT", "The project session changed. Refresh and retry.");
    session = next;
    if (isActive && active) {
      await this.deliveries.addInstruction(context, active.id, input);
      const current = await this.require(context.ownerId, context.companyId, id);
      const updated = EngineeringProjectSessionSchema.parse({ ...current,
        updatedAt: new Date(Math.max(this.now().getTime(), new Date(current.updatedAt).getTime() + 1)).toISOString(),
        messages: current.messages.map((message) => message.idempotencyKey === input.idempotencyKey
          ? { ...message, state: "ACTIVE" } : message),
      });
      await this.store.saveIfUpdatedAt(updated, current.updatedAt);
      return this.view(context.ownerId, context.companyId, id);
    }
    const previous = session.deliveryIds.at(-1)
      ? await this.deliveries.store.find(context.ownerId, context.companyId, session.deliveryIds.at(-1)!) : undefined;
    const related = /\b(it|that|those|previous|again|same|just|earlier|we added)\b/i.test(input.instruction);
    const priorContext = related && previous
      ? [`Follow-up to prior project run ${previous.id}: ${previous.sourceRequest.slice(0, 300)}.`,
          `Prior changed files: ${previous.filesChanged.slice(0, 12).join(", ") || "none recorded"}.`]
      : [];
    const delivery = await this.deliveries.create(context, {
      request: input.instruction, repositoryId: repository.id,
      developmentRootWorkspaceId: null, projectName: repository.displayName,
      acceptanceCriteria: [], constraints: priorContext, deadlineAt: null,
      visibleMode: false, idempotencyKey: input.idempotencyKey,
    });
    const current = await this.require(context.ownerId, context.companyId, id);
    const updated = EngineeringProjectSessionSchema.parse({ ...current,
      updatedAt: new Date(Math.max(this.now().getTime(), new Date(current.updatedAt).getTime() + 1)).toISOString(),
      activeDeliveryId: delivery.delivery.id,
      deliveryIds: current.deliveryIds.includes(delivery.delivery.id) ? current.deliveryIds : [...current.deliveryIds, delivery.delivery.id],
      messages: current.messages.map((message) => message.idempotencyKey === input.idempotencyKey
        ? { ...message, deliveryId: delivery.delivery.id, state: "ACTIVE" } : message),
    });
    if (!await this.store.saveIfUpdatedAt(updated, current.updatedAt)) throw new EngineeringProjectSessionError("SESSION_CONFLICT", "The project session changed while starting the run. Refresh to see its objective.");
    return this.view(context.ownerId, context.companyId, id);
  }

  async updateQueue(context: EngineeringDeliveryContext, id: string, body: unknown) {
    const input = UpdateEngineeringProjectSessionQueueRequestSchema.parse(body);
    const session = await this.require(context.ownerId, context.companyId, id);
    const index = session.queuedRequests.findIndex((request) => request.id === input.requestId);
    if (index < 0) throw new EngineeringProjectSessionError("QUEUE_REQUEST_NOT_FOUND", "Queued project request not found.", 404);
    const request = session.queuedRequests[index]!;
    if (input.action === "START_NEXT") return this.startNext(context, id, request.id);
    if (!["QUEUED", "READY", "BLOCKED"].includes(request.status))
      throw new EngineeringProjectSessionError("INVALID_QUEUE_STATE", "Only a request that has not started can be changed.");
    const queue = [...session.queuedRequests];
    if (input.action === "CANCEL") queue[index] = { ...request, status: "CANCELLED", updatedAt: this.now().toISOString() };
    else {
      const active = queue.filter((item) => ["QUEUED", "READY", "BLOCKED"].includes(item.status));
      const activeIndex = active.findIndex((item) => item.id === request.id);
      const destination = input.action === "MOVE_UP" ? activeIndex - 1 : activeIndex + 1;
      if (destination < 0 || destination >= active.length) return this.view(context.ownerId, context.companyId, id);
      const otherIndex = queue.findIndex((item) => item.id === active[destination]!.id);
      [queue[index], queue[otherIndex]] = [queue[otherIndex]!, queue[index]!];
    }
    const updated = EngineeringProjectSessionSchema.parse({ ...session, queuedRequests: queue,
      updatedAt: new Date(Math.max(this.now().getTime(), new Date(session.updatedAt).getTime() + 1)).toISOString() });
    if (!await this.store.saveIfUpdatedAt(updated, session.updatedAt)) throw new EngineeringProjectSessionError("SESSION_CONFLICT", "The project session changed. Refresh and retry.");
    return this.view(context.ownerId, context.companyId, id);
  }

  async startNext(context: EngineeringDeliveryContext, id: string, requestedId?: string) {
    let session = await this.require(context.ownerId, context.companyId, id);
    const active = session.activeDeliveryId
      ? await this.deliveries.store.find(context.ownerId, context.companyId, session.activeDeliveryId)
      : undefined;
    if (active && !terminalDelivery(active.status))
      throw new EngineeringProjectSessionError("PROJECT_RUN_ACTIVE", "The current project modification must finish before the queued request starts.");
    const pending = session.queuedRequests.filter((request) => ["QUEUED", "READY", "BLOCKED"].includes(request.status));
    const request = pending[0];
    if (!request || (requestedId && request.id !== requestedId))
      throw new EngineeringProjectSessionError("QUEUE_ORDER_CONFLICT", "Only the first queued request can start.");
    const repository = await this.runtime.findRepository(context.ownerId, context.companyId, session.repositoryId);
    if (!repository || repository.status !== "ACTIVE") throw new EngineeringProjectSessionError("REPOSITORY_NOT_FOUND", "The selected repository is no longer active in this company.");
    const at = this.now().toISOString();
    const ready = EngineeringProjectSessionSchema.parse({ ...session, activeDeliveryId: null,
      queuedRequests: session.queuedRequests.map((item) => item.id === request.id ? { ...item, status: "READY", updatedAt: at } : item),
      updatedAt: new Date(Math.max(this.now().getTime(), new Date(session.updatedAt).getTime() + 1)).toISOString() });
    if (!await this.store.saveIfUpdatedAt(ready, session.updatedAt)) throw new EngineeringProjectSessionError("SESSION_CONFLICT", "The project session changed. Refresh and retry.");
    session = ready;
    try {
      const delivery = await this.deliveries.create(context, {
        request: request.instruction, repositoryId: repository.id, developmentRootWorkspaceId: null,
        projectName: repository.displayName, acceptanceCriteria: [], constraints: ["Started sequentially from the project-session queue."],
        deadlineAt: null, visibleMode: false, idempotencyKey: request.idempotencyKey,
      });
      const current = await this.require(context.ownerId, context.companyId, id);
      const startedAt = this.now().toISOString();
      const started = EngineeringProjectSessionSchema.parse({ ...current, activeDeliveryId: delivery.delivery.id,
        deliveryIds: current.deliveryIds.includes(delivery.delivery.id) ? current.deliveryIds : [...current.deliveryIds, delivery.delivery.id],
        queuedRequests: current.queuedRequests.map((item) => item.id === request.id
          ? { ...item, status: "STARTED", deliveryId: delivery.delivery.id, updatedAt: startedAt } : item),
        messages: current.messages.map((message) => message.idempotencyKey === request.idempotencyKey
          ? { ...message, deliveryId: delivery.delivery.id, state: "ACTIVE" } : message),
        updatedAt: new Date(Math.max(this.now().getTime(), new Date(current.updatedAt).getTime() + 1)).toISOString(),
      });
      if (!await this.store.saveIfUpdatedAt(started, current.updatedAt)) throw new EngineeringProjectSessionError("SESSION_CONFLICT", "The project session changed while starting the queued request.");
      return this.view(context.ownerId, context.companyId, id);
    } catch (error) {
      const current = await this.require(context.ownerId, context.companyId, id);
      const blocked = EngineeringProjectSessionSchema.parse({ ...current,
        queuedRequests: current.queuedRequests.map((item) => item.id === request.id
          ? { ...item, status: "BLOCKED", updatedAt: this.now().toISOString() } : item),
        updatedAt: new Date(Math.max(this.now().getTime(), new Date(current.updatedAt).getTime() + 1)).toISOString(),
      });
      await this.store.saveIfUpdatedAt(blocked, current.updatedAt);
      throw error;
    }
  }

  async handleDeliveryTerminal(context: EngineeringDeliveryContext, deliveryId: string) {
    const sessions = await this.store.list(context.ownerId, context.companyId);
    const session = sessions.find((item) => item.activeDeliveryId === deliveryId);
    if (!session) return;
    const delivery = await this.deliveries.store.find(context.ownerId, context.companyId, deliveryId);
    if (!delivery || !terminalDelivery(delivery.status)) return;
    const completed = ["DONE", "DONE_WITH_WARNINGS"].includes(delivery.status);
    const at = this.now().toISOString();
    const updated = EngineeringProjectSessionSchema.parse({ ...session, activeDeliveryId: null,
      queuedRequests: session.queuedRequests.map((request) => request.deliveryId === deliveryId
        ? { ...request, status: completed ? "COMPLETED" : delivery.status === "CANCELLED" ? "CANCELLED" : "BLOCKED", updatedAt: at }
        : request),
      updatedAt: new Date(Math.max(this.now().getTime(), new Date(session.updatedAt).getTime() + 1)).toISOString(),
    });
    if (!await this.store.saveIfUpdatedAt(updated, session.updatedAt) || !completed) return;
    const next = updated.queuedRequests.find((request) => ["QUEUED", "READY"].includes(request.status));
    if (next) await this.startNext(context, updated.id, next.id);
  }

  private async require(ownerId: string, companyId: string, id: string) {
    const value = await this.store.find(ownerId, companyId, id);
    if (!value) throw new EngineeringProjectSessionError("SESSION_NOT_FOUND", "Project session not found in this company.", 404);
    return value;
  }
}
