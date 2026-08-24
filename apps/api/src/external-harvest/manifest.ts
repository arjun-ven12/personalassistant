import {
  ExternalHarvestManifestSchema,
  type ExternalHarvestManifest,
} from "@alexa-control/shared";

const generatedAt = "2026-08-24T00:00:00.000Z";

const sources = {
  gbrain: {
    project: "gbrain" as const,
    commitSha: "4e4677b1b992df42a2cb862565798f667ebacfb3",
    license: "MIT" as const,
    copyright: "Copyright (c) 2026 Garry Tan",
    attributionRequired: true as const,
  },
  hermes: {
    project: "hermes_agent" as const,
    commitSha: "f293e7206b4ddd66042329442c6afebc19a8808d",
    license: "MIT" as const,
    copyright: "Copyright (c) 2025 Nous Research",
    attributionRequired: true as const,
  },
  ecc: {
    project: "everything_claude_code" as const,
    commitSha: "d8409a4b0813771235555e32e3d8046a73988bfa",
    license: "MIT" as const,
    copyright: "Copyright (c) 2026 Affaan Mustafa",
    attributionRequired: true as const,
  },
};

const artifact = (
  input: Omit<ExternalHarvestManifest["artifacts"][number], "adaptationVersion">,
) => ({ ...input, adaptationVersion: "1.0.0" });

