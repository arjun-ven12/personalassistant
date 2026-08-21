import { describe, expect, it } from "vitest";

import { AgentCognitionService } from "../agent-cognition/service.js";
import { InMemoryAgentCognitionStore } from "../agent-cognition/store.js";
import { AgentEvolutionService } from "../agent-evolution/service.js";
import { InMemoryAgentEvolutionStore } from "../agent-evolution/store.js";
import { AgentOsService } from "../agents/os-service.js";
import { InMemoryAgentOsStore } from "../agents/os-store.js";
import { AgentRegistryService } from "../agents/service.js";
import { InMemoryAgentStore } from "../agents/store.js";
import { AgentSocietyService } from "../agent-society/service.js";
import { InMemoryAgentSocietyStore } from "../agent-society/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import { InMemoryMemoryStore } from "../memory/store.js";
import { InMemoryRepositoryStore } from "../repositories/store.js";
import { IntentExecutionService } from "./service.js";
import { InMemoryIntentStore } from "./store.js";

const setup = () => {
  const ownerId = crypto.randomUUID();
  const audits: Parameters<GovernanceAuditWriter>[0][] = [];
  const audit: GovernanceAuditWriter = (event) => {
    audits.push(event);
  };
  const agentStore = new InMemoryAgentStore();
  const memoryStore = new InMemoryMemoryStore();
  const repositoryStore = new InMemoryRepositoryStore();
  const registry = new AgentRegistryService(agentStore, audit);
  const agentOs = new AgentOsService(
    new InMemoryAgentOsStore(),
    agentStore,
    repositoryStore,
    memoryStore,
    audit,
    undefined,
    (id, requestId) => registry.ensureBuiltIns(id, requestId),
  );
  const cognition = new AgentCognitionService(
    new InMemoryAgentCognitionStore(),
    agentStore,
    agentOs,
    memoryStore,
    audit,
  );
  const evolution = new AgentEvolutionService(
    new InMemoryAgentEvolutionStore(),
    agentStore,
    cognition,
    audit,
  );
  const society = new AgentSocietyService(
    new InMemoryAgentSocietyStore(),
    agentStore,
    evolution,
    audit,
  );
  const intent = new IntentExecutionService(new InMemoryIntentStore(), society, audit);
  return { audits, intent, ownerId };
};

describe("IntentExecutionService", () => {
  it("initializes command templates, metrics, and advisory suggestions", async () => {
    const { intent, ownerId } = setup();
    const dashboard = await intent.dashboard(ownerId);

    expect(dashboard.templates.map((template) => template.name)).toEqual(
      expect.arrayContaining([
        "Morning Startup",
        "Repository Review",
        "Security Review",
      ]),
    );
    expect(dashboard.metrics.map((metric) => metric.metricName)).toContain(
      "command_readiness",
    );
    expect(dashboard.suggestions).toHaveLength(1);
    expect(dashboard.universalEntryPoint).toBe(true);
    expect(dashboard.bypassesGovernance).toBe(false);
  });

  it("converts a natural-language request into intents, a plan, steps, and history", async () => {
    const { audits, intent, ownerId } = setup();
    const response = await intent.submit({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        request: "Review this repository and summarize risks",
        source: "desktop",
      },
    });

    expect(response.intents.length).toBeGreaterThan(1);
    expect(response.command.status).toBe("waiting_approval");
    expect(response.command.safetyLevel).toBe("moderate_risk");
    expect(response.plan.status).toBe("waiting_approval");
    expect(response.plan.orderedStepIds).toHaveLength(response.steps.length);
    expect(response.steps.every((step) => step.planId === response.plan.id)).toBe(true);
    expect(response.history.outcome).toBe("needs_approval");
    expect(audits.map((audit) => audit.eventType)).toEqual(
      expect.arrayContaining([
        "COMMAND_RECEIVED",
        "INTENT_ANALYSED",
        "COMMAND_APPROVAL_REQUIRED",
        "SOCIETY_TEAM_FORMED",
      ]),
    );
  });

  it("fails safely into clarification for ambiguous follow-up commands", async () => {
    const { intent, ownerId } = setup();
    const response = await intent.submit({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: { request: "Do that again", source: "desktop" },
    });
    const dashboard = await intent.dashboard(ownerId);

    expect(response.command.status).toBe("needs_clarification");
    expect(response.intents[0]?.clarificationNeeded).toBe(true);
    expect(dashboard.clarificationSessions).toHaveLength(1);
    expect(dashboard.clarificationSessions[0]?.questions).toContain(
      "Which specific target should this command use?",
    );
  });

  it("persists reusable saved commands and macros without execution authority", async () => {
    const { audits, intent, ownerId } = setup();
    const saved = await intent.saveCommand({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        name: "Review repo",
        requestTemplate: "Review this repository and summarize risks.",
        pinned: true,
        favorite: true,
      },
    });
    const macro = await intent.createMacro({
      ownerId,
      requestId: crypto.randomUUID(),
      ipAddress: "127.0.0.1",
      body: {
        name: "Work Mode",
        description: "Open the governed command sequence for focused work.",
        commandTemplateIds: [saved.id],
        mode: "work",
      },
    });
    const dashboard = await intent.dashboard(ownerId);

    expect(dashboard.savedCommands.map((command) => command.id)).toContain(saved.id);
    expect(dashboard.macros.map((item) => item.id)).toContain(macro.id);
    expect(dashboard.bypassesGovernance).toBe(false);
    expect(audits.map((audit) => audit.eventType)).toEqual(
      expect.arrayContaining(["COMMAND_SAVED", "COMMAND_MACRO_CREATED"]),
    );
  });
});
