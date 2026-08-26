import { ActiveContextSchema } from "@alexa-control/shared";
import { describe, expect, it } from "vitest";

import { InMemoryVoiceStore } from "../voice/store.js";
import { ConversationContinuityService } from "./service.js";

const ids = () => ({
  ownerId: crypto.randomUUID(),
  conversationId: crypto.randomUUID(),
  deviceId: crypto.randomUUID(),
  voiceSessionId: crypto.randomUUID(),
});

const turn = (
  identity: ReturnType<typeof ids>,
  transcript: string,
  overrides: Partial<Parameters<ConversationContinuityService["resolveTurn"]>[0]> = {},
) => ({
  ...identity,
  turnId: crypto.randomUUID(),
  transcript,
  activeContext: null,
  contextReferences: [],
  ...overrides,
});

const activeSelection = (identity: ReturnType<typeof ids>, text: string) => {
  const at = new Date().toISOString();
  return ActiveContextSchema.parse({
    ownerId: identity.ownerId,
    deviceId: identity.deviceId,
    status: "CURRENT",
    application: { id: "finder", name: "Finder", bundleIdentifier: "com.apple.finder" },
    window: { title: "Documents" },
    document: { title: "Documents", type: "folder", uri: "file:///Users/owner/Documents" },
    selection: { text, semanticType: "AXRow", characterCount: text.length },
    semanticObjects: [],
    capabilityReferences: [],
    sources: ["REVIEWED_NATIVE_PROVIDER"],
    confidence: 0.95,
    permission: "ALLOWED",
    secureContentSuppressed: false,
    contextSummary: `Finder · ${text}`,
    capturedAt: at,
    lastConfirmedAt: at,
    staleAt: new Date(Date.now() + 15_000).toISOString(),
    authority: "CONTEXT_ONLY",
  });
};