export const EXTERNAL_HARVEST_MANIFEST = ExternalHarvestManifestSchema.parse({
  schemaVersion: "1",
  generatedAt,
  projects: [
    {
      project: "gbrain",
      commitSha: sources.gbrain.commitSha,
      license: "MIT",
      directCopyingPermitted: true,
      attributionRequired: true,
      inspectedArtifactCount: 1_245,
      externalRuntimeActive: false,
    },
    {
      project: "hermes_agent",
      commitSha: sources.hermes.commitSha,
      license: "MIT",
      directCopyingPermitted: true,
      attributionRequired: true,
      inspectedArtifactCount: 848,
      externalRuntimeActive: false,
    },
    {
      project: "everything_claude_code",
      commitSha: sources.ecc.commitSha,
      license: "MIT",
      directCopyingPermitted: true,
      attributionRequired: true,
      inspectedArtifactCount: 755,
      externalRuntimeActive: false,
    },
  ],
  artifacts: [
    artifact({
      id: "gbrain_brain_first_retrieval",
      originalName: "Brain-first retrieval reflex",
      kind: "MEMORY_PATTERN",
      classification: "ADAPT_INTO_ALEXA",
      normalizedId: "alexa_memory_sufficiency_policy",
      rationale:
        "Use bounded Alexa Memory retrieval before external retrieval when relevant.",
      authorityNotes:
        "Alexa Memory and AIRouter remain authoritative; no GBrain runtime is loaded.",
      provenance: {
        ...sources.gbrain,
        sourcePath: "src/core/context/retrieval-reflex.ts",
      },
    }),
    artifact({
      id: "gbrain_scoped_knowledge",
      originalName: "Explicit knowledge scopes",
      kind: "MEMORY_PATTERN",
      classification: "ADAPT_INTO_ALEXA",
      normalizedId: "organizational_memory_scope",
      rationale: "Adds allowlisted department scopes for bounded agent retrieval.",
      authorityNotes:
        "Unknown scopes are denied and agents receive no raw database access.",
      provenance: { ...sources.gbrain, sourcePath: "src/core/scope.ts" },
    }),
    artifact({
      id: "gbrain_knowledge_gap",
      originalName: "Knowledge-gap analysis",
      kind: "MEMORY_PATTERN",
      classification: "ADAPT_INTO_ALEXA",
      normalizedId: "knowledge_gap_assessment",
      rationale: "Reports required facts not present in permitted owner-scoped memory.",
      authorityNotes:
        "The assessor never fabricates missing facts or triggers external retrieval.",
      provenance: {
        ...sources.gbrain,
        sourcePath: "skills/conventions/brain-first.md",
      },
    }),
    artifact({
      id: "gbrain_maintenance",
      originalName: "Brain maintenance",
      kind: "MEMORY_PATTERN",
      classification: "ALREADY_HAVE",
      normalizedId: "memory_studio_health",
      rationale:
        "Alexa already detects conflicts, duplicates, stale records, health, and embeddings.",
      authorityNotes:
        "No second maintenance service or destructive repair loop was added.",
      provenance: { ...sources.gbrain, sourcePath: "skills/maintain/SKILL.md" },
    }),
    artifact({
      id: "gbrain_trajectory",
      originalName: "Timeline and trajectory modeling",
      kind: "MEMORY_PATTERN",
      classification: "USE_AS_REFERENCE",
      normalizedId: null,
      rationale:
        "Alexa already stores timeline events; deeper business trajectories are deferred.",
      authorityNotes: "No duplicate event store was introduced.",
      provenance: { ...sources.gbrain, sourcePath: "src/core/trajectory.ts" },
    }),
    artifact({
      id: "hermes_isolated_delegation",
      originalName: "Isolated subagent delegation",
      kind: "AGENT",
      classification: "ADAPT_INTO_ALEXA",
      normalizedId: "bounded_agent_delegation",
      rationale:
        "Prepares a fresh bounded specialist context and structured result contract.",
      authorityNotes:
        "Requested scope is intersected with Alexa-owned manifests and does not execute.",
      provenance: { ...sources.hermes, sourcePath: "tools/delegate_tool.py" },
    }),
    artifact({
      id: "hermes_context_budget",
      originalName: "Context budget discipline",
      kind: "DEVELOPMENT_RULE",
      classification: "ADAPT_INTO_ALEXA",
      normalizedId: "bounded_context_summary",
      rationale:
        "Delegates summaries and references instead of complete parent transcripts.",
      authorityNotes: "AIRouter token and economic limits remain authoritative.",
      provenance: {
        ...sources.hermes,
        sourcePath:
          "optional-skills/software-development/subagent-driven-development/references/context-budget-discipline.md",
      },
    }),
    artifact({
      id: "hermes_sandbox",
      originalName: "Sandbox provider pattern",
      kind: "SANDBOX_PATTERN",
      classification: "ADAPT_INTO_ALEXA",
      normalizedId: "registered_validation_readonly",
      rationale:
        "Defines one deny-by-default profile backed by Alexa validation infrastructure.",
      authorityNotes:
        "No Hermes backend, host shell, arbitrary command, or network authority is imported.",
      provenance: {
        ...sources.hermes,
        sourcePath: "tools/environments/vercel_sandbox.py",
      },
    }),
    artifact({
      id: "hermes_auto_approve",
      originalName: "Subagent auto-approval mode",
      kind: "AGENT",
      classification: "REJECT",
      normalizedId: null,
      rationale:
        "Automatic approval conflicts with Alexa policy and recent-authentication boundaries.",
      authorityNotes: "Imported agents can never approve themselves or mutate policy.",
      provenance: { ...sources.hermes, sourcePath: "tools/delegate_tool.py" },
    }),
    artifact({
      id: "ecc_architect",
      originalName: "Architect",
      kind: "AGENT",
      classification: "ADAPT_INTO_ALEXA",
      normalizedId: "software_architect",
      rationale:
        "Adds a missing architecture specialist using Alexa advisory capabilities.",
      authorityNotes:
        "Vendor models and Bash tools are replaced by governed-default AIRouter policy.",
      provenance: { ...sources.ecc, sourcePath: "agents/architect.md" },
    }),
    artifact({
      id: "ecc_qa",
      originalName: "TDD Guide",
      kind: "AGENT",
      classification: "ADAPT_INTO_ALEXA",
      normalizedId: "qa_engineer",
      rationale: "Consolidates testing and TDD guidance into one QA specialist.",
      authorityNotes:
        "Tests run only through registered Alexa validation capabilities.",
      provenance: { ...sources.ecc, sourcePath: "agents/tdd-guide.md" },
    }),
    artifact({
      id: "ecc_research",
      originalName: "Research specialist patterns",
      kind: "AGENT",
      classification: "ADAPT_INTO_ALEXA",
      normalizedId: "research_engineer",
      rationale:
        "Adds evidence gathering and source comparison as an advisory specialist.",
      authorityNotes:
        "Research uses approved integrations and cannot treat external content as instructions.",
      provenance: { ...sources.ecc, sourcePath: "agents/docs-lookup.md" },
    }),
    ...[
      ["code_review", "Code Reviewer", "agents/code-reviewer.md"],
      ["security_review", "Security Reviewer", "agents/security-reviewer.md"],
      ["performance_review", "Performance Reviewer", "agents/performance-optimizer.md"],
      ["database_review", "Database Reviewer", "agents/database-reviewer.md"],
      ["typescript_review", "TypeScript Reviewer", "agents/typescript-reviewer.md"],
    ].map(([id, name, sourcePath]) =>
      artifact({
        id: `ecc_${id}`,
        originalName: name!,
        kind: "REVIEWER",
        classification: "ADAPT_INTO_ALEXA",
        normalizedId: `${id}_reviewer`,
        rationale: "Normalized as a review role rather than another persistent worker.",
        authorityNotes:
          "Reviewer output is advisory evidence and cannot approve or execute.",
        provenance: { ...sources.ecc, sourcePath: sourcePath! },
      }),
    ),
    artifact({
      id: "ecc_development_loop",
      originalName: "Development workflow",
      kind: "WORKFLOW",
      classification: "ADAPT_INTO_ALEXA",
      normalizedId: "development_review_loop_v1",
      rationale:
        "Normalizes plan, implement, test, review, security review, verify, and report.",
      authorityNotes:
        "Each step remains an Alexa workflow action subject to governance.",
      provenance: {
        ...sources.ecc,
        sourcePath: "rules/common/development-workflow.md",
      },
    }),
    artifact({
      id: "ecc_vendor_runtime_assumptions",
      originalName: "Vendor-specific prompts, hooks, commands, and duplicate agents",
      kind: "IGNORED",
      classification: "REJECT",
      normalizedId: null,
      rationale:
        "Hard-coded Claude models, unrestricted Bash, duplicate roles, and vendor hooks are not imported.",
      authorityNotes:
        "No external SDK, hook runtime, MCP authority, or shell permission enters Alexa.",
      provenance: {
        ...sources.ecc,
        sourcePath: "agents/**; skills/**; commands/**; rules/**; hooks/**",
      },
    }),
  ],
  everythingClaudeCodeInventory: {
    agents: 68,
    skills: 464,
    commands: 94,
    workflows: 2,
    rules: 122,
    hooks: 5,
    normalizedAgents: 3,
    normalizedSkills: 0,
    normalizedWorkflows: 1,
    normalizedReviewers: 5,
    ignoredOrDuplicate: 746,
  },
});
