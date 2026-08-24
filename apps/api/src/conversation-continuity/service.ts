import {
  ConversationActionProposalSchema,
  ConversationContinuityRecordSchema,
  ContinuityReferenceSchema,
  PendingConversationIntentSchema,
  type ActiveContext,
  type ContinuityReference,
  type ConversationActionProposal,
  type ConversationContinuityRecord,
  type ConversationContextReference,
} from "@alexa-control/shared";

import type { VoiceStore } from "../voice/store.js";

const PENDING_TTL_MS = 10 * 60_000;
const PROPOSAL_TTL_MS = 5 * 60_000;
const REFERENCE_TTL_MS = 15 * 60_000;
const normalize = (value: string) =>
  value.trim().replace(/\s+/g, " ").replace(/[.!?]+$/g, "").toLowerCase();
const isoAfter = (date: Date, milliseconds: number) =>
  new Date(date.getTime() + milliseconds).toISOString();
const expired = (value: string, now: Date) => new Date(value).getTime() <= now.getTime();
const cancellations = /^(?:no|nope|cancel(?: that)?|forget it|never mind|nevermind|don['’]?t do that|stop)$/i;
const confirmations = /^(?:yes|yeah|yep|okay|ok|go ahead|confirm|do it)$/i;
const topicSwitch = /^(?:actually|instead|forget that|never mind|new question)\b/i;
const repeatRequest = /^(?:repeat that|say that again|what did you just say)$/i;
const ambiguousUndo = /^(?:undo|undo that|reverse that|take that back)$/i;
const destructiveReference = /\b(?:delete|remove|erase|overwrite|replace|send|share)\b/i;
const referentialTarget = /\b(?:this|that|it|these|those|him|her|them|the other one|the previous option|the one from before)\b/i;
const isApplicationInteractionProposal = (
  proposal: ConversationActionProposal | null | undefined,
) => proposal?.canonicalIntent.startsWith("application_interaction.") === true;

const referenceHash = (value: string) => {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const numberWord = (value: string) => {
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
  };
  return Number(value) || words[value.toLowerCase()] || 0;
};

const parseTime = (value: string) => {
  const match = value.match(/(?:\bat\s+)?\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const period = match[3]!.toLowerCase().startsWith("p") ? "PM" : "AM";
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return { hour, minute, label: `${match[1]}:${String(minute).padStart(2, "0")} ${period}` };
};

const parseDurationMinutes = (value: string) => {
  const match = value.match(/\b(\d+|one|two|three|four|five|six|seven|eight)\s*(hours?|hrs?|minutes?|mins?)\b/i);
  if (!match) return null;
  const amount = numberWord(match[1]!);
  return /hour|hr/i.test(match[2]!) ? amount * 60 : amount;
};

const parseDate = (value: string) => {
  const relative = value.match(/\b(today|tomorrow)\b/i)?.[1];
  if (relative) return relative.toLowerCase();
  const weekday = value.match(/\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)?.[1];
  return weekday?.toLowerCase() ?? null;
};

const nextQuestion = (slot: string) => {
  const questions: Record<string, string> = {
    person: "Who should the meeting be with?",
    date: "What date?",
    time: "What time?",
    durationMinutes: "How long?",
    recipient: "Which person do you mean?",
    file: "Which file?",
    format: "PDF or spreadsheet?",
  };
  return questions[slot] ?? `What should I use for ${slot}?`;
};

export interface ContinuityTurnInput {
  ownerId: string;
  conversationId: string;
  turnId: string;
  deviceId: string | null;
  voiceSessionId: string | null;
  transcript: string;
  activeContext: ActiveContext | null;
  contextReferences: ConversationContextReference[];
}

export interface ContinuityTurnResolution {
  handled: boolean;
  duplicate: boolean;
  responseText: string | null;
  canonicalRequest: string | null;
  resolvedReference: ContinuityReference | null;
  state: ConversationContinuityRecord;
}

export class ConversationContinuityService {
  constructor(
    readonly store: VoiceStore,
    readonly now: () => Date = () => new Date(),
  ) {}

  async resolveTurn(input: ContinuityTurnInput): Promise<ContinuityTurnResolution> {
    return this.store.withConversationContinuityLock(
      input.ownerId,
      input.conversationId,
      () => this.resolveTurnLocked(input),
    );
  }

  private async resolveTurnLocked(input: ContinuityTurnInput): Promise<ContinuityTurnResolution> {
    const now = this.now();
    let state = await this.stateFor(input, now);
    const claimed = await this.store.claimConversationTurn(
      input.ownerId,
      input.conversationId,
      input.turnId,
      now.toISOString(),
    );
    const replay = state.processedTurns.find((turn) => turn.turnId === input.turnId);
    if (!claimed || replay)
      return {
        handled: true,
        duplicate: true,
        responseText: replay?.responseText ?? "That turn was already processed.",
        canonicalRequest: null,
        resolvedReference: null,
        state,
      };

    state = this.expireState(state, now);
    state = this.mergeContextReferences(state, input, now);
    const text = normalize(input.transcript);

    if (repeatRequest.test(text)) {
      const responseText = state.lastAssistantResponse ?? "There is no recent response to repeat.";
      return this.handled(state, input.turnId, responseText, null, ["RECENT_REFERENCE"], now);
    }

    if (
      state.actionProposal?.status === "PROPOSED" &&
      !confirmations.test(text) &&
      !cancellations.test(text)
    )
      state.actionProposal = {
        ...state.actionProposal,
        status: "CANCELLED",
        updatedAt: now.toISOString(),
      };

    if (ambiguousUndo.test(text))
      return this.handled(
        state,
        input.turnId,
        "I can’t safely undo an unspecified action. Tell me exactly what should be reversed.",
        null,
        ["CLARIFY"],
        now,
      );

    if (cancellations.test(text)) {
      const hadPending = state.pendingIntent?.status === "AWAITING_CLARIFICATION";
      const hadProposal = state.actionProposal?.status === "PROPOSED";
      if (state.pendingIntent && hadPending)
        state.pendingIntent = { ...state.pendingIntent, status: "CANCELLED", updatedAt: now.toISOString() };
      if (state.actionProposal && hadProposal)
        state.actionProposal = { ...state.actionProposal, status: "CANCELLED", updatedAt: now.toISOString() };
      const responseText = hadPending || hadProposal ? "Cancelled. I won’t continue that request." : "There is nothing pending to cancel.";
      return this.handled(state, input.turnId, responseText, null, ["PENDING_SLOT"], now);
    }

    if (topicSwitch.test(text) && state.pendingIntent?.status === "AWAITING_CLARIFICATION") {
      state.pendingIntent = { ...state.pendingIntent, status: "CANCELLED", updatedAt: now.toISOString() };
      await this.save(state, now);
      return { handled: false, duplicate: false, responseText: null, canonicalRequest: null, resolvedReference: null, state };
    }

    if (state.pendingIntent?.status === "AWAITING_CLARIFICATION") {
      if (
        !this.sameCaptureContext(
          state.pendingIntent,
          input,
          state.pendingIntent.activeContextReferenceId !== null,
        )
      )
        return this.handled(
          state,
          input.turnId,
          "That clarification belongs to a different device session. Please restart the request here.",
          null,
          ["CLARIFY"],
          now,
        );
      const pendingResult = await this.resolvePending(state, input, now);
      if (pendingResult) return pendingResult;
    }

    if (destructiveReference.test(text) && referentialTarget.test(text)) {
      const scopedCandidates = state.references.filter(
        (item) =>
          (item.deviceId === null || item.deviceId === input.deviceId) &&
          ["selection", "file", "person", "option"].includes(item.kind),
      );
      const explicitCurrentSelection =
        /\b(?:this|these)\b/i.test(text) &&
        scopedCandidates[0]?.source === "ACTIVE_SELECTION" &&
        scopedCandidates[0]?.kind === "file";
      if (!explicitCurrentSelection && scopedCandidates.length !== 1)
        return this.handled(
          state,
          input.turnId,
          "Which exact target do you mean?",
          null,
          ["CLARIFY"],
          now,
        );
    }

    if (confirmations.test(text)) {
      const proposal = state.actionProposal;
      const appInteractionProposal = proposal
        ? isApplicationInteractionProposal(proposal)
        : false;
      const canRetryApprovedInteraction =
        appInteractionProposal && proposal?.status === "CONFIRMED";
      if (
        !proposal ||
        (proposal.status !== "PROPOSED" && !canRetryApprovedInteraction)
      )
        return this.handled(state, input.turnId, "There is no current action awaiting confirmation.", null, ["CLARIFY"], now);
      if (expired(proposal.expiresAt, now)) {
        state.actionProposal = { ...proposal, status: "EXPIRED", updatedAt: now.toISOString() };
        return this.handled(state, input.turnId, "That action proposal has expired. Please ask again so I can validate the current targets.", null, ["ACTION_PROPOSAL", "CLARIFY"], now);
      }
      if (
        !this.sameCaptureContext(
          proposal,
          input,
          !appInteractionProposal &&
            (proposal.sourceContextReferenceId !== null ||
              proposal.targets.some((target) =>
                ["ACTIVE_SELECTION", "ACTIVE_CONTEXT"].includes(target.source),
              )),
        )
      )
        return this.handled(state, input.turnId, "That proposal belongs to a different device context. Please ask again here.", null, ["ACTION_PROPOSAL", "CLARIFY"], now);
      const currentReferenceIds = this.currentContextReferenceIds(input);
      if (
        !appInteractionProposal &&
        proposal.sourceContextReferenceId &&
        !currentReferenceIds.has(proposal.sourceContextReferenceId)
      ) {
        state.actionProposal = {
          ...proposal,
          status: "CANCELLED",
          updatedAt: now.toISOString(),
        };
        return this.handled(state, input.turnId, "The referenced context has changed, so I won’t run the old proposal. Please ask again.", null, ["ACTION_PROPOSAL", "CLARIFY"], now);
      }
      const staleTarget =
        !appInteractionProposal &&
        proposal.targets.some(
          (target) =>
            ["ACTIVE_SELECTION", "ACTIVE_CONTEXT"].includes(target.source) &&
            !currentReferenceIds.has(target.id),
        );
      if (staleTarget) {
        state.actionProposal = {
          ...proposal,
          status: "CANCELLED",
          updatedAt: now.toISOString(),
        };
        return this.handled(state, input.turnId, "A proposed target is no longer current, so I won’t continue. Please ask again.", null, ["ACTION_PROPOSAL", "CLARIFY"], now);
      }
      state.actionProposal = { ...proposal, status: "CONFIRMED", updatedAt: now.toISOString() };
      return this.handled(state, input.turnId, null, proposal.canonicalRequest, ["ACTION_PROPOSAL"], now);
    }

    const calendar = this.calendarPending(input, now);
    if (calendar) {
      state.pendingIntent = calendar;
      const question = nextQuestion(calendar.missingSlots[0]!);
      return this.handled(state, input.turnId, question, null, ["PENDING_SLOT"], now);
    }

    const send = this.sendPending(input, state.references, now);
    if (send) {
      state.pendingIntent = send;
      const question = nextQuestion(send.missingSlots[0]!);
      return this.handled(state, input.turnId, question, null, ["PENDING_SLOT", "ACTIVE_SELECTION"], now);
    }

    const reference = this.resolveReference(input.transcript, state.references, input.deviceId);
    if (reference) {
      state.resolutionPath = [reference.source];
    }
    state.topic = this.nextTopic(state.topic, input.transcript, reference);
    state.processedTurns = [
      {
        turnId: input.turnId,
        handled: false,
        responseText: null,
        canonicalRequest: null,
        processedAt: now.toISOString(),
      },
      ...state.processedTurns.filter((turn) => turn.turnId !== input.turnId),
    ].slice(0, 50);
    await this.save(state, now);
    return { handled: false, duplicate: false, responseText: null, canonicalRequest: null, resolvedReference: reference, state };
  }

  async recordOutcome(input: {
    ownerId: string;
    conversationId: string;
    turnId: string;
    responseText: string | null;
    canonicalRequest: string | null;
    commandId?: string | null;
  }) {
    return this.store.withConversationContinuityLock(
      input.ownerId,
      input.conversationId,
      () => this.recordOutcomeLocked(input),
    );
  }

  async claimConfirmedProposal(input: {
    ownerId: string;
    conversationId: string;
    matches: (proposal: ConversationActionProposal) => boolean;
  }) {
    return this.store.withConversationContinuityLock(
      input.ownerId,
      input.conversationId,
      async () => {
        const state = await this.store.getConversationContinuity(
          input.ownerId,
          input.conversationId,
        );
        const proposal = state?.actionProposal;
        if (
          !state ||
          !proposal ||
          proposal.status !== "CONFIRMED" ||
          expired(proposal.expiresAt, this.now()) ||
          !input.matches(proposal)
        )
          return false;
        state.actionProposal = {
          ...proposal,
          status: "PLANNED",
          updatedAt: this.now().toISOString(),
        };
        await this.save(state, this.now());
        return true;
      },
    );
  }

  async releaseProposalClaimForApproval(input: {
    ownerId: string;
    conversationId: string;
    proposalId: string;
  }) {
    return this.store.withConversationContinuityLock(
      input.ownerId,
      input.conversationId,
      async () => {
        const state = await this.store.getConversationContinuity(
          input.ownerId,
          input.conversationId,
        );
        const proposal = state?.actionProposal;
        if (
          !state ||
          !proposal ||
          proposal.id !== input.proposalId ||
          proposal.status !== "PLANNED" ||
          proposal.governedCommandId !== null
        )
          return false;
        const now = this.now();
        state.actionProposal = {
          ...proposal,
          status: "CONFIRMED",
          updatedAt: now.toISOString(),
        };
        await this.save(state, now);
        return true;
      },
    );
  }

  async recordGovernedInteractionSettlement(input: {
    ownerId: string;
    proposalId: string;
    executionRequestId: string;
    status: "SUCCEEDED" | "FAILED" | "CANCELLED" | "TIMED_OUT";
  }) {
    const records = await this.store.listConversationContinuity(input.ownerId, 500);
    const record = records.find(
      (item) => item.actionProposal?.id === input.proposalId,
    );
    if (!record) return false;
    return this.store.withConversationContinuityLock(
      input.ownerId,
      record.conversationId,
      async () => {
        const state = await this.store.getConversationContinuity(
          input.ownerId,
          record.conversationId,
        );
        const proposal = state?.actionProposal;
        if (
          !state ||
          !proposal ||
          proposal.id !== input.proposalId ||
          proposal.status !== "PLANNED"
        )
          return false;
        const now = this.now();
        state.actionProposal = {
          ...proposal,
          governedCommandId: input.executionRequestId,
          status: input.status === "SUCCEEDED" ? "EXECUTED" : "CANCELLED",
          updatedAt: now.toISOString(),
        };
        await this.save(state, now);
        return true;
      },
    );
  }

  private async recordOutcomeLocked(input: {
    ownerId: string;
    conversationId: string;
    turnId: string;
    responseText: string | null;
    canonicalRequest: string | null;
    commandId?: string | null;
  }) {
    const state = await this.store.getConversationContinuity(input.ownerId, input.conversationId);
    if (!state) return;
    const now = this.now();
    const existing = state.processedTurns.find((turn) => turn.turnId === input.turnId);
    if (!existing) return;
    const processed = {
      turnId: input.turnId,
      handled: existing?.handled ?? false,
      responseText: input.responseText,
      canonicalRequest: input.canonicalRequest,
      processedAt: now.toISOString(),
    };
    state.processedTurns = state.processedTurns.map((turn) =>
      turn.turnId === input.turnId ? processed : turn,
    );
    state.lastAssistantResponse = input.responseText;
    if (input.canonicalRequest && state.pendingIntent?.status === "READY")
      state.pendingIntent = { ...state.pendingIntent, status: "COMPLETED", updatedAt: now.toISOString() };
    if (
      input.canonicalRequest &&
      (state.actionProposal?.status === "CONFIRMED" ||
        state.actionProposal?.status === "PLANNED") &&
      !isApplicationInteractionProposal(state.actionProposal) &&
      state.actionProposal.governedCommandId === null
    )
      state.actionProposal = {
        ...state.actionProposal,
        status: "PLANNED",
        governedCommandId: input.commandId ?? null,
        updatedAt: now.toISOString(),
      };
    await this.save(state, now);
  }

  async createProposal(input: {
    ownerId: string;
    conversationId: string;
    deviceId: string | null;
    voiceSessionId?: string | null;
    canonicalIntent: string;
    canonicalRequest: string;
    parameters?: Record<string, unknown>;
    targets?: ContinuityReference[];
    riskLevel: ConversationActionProposal["riskLevel"];
    sourceContextReferenceId?: string | null;
    sourceTurnId?: string | null;
  }) {
    return this.store.withConversationContinuityLock(
      input.ownerId,
      input.conversationId,
      () => this.createProposalLocked(input),
    );
  }

  private async createProposalLocked(input: {
    ownerId: string;
    conversationId: string;
    deviceId: string | null;
    voiceSessionId?: string | null;
    canonicalIntent: string;
    canonicalRequest: string;
    parameters?: Record<string, unknown>;
    targets?: ContinuityReference[];
    riskLevel: ConversationActionProposal["riskLevel"];
    sourceContextReferenceId?: string | null;
    sourceTurnId?: string | null;
  }) {
    const now = this.now();
    const existing = await this.store.getConversationContinuity(input.ownerId, input.conversationId);
    if (!existing) throw new Error("Conversation continuity state does not exist.");
    if (
      input.sourceTurnId &&
      existing.processedTurns[0]?.turnId !== input.sourceTurnId
    )
      return null;
    if (existing.pendingIntent?.status === "AWAITING_CLARIFICATION")
      existing.pendingIntent = {
        ...existing.pendingIntent,
        status: "CANCELLED",
        updatedAt: now.toISOString(),
      };
    existing.actionProposal = ConversationActionProposalSchema.parse({
      id: crypto.randomUUID(),
      sourceTurnId: input.sourceTurnId ?? null,
      governedCommandId: null,
      deviceId: input.deviceId,
      voiceSessionId: input.voiceSessionId ?? existing.voiceSessionId,
      canonicalIntent: input.canonicalIntent,
      canonicalRequest: input.canonicalRequest,
      parameters: input.parameters ?? {},
      targets: input.targets ?? [],
      sourceContextReferenceId: input.sourceContextReferenceId ?? null,
      riskLevel: input.riskLevel,
      status: "PROPOSED",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: isoAfter(now, PROPOSAL_TTL_MS),
    });
    await this.save(existing, now);
    return existing.actionProposal;
  }

  resolveReference(transcript: string, references: ContinuityReference[], deviceId?: string | null) {
    const text = normalize(transcript);
    const scopedReferences = references.filter(
      (item) => deviceId === undefined || item.deviceId === null || item.deviceId === deviceId,
    );
    const ordinal = text.match(/\b(?:the\s+)?(first|second|third|last)\s+one\b/i)?.[1]?.toLowerCase();
    if (ordinal) {
      const candidates = scopedReferences.filter((item) => item.kind === "option" || item.kind === "file");
      const index = ordinal === "first" ? 0 : ordinal === "second" ? 1 : ordinal === "third" ? 2 : candidates.length - 1;
      const candidate = candidates[index];
      return candidate ? ContinuityReferenceSchema.parse({ ...candidate, source: "ORDINAL_REFERENCE", confidence: 1 }) : null;
    }
    if (/\b(?:he|him|his|she|her|hers|they|them)\b/i.test(text)) return null;
    const selections = scopedReferences.filter((item) => item.source === "ACTIVE_SELECTION");
    const selectable = scopedReferences.filter(
      (item) => item.kind === "option" || item.kind === "file" || item.kind === "selection",
    );
    if (/\b(?:the other one|the previous option|the one from before)\b/i.test(text))
      return selectable[1] ?? null;
    const described = text.match(/\b(?:the\s+)?([a-z0-9_-]+)\s+one\b/i)?.[1];
    if (described && !["this", "that", "first", "second", "third", "last", "other"].includes(described)) {
      const matches = selectable.filter((item) =>
        `${item.label} ${item.value}`.toLowerCase().includes(described),
      );
      return matches.length === 1 ? matches[0]! : null;
    }
    const compatible = /\b(?:this|that)\s+file\b/i.test(text)
      ? scopedReferences.filter((item) => ["file", "document", "selection"].includes(item.kind))
      : /\b(?:this|that)\s+page\b/i.test(text)
        ? scopedReferences.filter((item) => item.kind === "document")
        : /\b(?:this|that)\s+(?:error|function)\b/i.test(text)
          ? scopedReferences.filter((item) => ["selection", "other"].includes(item.kind))
          : scopedReferences;
    if (/\b(?:that|that one|that file|that page|that error|that function)\b/i.test(text))
      return selections[1] ?? selections[0] ?? (compatible.length === 1 ? compatible[0]! : null);
    if (/\b(?:this|it|this one|this file|this page|this error|this function)\b/i.test(text))
      return selections[0] ?? (compatible.length === 1 ? compatible[0]! : null);
    return null;
  }

  private async resolvePending(state: ConversationContinuityRecord, input: ContinuityTurnInput, now: Date) {
    const pending = state.pendingIntent!;
    const slot = pending.missingSlots[0];
    if (!slot) return null;
    let value: unknown = null;
    if (slot === "time") value = parseTime(input.transcript);
    else if (slot === "durationMinutes") value = parseDurationMinutes(input.transcript);
    else if (slot === "date") value = parseDate(input.transcript);
    else if (slot === "recipient" || slot === "person") {
      const candidate = input.transcript.trim().replace(/[.!?]+$/g, "");
      value = this.validPersonAnswer(candidate) ? candidate : null;
    }
    else if (slot === "file") {
      value =
        this.resolveReference(input.transcript, state.references, input.deviceId)?.value ??
        (/^(?:this|that|it|the report|report)$/i.test(input.transcript.trim())
          ? null
          : this.validFileAnswer(input.transcript)
            ? input.transcript.trim().replace(/[.!?]+$/g, "")
            : null);
    } else if (slot === "format") {
      value = input.transcript.match(/\b(pdf|spreadsheet|xlsx|excel)\b/i)?.[1]?.toLowerCase() ?? null;
    }
    if (value === null || value === "") return this.handled(state, input.turnId, nextQuestion(slot), null, ["PENDING_SLOT", "CLARIFY"], now);
    const resolvedSlots = { ...pending.resolvedSlots, [slot]: value };
    const missingSlots = pending.missingSlots.slice(1);
    const updated = PendingConversationIntentSchema.parse({
      ...pending,
      resolvedSlots,
      missingSlots,
      status: missingSlots.length ? "AWAITING_CLARIFICATION" : "READY",
      updatedAt: now.toISOString(),
    });
    state.pendingIntent = updated;
    if (missingSlots.length)
      return this.handled(state, input.turnId, nextQuestion(missingSlots[0]!), null, ["PENDING_SLOT"], now);
    if (
      updated.activeContextReferenceId &&
      !this.currentContextReferenceIds(input).has(updated.activeContextReferenceId)
    ) {
      state.pendingIntent = {
        ...updated,
        status: "CANCELLED",
        updatedAt: now.toISOString(),
      };
      return this.handled(
        state,
        input.turnId,
        "The selected source is no longer current. Please select it again and restart the request.",
        null,
        ["PENDING_SLOT", "CLARIFY"],
        now,
      );
    }
    const canonicalRequest = this.canonicalRequest(updated);
    return this.handled(state, input.turnId, null, canonicalRequest, ["PENDING_SLOT"], now);
  }

  private calendarPending(input: ContinuityTurnInput, now: Date) {
    if (!/\b(?:schedule|create|add|set up)\b.{0,30}\bmeeting\b/i.test(input.transcript)) return null;
    const person = input.transcript.match(/\bwith\s+(.+?)(?=\s+(?:today|tomorrow|on\s+\w+|at\s+\d|for\s+\d|for\s+one)\b|[.!?]|$)/i)?.[1]?.trim() ?? null;
    const date = parseDate(input.transcript);
    const time = parseTime(input.transcript);
    const durationMinutes = parseDurationMinutes(input.transcript);
    const resolvedSlots: Record<string, unknown> = {};
    if (person) resolvedSlots.person = person;
    if (date) resolvedSlots.date = date;
    if (time) resolvedSlots.time = time;
    if (durationMinutes) resolvedSlots.durationMinutes = durationMinutes;
    const missingSlots = ["person", "date", "time", "durationMinutes"].filter((slot) => resolvedSlots[slot] === undefined);
    if (!missingSlots.length) return null;
    return PendingConversationIntentSchema.parse({
      id: crypto.randomUUID(),
      deviceId: input.deviceId,
      voiceSessionId: input.voiceSessionId,
      canonicalIntent: "CREATE_EVENT",
      originalUtterance: input.transcript,
      resolvedSlots,
      missingSlots,
      activeContextReferenceId: null,
      status: "AWAITING_CLARIFICATION",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: isoAfter(now, PENDING_TTL_MS),
    });
  }

  private sendPending(input: ContinuityTurnInput, references: ContinuityReference[], now: Date) {
    const match = input.transcript.match(/^send\s+(.+?)\s+to\s+(.+?)[.!?]?$/i);
    if (!match) return null;
    const selection = references.find(
      (item) =>
        item.source === "ACTIVE_SELECTION" &&
        item.kind === "file" &&
        item.deviceId !== null &&
        item.deviceId === input.deviceId,
    );
    const requestedFile = match[1]!.trim();
    const vagueReport = /^(?:the\s+)?report$/i.test(requestedFile);
    const file = /^(?:this|that|it|this file|that file)$/i.test(requestedFile)
      ? selection?.value ?? null
      : vagueReport
        ? null
        : requestedFile;
    const recipientCandidate = match[2]!.trim();
    const resolvedSlots: Record<string, unknown> = {};
    if (file) resolvedSlots.file = file;
    if (recipientCandidate.split(/\s+/).length > 1) resolvedSlots.recipient = recipientCandidate;
    else resolvedSlots.recipientCandidate = recipientCandidate;
    const missingSlots = [
      resolvedSlots.recipient ? null : "recipient",
      file ? null : "file",
      vagueReport ? "format" : null,
    ].filter((slot): slot is string => Boolean(slot));
    if (!missingSlots.length) return null;
    return PendingConversationIntentSchema.parse({
      id: crypto.randomUUID(),
      deviceId: input.deviceId,
      voiceSessionId: input.voiceSessionId,
      canonicalIntent: "SEND_FILE",
      originalUtterance: input.transcript,
      resolvedSlots,
      missingSlots,
      activeContextReferenceId: selection?.id ?? null,
      status: "AWAITING_CLARIFICATION",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: isoAfter(now, PENDING_TTL_MS),
    });
  }

  private canonicalRequest(pending: ConversationContinuityRecord["pendingIntent"] & {}) {
    const slotText = (key: string) => {
      const value = pending.resolvedSlots[key];
      return typeof value === "string" || typeof value === "number" ? String(value) : "";
    };
    if (pending.canonicalIntent === "CREATE_EVENT") {
      const time = pending.resolvedSlots.time as { label?: string } | undefined;
      return `Schedule a ${slotText("durationMinutes")} minute meeting with ${slotText("person")} ${slotText("date")} at ${time?.label ?? "the specified time"}.`;
    }
    if (pending.canonicalIntent === "SEND_FILE") {
      const formatValue = slotText("format");
      const format = formatValue ? ` (${formatValue})` : "";
      return `Send ${slotText("file")}${format} to ${slotText("recipient")}.`;
    }
    return pending.originalUtterance;
  }

  private mergeContextReferences(state: ConversationContinuityRecord, input: ContinuityTurnInput, now: Date) {
    const additions: ContinuityReference[] = [];
    const selectionReference = this.selectionReference(input, now);
    if (selectionReference) additions.push(selectionReference);
    if (input.activeContext?.document?.title)
      additions.push(ContinuityReferenceSchema.parse({
        id: input.activeContext.document.uri ?? `${input.deviceId ?? input.conversationId}#document`,
        kind: "document",
        label: input.activeContext.document.title,
        value: input.activeContext.document.title,
        source: "ACTIVE_CONTEXT",
        confidence: input.activeContext.confidence,
        deviceId: input.deviceId,
        resolvedAt: now.toISOString(),
      }));
    for (const reference of input.contextReferences.slice(0, 8))
      if (!additions.some((item) => item.id === reference.id))
        additions.push(ContinuityReferenceSchema.parse({
          id: reference.id,
          kind: reference.source === "SELECTION" ? "selection" : reference.source === "DOCUMENT" ? "document" : "other",
          label: reference.label,
          value: reference.label,
          source: reference.source === "SELECTION" ? "ACTIVE_SELECTION" : "ACTIVE_CONTEXT",
          confidence: reference.confidence,
          deviceId: input.deviceId,
          resolvedAt: now.toISOString(),
        }));
    state.references = [...additions, ...state.references.filter((old) => !additions.some((item) => item.id === old.id))].slice(0, 20);
    return state;
  }

  private nextTopic(current: string | null, transcript: string, reference: ContinuityReference | null) {
    if (reference) return `${reference.kind}: ${reference.label}`.slice(0, 500);
    if (/^(?:why|how|what about|which one)\b/i.test(transcript.trim())) return current;
    return transcript.trim().slice(0, 500) || current;
  }

  private expireState(state: ConversationContinuityRecord, now: Date) {
    state.references = state.references.filter(
      (reference) =>
        now.getTime() - new Date(reference.resolvedAt).getTime() < REFERENCE_TTL_MS,
    );
    if (state.pendingIntent && ["AWAITING_CLARIFICATION", "READY"].includes(state.pendingIntent.status) && expired(state.pendingIntent.expiresAt, now))
      state.pendingIntent = { ...state.pendingIntent, status: "EXPIRED", updatedAt: now.toISOString() };
    if (state.actionProposal?.status === "PROPOSED" && expired(state.actionProposal.expiresAt, now))
      state.actionProposal = { ...state.actionProposal, status: "EXPIRED", updatedAt: now.toISOString() };
    return state;
  }

  private async stateFor(input: ContinuityTurnInput, now: Date) {
    const existing = await this.store.getConversationContinuity(input.ownerId, input.conversationId);
    if (existing)
      return {
        ...existing,
        deviceId: input.deviceId,
        voiceSessionId: input.voiceSessionId,
      };
    const state = ConversationContinuityRecordSchema.parse({
      id: input.conversationId,
      ownerId: input.ownerId,
      conversationId: input.conversationId,
      deviceId: input.deviceId,
      voiceSessionId: input.voiceSessionId,
      topic: null,
      references: [],
      pendingIntent: null,
      actionProposal: null,
      lastAssistantResponse: null,
      processedTurns: [],
      resolutionPath: [],
      updatedAt: now.toISOString(),
    });
    await this.store.saveConversationContinuity(state);
    return state;
  }

  private async handled(
    state: ConversationContinuityRecord,
    turnId: string,
    responseText: string | null,
    canonicalRequest: string | null,
    path: ConversationContinuityRecord["resolutionPath"],
    now: Date,
  ): Promise<ContinuityTurnResolution> {
    state.resolutionPath = path;
    state.processedTurns = [{ turnId, handled: true, responseText, canonicalRequest, processedAt: now.toISOString() }, ...state.processedTurns].slice(0, 50);
    await this.save(state, now);
    return { handled: true, duplicate: false, responseText, canonicalRequest, resolvedReference: null, state };
  }

  private sameCaptureContext(
    state: { deviceId: string | null; voiceSessionId: string | null },
    input: ContinuityTurnInput,
    contextBound: boolean,
  ) {
    if (contextBound)
      return state.deviceId !== null && state.deviceId === input.deviceId;
    if (state.deviceId === input.deviceId) return true;
    return state.voiceSessionId !== null && state.voiceSessionId === input.voiceSessionId;
  }

  private currentContextReferenceIds(input: ContinuityTurnInput) {
    const ids = new Set(input.contextReferences.map((reference) => reference.id));
    const selection = input.activeContext?.selection?.text;
    if (selection)
      ids.add(`${input.deviceId ?? input.conversationId}#selection-${referenceHash(selection)}`);
    if (input.activeContext?.document?.uri) ids.add(input.activeContext.document.uri);
    return ids;
  }

  private selectionReference(input: ContinuityTurnInput, now: Date) {
    const selection = input.activeContext?.selection?.text?.trim();
    if (!selection) return null;
    const isFile = /(?:^|\/)\S+\.[a-z0-9]{1,8}$/i.test(selection);
    const opaqueId = `${input.deviceId ?? input.conversationId}#selection-${referenceHash(selection)}`;
    return ContinuityReferenceSchema.parse({
      id: opaqueId,
      kind: isFile ? "file" : "selection",
      label: isFile ? selection.slice(0, 500) : "Selected content",
      value: isFile ? selection.slice(0, 2_000) : opaqueId,
      source: "ACTIVE_SELECTION",
      confidence: input.activeContext?.confidence ?? 1,
      deviceId: input.deviceId,
      resolvedAt: now.toISOString(),
    });
  }

  private validPersonAnswer(value: string) {
    return (
      /^[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){0,4}$/u.test(value) &&
      !/^(?:what|why|how|when|where|who|open|send|delete|cancel|stop)\b/i.test(value)
    );
  }

  private validFileAnswer(value: string) {
    const normalizedValue = value.trim().replace(/[.!?]+$/g, "");
    return (
      normalizedValue.length > 0 &&
      !/[?]$/.test(value.trim()) &&
      !/^(?:what|why|how|when|where|who|open|send|delete|cancel|stop)\b/i.test(
        normalizedValue,
      )
    );
  }

  private async save(state: ConversationContinuityRecord, now: Date) {
    state.updatedAt = now.toISOString();
    await this.store.saveConversationContinuity(ConversationContinuityRecordSchema.parse(state));
  }
}