describe("ConversationContinuityService", () => {
  it("resolves a multi-step calendar clarification into one canonical request", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    const first = await service.resolveTurn(turn(identity, "Schedule a meeting with Sarah tomorrow"));
    expect(first.responseText).toBe("What time?");
    const secondInput = turn(identity, "3 PM");
    const second = await service.resolveTurn(secondInput);
    expect(second.responseText).toBe("How long?");
    const final = await service.resolveTurn(turn(identity, "One hour"));
    expect(final.canonicalRequest).toBe("Schedule a 60 minute meeting with Sarah tomorrow at 3:00 PM.");
    expect(final.state.pendingIntent?.status).toBe("READY");
    expect(final.state.pendingIntent?.resolvedSlots).toMatchObject({ person: "Sarah", date: "tomorrow", durationMinutes: 60 });
  });

  it("uses active selection before clarifying the remaining recipient", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    const first = await service.resolveTurn(
      turn(identity, "Send this to Sarah", { activeContext: activeSelection(identity, "report.pdf") }),
    );
    expect(first.responseText).toBe("Which person do you mean?");
    const final = await service.resolveTurn(
      turn(identity, "Sarah Tan", { activeContext: activeSelection(identity, "report.pdf") }),
    );
    expect(final.canonicalRequest).toBe("Send report.pdf to Sarah Tan.");
  });

  it("keeps recipient, file, and format answers in one send clarification chain", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    const first = await service.resolveTurn(turn(identity, "Send the report to Alex"));
    expect(first.responseText).toBe("Which person do you mean?");
    const second = await service.resolveTurn(turn(identity, "Alex Tan"));
    expect(second.responseText).toBe("Which file?");
    const third = await service.resolveTurn(turn(identity, "The finance one"));
    expect(third.responseText).toBe("PDF or spreadsheet?");
    const final = await service.resolveTurn(turn(identity, "PDF"));
    expect(final.canonicalRequest).toBe("Send The finance one (pdf) to Alex Tan.");
  });

  it("cancels pending state and does not resurrect it", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    await service.resolveTurn(turn(identity, "Schedule a meeting with Sarah tomorrow"));
    const cancelled = await service.resolveTurn(turn(identity, "Never mind"));
    expect(cancelled.state.pendingIntent?.status).toBe("CANCELLED");
    const later = await service.resolveTurn(turn(identity, "3 PM"));
    expect(later.handled).toBe(false);
    expect(later.canonicalRequest).toBeNull();
  });

  it("resolves ordinals deterministically", () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const at = new Date().toISOString();
    const references = ["alpha.pdf", "beta.pdf", "gamma.pdf"].map((value, index) => ({
      id: `option-${index}`,
      kind: "file" as const,
      label: value,
      value,
      source: "RECENT_REFERENCE" as const,
      confidence: 1,
      deviceId: null,
      resolvedAt: at,
    }));
    expect(service.resolveReference("The second one", references)?.value).toBe("beta.pdf");
  });

  it("binds do it only to the current conversation proposal", async () => {
    const store = new InMemoryVoiceStore();
    const service = new ConversationContinuityService(store);
    const identity = ids();
    await service.resolveTurn(turn(identity, "Review these files"));
    await service.createProposal({
      ...identity,
      canonicalIntent: "RENAME_FILES",
      canonicalRequest: "Rename the five validated files and remove the date prefix.",
      riskLevel: "moderate_risk",
    });
    const confirmed = await service.resolveTurn(turn(identity, "Do it"));
    expect(confirmed.canonicalRequest).toContain("five validated files");
    expect(confirmed.state.actionProposal?.status).toBe("CONFIRMED");

    const otherConversation = { ...identity, conversationId: crypto.randomUUID() };
    const isolated = await service.resolveTurn(turn(otherConversation, "Do it"));
    expect(isolated.canonicalRequest).toBeNull();
    expect(isolated.responseText).toContain("no current action");
  });

  it("allows exactly one atomic claim of a confirmed action proposal", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    await service.resolveTurn(turn(identity, "Prepare the reviewed interaction"));
    const proposal = await service.createProposal({
      ...identity,
      canonicalIntent: "application_interaction.insert_text",
      canonicalRequest: "Insert the reviewed text.",
      riskLevel: "moderate_risk",
    });
    await service.resolveTurn(turn(identity, "Do it"));

    const claims = await Promise.all([
      service.claimConfirmedProposal({
        ownerId: identity.ownerId,
        conversationId: identity.conversationId,
        matches: (candidate) => candidate.id === proposal?.id,
      }),
      service.claimConfirmedProposal({
        ownerId: identity.ownerId,
        conversationId: identity.conversationId,
        matches: (candidate) => candidate.id === proposal?.id,
      }),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("cancels an older clarification when a new explicit action proposal is created", async () => {
    const store = new InMemoryVoiceStore();
    const service = new ConversationContinuityService(store);
    const identity = ids();

    await service.resolveTurn(turn(identity, "Schedule a meeting"));
    expect(
      store.getConversationContinuity(identity.ownerId, identity.conversationId)
        ?.pendingIntent?.status,
    ).toBe("AWAITING_CLARIFICATION");

    await service.createProposal({
      ...identity,
      canonicalIntent: "application_interaction.insert_text",
      canonicalRequest: "Type hello in the reviewed Chrome search field.",
      riskLevel: "moderate_risk",
    });

    expect(
      store.getConversationContinuity(identity.ownerId, identity.conversationId)
        ?.pendingIntent?.status,
    ).toBe("CANCELLED");
  });

  it("marks a claimed interaction executed only after its signed execution settles", async () => {
    const store = new InMemoryVoiceStore();
    const service = new ConversationContinuityService(store);
    const identity = ids();
    await service.resolveTurn(turn(identity, "Prepare the composer insertion"));
    const proposal = await service.createProposal({
      ...identity,
      canonicalIntent: "application_interaction.insert_text",
      canonicalRequest: "Insert the reviewed text.",
      riskLevel: "moderate_risk",
    });
    await service.resolveTurn(turn(identity, "Do it"));
    expect(
      await service.claimConfirmedProposal({
        ownerId: identity.ownerId,
        conversationId: identity.conversationId,
        matches: (candidate) => candidate.id === proposal?.id,
      }),
    ).toBe(true);
    const executionRequestId = crypto.randomUUID();

    expect(
      await service.recordGovernedInteractionSettlement({
        ownerId: identity.ownerId,
        proposalId: proposal!.id,
        executionRequestId,
        status: "SUCCEEDED",
      }),
    ).toBe(true);
    expect(
      store.getConversationContinuity(identity.ownerId, identity.conversationId)?.actionProposal,
    ).toMatchObject({
      status: "EXECUTED",
      governedCommandId: executionRequestId,
    });
  });

  it("leaves send it for the exact settled composer insertion continuation", async () => {
    const store = new InMemoryVoiceStore();
    const service = new ConversationContinuityService(store);
    const identity = ids();
    await service.resolveTurn(turn(identity, "Type hello into ChatGPT."));
    const proposal = await service.createProposal({
      ...identity,
      canonicalIntent: "application_interaction.insert_text",
      canonicalRequest: "Insert hello into the reviewed ChatGPT composer.",
      parameters: {
        request: {
          applicationId: "chatgpt",
          capability: "insert_text",
          target: { type: "COMPOSER" },
          text: "hello",
        },
      },
      riskLevel: "moderate_risk",
    });
    await service.resolveTurn(turn(identity, "Do it"));
    await service.claimConfirmedProposal({
      ownerId: identity.ownerId,
      conversationId: identity.conversationId,
      matches: (candidate) => candidate.id === proposal?.id,
    });
    await service.recordGovernedInteractionSettlement({
      ownerId: identity.ownerId,
      proposalId: proposal!.id,
      executionRequestId: crypto.randomUUID(),
      status: "SUCCEEDED",
    });

    const continuation = await service.resolveTurn(turn(identity, "Send it."));
    expect(continuation.handled).toBe(false);
    expect(continuation.responseText).toBeNull();
  });

  it("releases a claim only for an approval retry", async () => {
    const store = new InMemoryVoiceStore();
    const service = new ConversationContinuityService(store);
    const identity = ids();
    await service.resolveTurn(turn(identity, "Prepare the reviewed submission"));
    const proposal = await service.createProposal({
      ...identity,
      canonicalIntent: "application_interaction.submit_composer",
      canonicalRequest: "Submit the reviewed composer.",
      riskLevel: "high_risk",
    });
    await service.resolveTurn(turn(identity, "Do it"));
    await service.claimConfirmedProposal({
      ownerId: identity.ownerId,
      conversationId: identity.conversationId,
      matches: (candidate) => candidate.id === proposal?.id,
    });

    expect(
      await service.releaseProposalClaimForApproval({
        ownerId: identity.ownerId,
        conversationId: identity.conversationId,
        proposalId: proposal!.id,
      }),
    ).toBe(true);
    expect(
      store.getConversationContinuity(identity.ownerId, identity.conversationId)?.actionProposal
        ?.status,
    ).toBe("CONFIRMED");
  });

  it("allows a confirmed application interaction to resume after approval", async () => {
    const store = new InMemoryVoiceStore();
    const service = new ConversationContinuityService(store);
    const identity = ids();
    await service.resolveTurn(turn(identity, "Type hello in Chrome"));
    const proposal = await service.createProposal({
      ...identity,
      canonicalIntent: "application_interaction.insert_text",
      canonicalRequest: "Insert hello into the reviewed Chrome search field.",
      parameters: {
        request: { applicationId: "chrome", capability: "insert_text", text: "hello" },
      },
      riskLevel: "moderate_risk",
    });
    const confirmationInput = turn(identity, "Do it");
    await service.resolveTurn(confirmationInput);
    await service.claimConfirmedProposal({
      ownerId: identity.ownerId,
      conversationId: identity.conversationId,
      matches: (candidate) => candidate.id === proposal?.id,
    });
    await service.releaseProposalClaimForApproval({
      ownerId: identity.ownerId,
      conversationId: identity.conversationId,
      proposalId: proposal!.id,
    });

    await service.recordOutcome({
      ownerId: identity.ownerId,
      conversationId: identity.conversationId,
      turnId: confirmationInput.turnId,
      responseText: "The interaction is ready but still requires approval.",
      canonicalRequest: "Insert hello into the reviewed Chrome search field.",
      commandId: null,
    });

    const retry = await service.resolveTurn(turn(identity, "Do it"));

    expect(retry.canonicalRequest).toBe("Insert hello into the reviewed Chrome search field.");
    expect(retry.responseText).toBeNull();
    expect(retry.state.actionProposal?.status).toBe("CONFIRMED");
  });

  it("expires stale proposals without execution", async () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const service = new ConversationContinuityService(new InMemoryVoiceStore(), () => now);
    const identity = ids();
    await service.resolveTurn(turn(identity, "Review these files"));
    await service.createProposal({
      ...identity,
      canonicalIntent: "DELETE_FILES",
      canonicalRequest: "Delete the reviewed files.",
      riskLevel: "high_risk",
    });
    now = new Date("2026-01-01T00:06:00.000Z");
    const result = await service.resolveTurn(turn(identity, "Do it"));
    expect(result.canonicalRequest).toBeNull();
    expect(result.state.actionProposal?.status).toBe("EXPIRED");
  });

  it("supersedes an unconfirmed proposal after a substantive later turn", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    await service.resolveTurn(turn(identity, "Review these files"));
    await service.createProposal({
      ...identity,
      canonicalIntent: "RENAME_FILES",
      canonicalRequest: "Rename the reviewed files.",
      riskLevel: "moderate_risk",
    });
    const unrelated = await service.resolveTurn(turn(identity, "What is the weather?"));
    expect(unrelated.state.actionProposal?.status).toBe("CANCELLED");
    const confirmation = await service.resolveTurn(turn(identity, "Do it"));
    expect(confirmation.canonicalRequest).toBeNull();
    expect(confirmation.responseText).toContain("no current action");
  });

  it("supersedes an old proposal before an ambiguous destructive follow-up", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    await service.resolveTurn(turn(identity, "Review these files"));
    await service.createProposal({
      ...identity,
      canonicalIntent: "RENAME_FILES",
      canonicalRequest: "Rename the reviewed files.",
      riskLevel: "moderate_risk",
    });
    const ambiguous = await service.resolveTurn(turn(identity, "Delete that one"));
    expect(ambiguous.responseText).toBe("Which exact target do you mean?");
    expect(ambiguous.state.actionProposal?.status).toBe("CANCELLED");
    const confirmation = await service.resolveTurn(turn(identity, "Do it"));
    expect(confirmation.canonicalRequest).toBeNull();
    expect(confirmation.responseText).toContain("no current action");
  });

  it("does not let an old outcome reorder turns or revive a late proposal", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    const oldTurn = turn(identity, "Review these files");
    const newerTurn = turn(identity, "What is the weather?");
    await service.resolveTurn(oldTurn);
    await service.resolveTurn(newerTurn);
    await service.recordOutcome({
      ownerId: identity.ownerId,
      conversationId: identity.conversationId,
      turnId: oldTurn.turnId,
      responseText: "Reviewed.",
      canonicalRequest: null,
    });
    const state = await service.store.getConversationContinuity(
      identity.ownerId,
      identity.conversationId,
    );
    expect(state?.processedTurns[0]?.turnId).toBe(newerTurn.turnId);
    const proposal = await service.createProposal({
      ...identity,
      sourceTurnId: oldTurn.turnId,
      canonicalIntent: "RENAME_FILES",
      canonicalRequest: "Rename the reviewed files.",
      riskLevel: "moderate_risk",
    });
    expect(proposal).toBeNull();
  });

  it("fails closed for context-bound proposals without a browser or device identity", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    const contextIdentity = { ...identity, deviceId: null };
    await service.resolveTurn(turn(identity, "Review this", { deviceId: null }));
    const target = {
      id: "opaque-page-version",
      kind: "document" as const,
      label: "Current page",
      value: "opaque-page-version",
      source: "ACTIVE_CONTEXT" as const,
      confidence: 1,
      deviceId: null,
      resolvedAt: new Date().toISOString(),
    };
    await service.createProposal({
      ...contextIdentity,
      canonicalIntent: "REVIEW_PAGE",
      canonicalRequest: "Review the current page.",
      targets: [target],
      sourceContextReferenceId: target.id,
      riskLevel: "moderate_risk",
    });
    const result = await service.resolveTurn(
      turn(identity, "Do it", {
        deviceId: null,
        contextReferences: [
          { source: "ACTIVE_PAGE", id: target.id, label: target.label, confidence: 1 },
        ],
      }),
    );
    expect(result.canonicalRequest).toBeNull();
    expect(result.responseText).toContain("different device context");
  });

  it("rejects confirmation from a different device", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    await service.resolveTurn(turn(identity, "Review these files"));
    await service.createProposal({
      ...identity,
      canonicalIntent: "RENAME_FILES",
      canonicalRequest: "Rename the reviewed files.",
      riskLevel: "moderate_risk",
    });
    const result = await service.resolveTurn(
      turn(
        { ...identity, deviceId: crypto.randomUUID(), voiceSessionId: crypto.randomUUID() },
        "Do it",
      ),
    );
    expect(result.canonicalRequest).toBeNull();
    expect(result.responseText).toContain("different device context");
  });

  it("invalidates a proposal when its selected target changes", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    const initial = await service.resolveTurn(
      turn(identity, "Review this", { activeContext: activeSelection(identity, "alpha.pdf") }),
    );
    const source = initial.state.references.find((reference) => reference.source === "ACTIVE_SELECTION");
    expect(source).toBeDefined();
    await service.createProposal({
      ...identity,
      canonicalIntent: "RENAME_FILE",
      canonicalRequest: "Rename alpha.pdf.",
      sourceContextReferenceId: source!.id,
      riskLevel: "moderate_risk",
    });
    const result = await service.resolveTurn(
      turn(identity, "Do it", { activeContext: activeSelection(identity, "beta.pdf") }),
    );
    expect(result.canonicalRequest).toBeNull();
    expect(result.responseText).toContain("context has changed");
  });

  it("does not stale a reviewed application interaction proposal on context refresh", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    const initial = await service.resolveTurn(
      turn(identity, "Click the first button", {
        activeContext: activeSelection(identity, "button one"),
      }),
    );
    const source = initial.state.references.find(
      (reference) => reference.source === "ACTIVE_SELECTION",
    );
    expect(source).toBeDefined();
    await service.createProposal({
      ...identity,
      canonicalIntent: "application_interaction.activate_semantic_control",
      canonicalRequest: "Click the first matching reviewed button.",
      parameters: {
        request: {
          applicationId: "chrome",
          capability: "activate_semantic_control",
        },
      },
      targets: [source!],
      sourceContextReferenceId: source!.id,
      riskLevel: "high_risk",
    });

    const result = await service.resolveTurn(
      turn(identity, "Do it", { activeContext: activeSelection(identity, "button two") }),
    );

    expect(result.canonicalRequest).toBe("Click the first matching reviewed button.");
    expect(result.responseText).toBeNull();
    expect(result.state.actionProposal?.status).toBe("CONFIRMED");
  });

  it("fails closed for an unspecified undo request", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const result = await service.resolveTurn(turn(ids(), "Undo that"));
    expect(result.canonicalRequest).toBeNull();
    expect(result.responseText).toContain("exactly what should be reversed");
  });

  it("cancels clarification state on an explicit topic switch", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    await service.resolveTurn(turn(identity, "Schedule a meeting with Sarah tomorrow"));
    const switched = await service.resolveTurn(turn(identity, "Actually, what is the weather?"));
    expect(switched.handled).toBe(false);
    expect(switched.state.pendingIntent?.status).toBe("CANCELLED");
  });

  it("resolves this to the current selection and that to the prior selection", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    await service.resolveTurn(
      turn(identity, "Review this", { activeContext: activeSelection(identity, "alpha.pdf") }),
    );
    const current = await service.resolveTurn(
      turn(identity, "Compare this with that", { activeContext: activeSelection(identity, "beta.pdf") }),
    );
    expect(service.resolveReference("this file", current.state.references, identity.deviceId)?.value).toBe("beta.pdf");
    expect(service.resolveReference("that file", current.state.references, identity.deviceId)?.value).toBe("alpha.pdf");
  });

  it("does not guess between multiple person references", () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const at = new Date().toISOString();
    const people = ["Alex Tan", "Alex Lee"].map((value) => ({
      id: crypto.randomUUID(),
      kind: "person" as const,
      label: value,
      value,
      source: "RECENT_REFERENCE" as const,
      confidence: 1,
      deviceId: null,
      resolvedAt: at,
    }));
    expect(service.resolveReference("Send it to him", people)).toBeNull();
  });

  it("clarifies an ambiguous destructive reference", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    await service.resolveTurn(
      turn(identity, "Review this", { activeContext: activeSelection(identity, "alpha.pdf") }),
    );
    await service.resolveTurn(
      turn(identity, "Review this too", { activeContext: activeSelection(identity, "beta.pdf") }),
    );
    const result = await service.resolveTurn(turn(identity, "Delete that one"));
    expect(result.canonicalRequest).toBeNull();
    expect(result.responseText).toBe("Which exact target do you mean?");
  });

  it("deduplicates replayed turn IDs and isolates owners", async () => {
    const store = new InMemoryVoiceStore();
    const service = new ConversationContinuityService(store);
    const identity = ids();
    await service.resolveTurn(turn(identity, "Schedule a meeting with Sarah tomorrow"));
    const input = turn(identity, "3 PM");
    const first = await service.resolveTurn(input);
    const replay = await service.resolveTurn(input);
    expect(first.responseText).toBe("How long?");
    expect(replay.duplicate).toBe(true);

    const secondOwner = { ...identity, ownerId: crypto.randomUUID() };
    const isolated = await service.resolveTurn(turn(secondOwner, "One hour"));
    expect(isolated.canonicalRequest).toBeNull();
  });

  it("atomically permits only one concurrent transition for a turn", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    const sameTurn = turn(identity, "Schedule a meeting with Sarah tomorrow");
    const [left, right] = await Promise.all([
      service.resolveTurn(sameTurn),
      service.resolveTurn(sameTurn),
    ]);
    expect([left.duplicate, right.duplicate].sort()).toEqual([false, true]);
    const state = await service.store.getConversationContinuity(
      identity.ownerId,
      identity.conversationId,
    );
    expect(state?.processedTurns.filter((item) => item.turnId === sameTurn.turnId)).toHaveLength(1);
  });

  it("serializes different concurrent turns without losing either transition", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    await service.resolveTurn(turn(identity, "Schedule a meeting with Sarah tomorrow"));
    const timeTurn = turn(identity, "3 PM");
    const cancelTurn = turn(identity, "Never mind");
    await Promise.all([
      service.resolveTurn(timeTurn),
      service.resolveTurn(cancelTurn),
    ]);
    const state = await service.store.getConversationContinuity(
      identity.ownerId,
      identity.conversationId,
    );
    expect(state?.pendingIntent?.status).toBe("CANCELLED");
    expect(state?.processedTurns.map((item) => item.turnId)).toEqual(
      expect.arrayContaining([timeTurn.turnId, cancelTurn.turnId]),
    );
  });

  it("does not treat an unrelated question as a person slot answer", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    await service.resolveTurn(turn(identity, "Send the report to Alex"));
    const result = await service.resolveTurn(turn(identity, "What is the weather?"));
    expect(result.canonicalRequest).toBeNull();
    expect(result.responseText).toBe("Which person do you mean?");
    expect(result.state.pendingIntent?.resolvedSlots.person).toBeUndefined();
  });

  it("stores non-file selections as opaque references", async () => {
    const service = new ConversationContinuityService(new InMemoryVoiceStore());
    const identity = ids();
    const selectionText = "const privateToken = process.env.SECRET_TOKEN";
    const result = await service.resolveTurn(
      turn(identity, "Explain this", {
        activeContext: activeSelection(identity, selectionText),
      }),
    );
    const selection = result.state.references.find(
      (reference) => reference.source === "ACTIVE_SELECTION",
    );
    expect(selection?.label).toBe("Selected content");
    expect(selection?.value).not.toContain(selectionText);
    expect(JSON.stringify(result.state)).not.toContain(selectionText);
  });
});
