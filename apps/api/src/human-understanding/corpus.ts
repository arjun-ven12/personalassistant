import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  AliasDictionaryEntrySchema,
  BehaviourRuleRecordSchema,
  CorpusDashboardResponseSchema,
  CorpusEntrySchema,
  CorpusImportRecordSchema,
  CorpusManifestSchema,
  CorpusTestUtteranceResponseSchema,
  CorpusValidationIssueSchema,
  CorpusValidationResultSchema,
  CorpusVersionSchema,
  HumanSynonymEntrySchema,
  MemoryRecordSchema,
  PatternLibraryEntrySchema,
  PersonalityProfileSchema,
  ResponseTemplateRecordSchema,
  SocialRuleRecordSchema,
  VocabularyEntrySchema,
  type CorpusEntry,
  type CorpusManifest,
  type CorpusValidationIssue,
} from "@alexa-control/shared";

import type { MemoryStore } from "../memory/store.js";
import type { HumanUnderstandingStore } from "./store.js";

const CORPUS_ID = "alexa-personality-seed-corpus";
const SCHEMA_VERSION = "19A.3";
const DEFAULT_RUNTIME_VERSION = "19A";

const stableUuid = (input: string) => {
  const hash = createHash("sha256").update(input).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

export const normalizeCorpusUtterance = (value: string) => {
  const negationPlaceholders = new Map<string, string>();
  let index = 0;
  const protect = (text: string) =>
    text.replace(/\b(don't|do not|never|not|except|only|first|last|previous|other|again|before|after)\b/gi, (match) => {
      const key = `__NEGATION_${index++}__`;
      negationPlaceholders.set(key.toLowerCase(), match.toLowerCase());
      return key;
    });
  let normalized = protect(value)
    .replace(/[’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\b(hey alexa|ok alexa|okay alexa|yo alexa|alexa)\b/gi, " ")
    .replace(/\b(can you|could you|would you|please|just|quickly|basically|like|um|uh|for me|real quick|bro)\b/gi, " ")
    .replace(/[?!.]+$/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  for (const [key, original] of negationPlaceholders) {
    normalized = normalized.replaceAll(key, original);
  }
  return normalized.replace(/\s+/g, " ").trim();
};

type ParsedBlock = {
  line: number;
  section: string;
  raw: Record<string, unknown>;
};

export class CorpusCompiler {
  constructor(readonly now: () => Date = () => new Date()) {}

  async compileFromMarkdown(markdownPath: string) {
    const markdown = await readFile(markdownPath, "utf8");
    const checksum = createHash("sha256").update(markdown).digest("hex");
    const createdAt = this.now().toISOString();
    const blocks = extractYamlBlocks(markdown);
    const entries = blocks
      .flatMap((block) => blockToEntries(block, createdAt))
      .filter((entry): entry is Omit<CorpusEntry, "ownerId"> => Boolean(entry));
    const manifest = manifestFor(entries, {
      checksum,
      createdAt,
      sourcePath: markdownPath,
      sourceChecksum: checksum,
    });
    return { manifest, entries };
  }

  async writePackage(markdownPath: string, outputDirectory: string) {
    const compiled = await this.compileFromMarkdown(markdownPath);
    const packageRoot = path.resolve(outputDirectory);
    const byType = groupBy(compiled.entries, (entry) => entry.entryType);
    const byDomain = groupBy(
      compiled.entries.filter((entry) => entry.entryType.includes("example")),
      (entry) => entry.domain,
    );
    await writeJson(path.join(packageRoot, "manifest.json"), compiled.manifest);
    await writeJson(path.join(packageRoot, "core", "identity.json"), byType.identity ?? []);
    await writeJson(path.join(packageRoot, "core", "traits.json"), byType.trait ?? []);
    await writeJson(path.join(packageRoot, "core", "policies.json"), byType.policy ?? []);
    await writeJson(path.join(packageRoot, "core", "social-rules.json"), byType.social_rule ?? []);
    await writeJson(path.join(packageRoot, "language", "vocabulary.json"), byType.vocabulary ?? []);
    await writeJson(path.join(packageRoot, "language", "aliases.json"), byType.alias ?? []);
    await writeJson(path.join(packageRoot, "language", "synonyms.json"), byType.synonym ?? []);
    await writeJson(path.join(packageRoot, "language", "patterns.json"), byType.pattern ?? []);
    await writeJson(path.join(packageRoot, "language", "intents.json"), byType.intent ?? []);
    await writeJson(path.join(packageRoot, "language", "entity-types.json"), byType.entity_type ?? []);
    await writeJson(path.join(packageRoot, "language", "normalization.json"), byType.normalization_rule ?? []);
    await writeJson(path.join(packageRoot, "responses", "templates.json"), byType.response_template ?? []);
    for (const [domain, entries] of Object.entries(byDomain)) {
      await writeJson(path.join(packageRoot, "examples", `${domain}.json`), entries);
    }
    await writeJson(path.join(packageRoot, "profiles", "profiles.json"), byType.personality_profile ?? []);
    await writeJson(path.join(packageRoot, "learning", "thresholds.json"), byType.learning_threshold ?? []);
    await writeJson(path.join(packageRoot, "planner", "preferences.json"), byType.planner_preference ?? []);
    await writeJson(path.join(packageRoot, "voice", "behaviour.json"), byType.voice_behaviour_rule ?? []);
    await writeJson(path.join(packageRoot, "gestures", "behaviour.json"), []);
    await writeJson(path.join(packageRoot, "agents", "inheritance.json"), byType.agent_inheritance_rule ?? []);
    await writeJson(path.join(packageRoot, "business", "vocabulary.json"), (byDomain.business ?? []).filter((entry) => entry.entryType !== "negative_intent_example"));
    return compiled;
  }
}

export class CorpusValidator {
  validate(ownerId: string, manifest: CorpusManifest, rawEntries: Omit<CorpusEntry, "ownerId">[]) {
    const at = new Date().toISOString();
    const entries = rawEntries.map((entry) => CorpusEntrySchema.parse({ ...entry, ownerId }));
    const issues: CorpusValidationIssue[] = [];
    const byId = new Map<string, CorpusEntry>();
    const utteranceIntent = new Map<string, CorpusEntry>();
    const negativeUtterances = new Map<string, CorpusEntry>();
    const aliases = new Map<string, string>();
    for (const entry of entries) {
      if (byId.has(entry.id)) {
        issues.push(issue(ownerId, manifest, "critical", "DUPLICATE_ID", `Duplicate corpus ID ${entry.id}.`, entry.id, at));
      }
      byId.set(entry.id, entry);
      if (entry.utterance) {
        const key = entry.normalizedUtterance ?? normalizeCorpusUtterance(entry.utterance);
        if (!key) continue;
        const existing = utteranceIntent.get(key);
        if (existing && existing.intent !== entry.intent) {
          const severity = isHighRiskIntent(existing.intent) || isHighRiskIntent(entry.intent)
            ? "critical"
            : "warning";
          issues.push(issue(ownerId, manifest, severity, severity === "critical" ? "CONFLICTING_INTENT_MAPPING" : "AMBIGUOUS_UTTERANCE", `Utterance "${key}" maps to both ${existing.intent} and ${entry.intent}.`, entry.id, at));
        } else if (existing) {
          issues.push(issue(ownerId, manifest, "warning", "DUPLICATE_UTTERANCE", `Duplicate utterance "${key}" with the same intent.`, entry.id, at));
        }
        utteranceIntent.set(key, entry);
        if (entry.entryType === "negative_intent_example") negativeUtterances.set(key, entry);
      }
      if (entry.entryType === "alias" && entry.utterance && entry.intent) {
        const existing = aliases.get(entry.normalizedUtterance ?? entry.utterance);
        if (existing && existing !== entry.intent) {
          issues.push(issue(ownerId, manifest, "critical", "ALIAS_COLLISION", `Alias "${entry.utterance}" maps to conflicting intents.`, entry.id, at));
        }
        aliases.set(entry.normalizedUtterance ?? entry.utterance, entry.intent);
      }
      if (entry.entryType === "negative_intent_example" && entry.deterministicCandidate) {
        issues.push(issue(ownerId, manifest, "critical", "UNSAFE_NEGATIVE_EXECUTION", `Negative example ${entry.id} is executable.`, entry.id, at));
      }
      if (entry.utterance?.includes('"') && entry.deterministicCandidate && entry.entryType !== "negative_intent_example") {
        issues.push(issue(ownerId, manifest, "warning", "QUOTED_UTTERANCE_REVIEW", `Quoted utterance ${entry.id} should be reviewed before execution.`, entry.id, at));
      }
    }
    for (const [key, negative] of negativeUtterances) {
      const executable = utteranceIntent.get(key);
      if (executable && executable.entryType !== "negative_intent_example") {
        issues.push(issue(ownerId, manifest, "critical", "NEGATIVE_EXECUTABLE_CONFLICT", `Negative utterance "${key}" conflicts with executable example.`, negative.id, at));
      }
    }
    const criticalCount = issues.filter((item) => item.severity === "critical").length;
    const warningCount = issues.filter((item) => item.severity === "warning").length;
    const infoCount = issues.filter((item) => item.severity === "info").length;
    return CorpusValidationResultSchema.parse({
      id: crypto.randomUUID(),
      ownerId,
      corpusId: manifest.corpusId,
      corpusVersion: manifest.corpusVersion,
      status: criticalCount > 0 ? "failed" : warningCount > 0 ? "warning" : "passed",
      criticalCount,
      warningCount,
      infoCount,
      issues,
      createdAt: at,
    });
  }
}

export class CorpusRuntimeService {
  readonly compiler: CorpusCompiler;
  readonly validator = new CorpusValidator();

  constructor(
    readonly store: HumanUnderstandingStore,
    readonly memoryStore: MemoryStore,
    readonly now: () => Date = () => new Date(),
  ) {
    this.compiler = new CorpusCompiler(now);
  }

  async dashboard(ownerId: string) {
    const activeVersion = await this.store.getActiveCorpusVersion(ownerId);
    const entries = await this.store.listCorpusEntries(ownerId, 2_000);
    return CorpusDashboardResponseSchema.parse({
      activeVersion,
      manifest: activeVersion?.manifest ?? null,
      entries,
      imports: await this.store.listCorpusImports(ownerId, 100),
      validationResults: await this.store.listCorpusValidations(ownerId, 100),
      negativeExamples: entries.filter((entry) => entry.entryType === "negative_intent_example").slice(0, 500),
      vectorSeeds: entries.filter((entry) => entry.vectorSeed).slice(0, 500),
    });
  }

  async importFromMarkdown(ownerId: string, markdownPath: string) {
    const at = this.now().toISOString();
    const compiled = await this.compiler.compileFromMarkdown(markdownPath);
    const validation = this.validator.validate(ownerId, compiled.manifest, compiled.entries);
    await this.store.saveCorpusValidation(validation);
    if (validation.criticalCount > 0) {
      const failed = CorpusImportRecordSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        corpusId: compiled.manifest.corpusId,
        corpusVersion: compiled.manifest.corpusVersion,
        checksum: compiled.manifest.checksum,
        status: "failed",
        entriesImported: 0,
        vectorSeedsImported: 0,
        negativeExamplesImported: 0,
        message: "Corpus validation failed; activation denied.",
        createdAt: at,
        updatedAt: at,
      });
      await this.store.saveCorpusImport(failed);
      return { manifest: compiled.manifest, validation, importRecord: failed };
    }
    const importRecord = CorpusImportRecordSchema.parse({
      id: stableUuid(`${ownerId}:${compiled.manifest.corpusId}:${compiled.manifest.corpusVersion}:${compiled.manifest.checksum}`),
      ownerId,
      corpusId: compiled.manifest.corpusId,
      corpusVersion: compiled.manifest.corpusVersion,
      checksum: compiled.manifest.checksum,
      status: "started",
      entriesImported: 0,
      vectorSeedsImported: 0,
      negativeExamplesImported: 0,
      message: "Corpus import started.",
      createdAt: at,
      updatedAt: at,
    });
    await this.store.saveCorpusImport(importRecord);
    let entriesImported = 0;
    let vectorSeedsImported = 0;
    let negativeExamplesImported = 0;
    for (const entry of compiled.entries.map((raw) => CorpusEntrySchema.parse({ ...raw, ownerId }))) {
      await this.store.saveCorpusEntry(entry);
      await this.importRuntimeRecord(entry, at);
      entriesImported += 1;
      if (entry.vectorSeed) {
        await this.seedVectorMemory(entry, at);
        vectorSeedsImported += 1;
      }
      if (entry.entryType === "negative_intent_example") negativeExamplesImported += 1;
    }
    await this.store.saveCorpusVersion(
      CorpusVersionSchema.parse({
        id: stableUuid(`${ownerId}:${compiled.manifest.corpusId}:${compiled.manifest.corpusVersion}`),
        ownerId,
        corpusId: compiled.manifest.corpusId,
        corpusVersion: compiled.manifest.corpusVersion,
        schemaVersion: compiled.manifest.schemaVersion,
        checksum: compiled.manifest.checksum,
        active: true,
        manifest: compiled.manifest,
        importedAt: at,
        createdAt: at,
      }),
    );
    const completed = CorpusImportRecordSchema.parse({
      ...importRecord,
      status: "imported",
      entriesImported,
      vectorSeedsImported,
      negativeExamplesImported,
      message: "Corpus imported and activated deterministically.",
      updatedAt: at,
    });
    await this.store.saveCorpusImport(completed);
    return { manifest: compiled.manifest, validation, importRecord: completed };
  }

  async negativeMatches(ownerId: string, normalizedText: string) {
    const entries = await this.store.listCorpusEntries(ownerId, 10_000);
    return entries.filter(
      (entry) =>
        entry.enabled &&
        entry.entryType === "negative_intent_example" &&
        Boolean(entry.normalizedUtterance) &&
        (entry.normalizedUtterance === normalizedText ||
          normalizedText.includes(entry.normalizedUtterance ?? "")),
    );
  }

  async testUtterance(ownerId: string, utterance: string) {
    const normalizedInput = normalizeCorpusUtterance(utterance);
    const entries = await this.store.listCorpusEntries(ownerId, 10_000);
    const negativeExampleMatches = await this.negativeMatches(ownerId, normalizedInput);
    const candidate = entries.find(
      (entry) =>
        entry.enabled &&
        entry.entryType !== "negative_intent_example" &&
        entry.normalizedUtterance === normalizedInput,
    );
    return CorpusTestUtteranceResponseSchema.parse({
      rawInput: utterance,
      normalizedInput,
      candidateIntent: negativeExampleMatches.length ? "NON_EXECUTION" : candidate?.intent ?? null,
      candidateEntities: candidate?.entities ?? {},
      negativeExampleMatches,
      confidence: negativeExampleMatches.length ? 0.99 : candidate ? 0.95 : 0.35,
      aiUsed: false,
      mustNotExecute: negativeExampleMatches.length > 0,
      reason: negativeExampleMatches.length
        ? negativeExampleMatches[0]?.reason ?? "Matched negative corpus example."
        : candidate
          ? "Matched deterministic corpus example."
          : "No exact corpus match; normal Human Understanding fallback should continue.",
    });
  }

  private async importRuntimeRecord(entry: CorpusEntry, at: string) {
    const normalized = entry.utterance
      ? entry.normalizedUtterance ?? normalizeCorpusUtterance(entry.utterance)
      : null;
    if (entry.entryType === "intent_example" && entry.utterance && entry.intent) {
      if (!normalized) return;
      await this.store.saveAlias(
        AliasDictionaryEntrySchema.parse({
          id: stableUuid(`${entry.ownerId}:corpus-alias:${entry.id}`),
          ownerId: entry.ownerId,
          phrase: entry.normalizedUtterance ?? entry.utterance,
          normalizedPhrase: normalized,
          canonical: entry.intent,
          targetType: "intent",
          confidence: 0.96,
          evidenceCount: 1,
          source: "system",
          active: entry.enabled && !entry.mustNotExecute.length,
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
    if (entry.entryType === "pattern" && entry.intent && entry.utterance) {
      if (!normalized) return;
      await this.store.savePattern(
        PatternLibraryEntrySchema.parse({
          id: stableUuid(`${entry.ownerId}:corpus-pattern:${entry.id}`),
          ownerId: entry.ownerId,
          name: entry.id,
          pattern: entry.utterance,
          intentId: entry.intent,
          entitySlots: Object.keys(entry.entities).slice(0, 20),
          confidence: 0.9,
          priority: 80,
          active: entry.enabled,
          version: 1,
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
    if (entry.entryType === "vocabulary" && entry.utterance) {
      if (!normalized) return;
      await this.store.saveVocabulary(
        VocabularyEntrySchema.parse({
          id: stableUuid(`${entry.ownerId}:corpus-vocab:${entry.id}`),
          ownerId: entry.ownerId,
          term: entry.utterance,
          normalizedTerm: normalized,
          kind: entry.domain === "application" ? "application_name" : "common_phrase",
          confidence: 0.94,
          version: 1,
          source: "system",
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
    if (entry.entryType === "response_template" && entry.utterance) {
      await this.store.saveResponseTemplate(
        ResponseTemplateRecordSchema.parse({
          id: stableUuid(`${entry.ownerId}:corpus-response:${entry.id}`),
          ownerId: entry.ownerId,
          templateKey: entry.domain,
          body: entry.utterance,
          tone: "neutral",
          active: entry.enabled,
          version: 1,
          updatedAt: at,
        }),
      );
    }
    if (entry.entryType === "social_rule") {
      await this.store.saveSocialRule(
        SocialRuleRecordSchema.parse({
          id: stableUuid(`${entry.ownerId}:corpus-social:${entry.id}`),
          ownerId: entry.ownerId,
          ruleKey: entry.id,
          description: entry.reason ?? entry.utterance ?? entry.id,
          active: entry.enabled,
          version: 1,
          updatedAt: at,
        }),
      );
    }
    if (entry.intent?.startsWith("GREETING") && entry.utterance) {
      if (!normalized) return;
      await this.store.saveBehaviourRule(
        BehaviourRuleRecordSchema.parse({
          id: stableUuid(`${entry.ownerId}:corpus-behaviour:${entry.id}`),
          ownerId: entry.ownerId,
          trigger: entry.utterance,
          normalizedTrigger: normalized,
          responseAction: "greeting_response",
          responseTemplate: "Hello boss.",
          confidence: 1,
          active: entry.enabled,
          version: 1,
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
    if (entry.entryType === "synonym" && entry.utterance && entry.intent) {
      if (!normalized) return;
      await this.store.saveSynonym(
        HumanSynonymEntrySchema.parse({
          id: stableUuid(`${entry.ownerId}:corpus-synonym:${entry.id}`),
          ownerId: entry.ownerId,
          term: entry.utterance,
          normalizedTerm: normalized,
          synonyms: entry.tags,
          canonical: entry.intent,
          confidence: 0.9,
          source: "system",
          active: entry.enabled,
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
    if (entry.entryType === "personality_profile") {
      await this.store.saveProfile(
        PersonalityProfileSchema.parse({
          id: stableUuid(`${entry.ownerId}:corpus-profile:${entry.id}`),
          ownerId: entry.ownerId,
          name: safeRawString(entry.raw.name, entry.id),
          identity: "Corpus-imported Alexa personality profile.",
          speechStyle: safeRawString(
            entry.raw.communication_style ?? entry.raw.speechStyle,
            "Model-independent and deterministic.",
          ),
          communicationStyle: safeRawString(
            entry.raw.communication_style,
            "Deterministic, bounded, and inspectable.",
          ),
          workingStyle: safeRawString(
            entry.raw.working_style,
            "Security-first and verification-heavy.",
          ),
          decisionStyle: safeRawString(
            entry.raw.decision_style,
            "Prefer deterministic execution and clarification.",
          ),
          socialRules: [],
          interactionPolicies: [],
          active: false,
          version: 1,
          createdAt: at,
          updatedAt: at,
        }),
      );
    }
  }

  private async seedVectorMemory(entry: CorpusEntry, at: string) {
    await this.memoryStore.saveMemory(
      MemoryRecordSchema.parse({
        schemaVersion: "1",
        id: stableUuid(`${entry.ownerId}:corpus-memory:${entry.id}`),
        ownerId: entry.ownerId,
        repositoryId: null,
        agentId: null,
        workflowId: null,
        memoryType: entry.entryType === "negative_intent_example" ? "procedural" : "semantic",
        source: "system",
        title: `Corpus ${entry.entryType}: ${entry.intent ?? entry.domain}`,
        summary: entry.utterance ?? entry.reason ?? entry.id,
        content: JSON.stringify({
          corpusVersion: entry.corpusVersion,
          entryId: entry.id,
          entryType: entry.entryType,
          intent: entry.intent,
          domain: entry.domain,
          negativeExample: entry.entryType === "negative_intent_example",
          riskLevel: entry.riskLevel,
          source: "personality_seed_corpus",
          ownerScope: "owner",
          language: "en",
        }),
        tags: ["personality-corpus", entry.entryType, entry.domain, ...(entry.intent ? [entry.intent] : [])].slice(0, 50),
        importance: entry.entryType === "negative_intent_example" ? 95 : 60,
        confidence: 0.95,
        evidence: [
          {
            sourceType: "manual",
            reference: entry.id,
            excerpt: entry.utterance,
            observedAt: at,
          },
        ],
        version: 1,
        createdAt: at,
        updatedAt: at,
        lastAccessedAt: null,
        expiresAt: null,
      }),
    );
  }
}

const writeJson = async (targetPath: string, value: unknown) => {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const extractYamlBlocks = (markdown: string): ParsedBlock[] => {
  const blocks: ParsedBlock[] = [];
  let section = "root";
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("#")) section = line.replace(/^#+\s*/, "").trim();
    if (line.trim() !== "```yaml") continue;
    const startLine = index + 1;
    const yaml: string[] = [];
    index += 1;
    while (index < lines.length && lines[index]?.trim() !== "```") {
      yaml.push(lines[index] ?? "");
      index += 1;
    }
    const raw = parseSimpleYaml(yaml.join("\n"));
    if (Object.keys(raw).length > 0) blocks.push({ line: startLine, section, raw });
  }
  return blocks;
};

const blockToEntries = (
  block: ParsedBlock,
  at: string,
): Array<Omit<CorpusEntry, "ownerId"> | null> => {
  const raw = block.raw;
  const corpusVersion = "v4-coverage-safety";
  if (raw.assistant && typeof raw.assistant === "object") {
    return [entryFrom(block, at, { entryType: "identity", id: "identity.alexa", domain: "identity", utterance: "Alexa", corpusVersion })];
  }
  if (raw.traits && typeof raw.traits === "object") {
    return Object.entries(raw.traits).map(([key, value]) =>
      entryFrom(block, at, {
        entryType: "trait",
        id: `trait.${key}`,
        domain: "personality",
        utterance: `${key}:${String(value)}`,
        corpusVersion,
      }),
    );
  }
  if (typeof raw.intent === "string" && Array.isArray(raw.aliases)) {
    const intent = raw.intent;
    return raw.aliases.map((alias, index) =>
      entryFrom(block, at, {
        entryType: "intent_example",
        id: `intent.${intent}.${block.line}.${index}`,
        domain: domainForIntent(intent),
        utterance: String(alias),
        intent,
        corpusVersion,
        vectorSeed: true,
      }),
    );
  }
  if (typeof raw.intent === "string" && typeof raw.phrase === "string") {
    return [
      entryFrom(block, at, {
        entryType: "pattern",
        id: `pattern.${raw.intent}.${block.line}`,
        domain: domainForIntent(raw.intent),
        utterance: raw.phrase,
        intent: raw.intent,
        corpusVersion,
      }),
    ];
  }
  if (typeof raw.id === "string" && Array.isArray(raw.must_not_execute)) {
    return [
      entryFrom(block, at, {
        entryType: "negative_intent_example",
        id: raw.id,
        domain: "negative-execution",
        utterance: typeof raw.utterance === "string" ? raw.utterance : raw.id,
        intent: "NON_EXECUTION",
        corpusVersion,
        vectorSeed: Boolean(raw.vector_seed ?? true),
        deterministicCandidate: false,
        mustNotExecute: raw.must_not_execute.map(String),
        blockedIntentCandidates: raw.must_not_execute.map(String),
        reason: typeof raw.reason === "string" ? raw.reason : "negative_example",
      }),
    ];
  }
  if (typeof raw.id === "string" && typeof raw.utterance === "string") {
    const entryType = String(raw.id).startsWith("asr.")
      ? "asr_example"
      : "intent_example";
    return [
      entryFrom(block, at, {
        entryType,
        id: raw.id,
        domain: typeof raw.domain === "string" ? raw.domain : domainForIntent(typeof raw.intent === "string" ? raw.intent : "unknown"),
        utterance: raw.utterance,
        intent: typeof raw.intent === "string" ? raw.intent : null,
        corpusVersion,
        vectorSeed: Boolean(raw.vector_seed ?? raw.vectorSeed ?? true),
        deterministicCandidate: Boolean(raw.deterministic_candidate ?? raw.deterministic ?? false),
        ...(typeof raw.candidate_target === "string"
          ? { entities: { target: raw.candidate_target } }
          : {}),
        tags: [entryType, typeof raw.domain === "string" ? raw.domain : "corpus"],
      }),
    ];
  }
  if (typeof raw.category === "string" && (Array.isArray(raw.responses) || Array.isArray(raw.templates))) {
    const category = raw.category;
    const templates = Array.isArray(raw.responses) ? raw.responses : raw.templates as unknown[];
    return templates.map((response, index) =>
      entryFrom(block, at, {
        entryType: "response_template",
        id: `response.${category}.${block.line}.${index}`,
        domain: category,
        utterance: String(response),
        corpusVersion,
      }),
    );
  }
  if (typeof raw.profile === "string" || (typeof raw.name === "string" && /profile/i.test(block.section))) {
    const profileName = String(raw.profile ?? raw.name);
    return [entryFrom(block, at, { entryType: "personality_profile", id: `profile.${profileName}`, domain: "profile", utterance: profileName, corpusVersion })];
  }
  return [];
};

const entryFrom = (
  block: ParsedBlock,
  at: string,
  input: Partial<Omit<CorpusEntry, "ownerId">> & {
    id: string;
    entryType: CorpusEntry["entryType"];
    domain: string;
    corpusVersion: string;
  },
): Omit<CorpusEntry, "ownerId"> =>
  CorpusEntrySchema.omit({ ownerId: true }).parse({
    id: input.id,
    corpusId: CORPUS_ID,
    corpusVersion: input.corpusVersion,
    entryType: input.entryType,
    domain: input.domain,
    utterance: input.utterance ?? null,
    normalizedUtterance: normalizedOrNull(input.utterance),
    intent: input.intent ?? null,
    entities: input.entities ?? inferEntities(input.intent ?? null, input.utterance ?? null),
    deterministicCandidate: input.deterministicCandidate ?? input.entryType !== "negative_intent_example",
    vectorSeed: input.vectorSeed ?? false,
    requiresAi: false,
    mustNotExecute: input.mustNotExecute ?? [],
    blockedIntentCandidates: input.blockedIntentCandidates ?? [],
    riskLevel: riskForIntent(input.intent ?? null, input.entryType),
    reason: input.reason ?? null,
    tags: input.tags ?? [input.domain, input.entryType],
    sourceSection: block.section,
    sourceLine: block.line,
    raw: block.raw,
    enabled: true,
    createdAt: at,
    updatedAt: at,
  });

const normalizedOrNull = (utterance: string | null | undefined) => {
  if (!utterance) return null;
  const normalized = normalizeCorpusUtterance(utterance);
  return normalized.length ? normalized : null;
};

const manifestFor = (
  entries: Array<Omit<CorpusEntry, "ownerId">>,
  input: { checksum: string; createdAt: string; sourcePath: string; sourceChecksum: string },
) => {
  const entryCounts = entries.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.entryType] = (counts[entry.entryType] ?? 0) + 1;
    return counts;
  }, {});
  return CorpusManifestSchema.parse({
    corpusId: CORPUS_ID,
    corpusVersion: "v4-coverage-safety",
    schemaVersion: SCHEMA_VERSION,
    createdAt: input.createdAt,
    source: {
      kind: "canonical_markdown",
      path: input.sourcePath,
      checksum: input.sourceChecksum,
    },
    checksum: input.checksum,
    entryCounts,
    intentCount: new Set(entries.map((entry) => entry.intent).filter(Boolean)).size,
    aliasCount: entries.filter((entry) => entry.entryType === "alias" || entry.entryType === "intent_example").length,
    exampleCount: entries.filter((entry) => entry.entryType.includes("example")).length,
    negativeExampleCount: entries.filter((entry) => entry.entryType === "negative_intent_example").length,
    vectorSeedCount: entries.filter((entry) => entry.vectorSeed).length,
    profileCount: entries.filter((entry) => entry.entryType === "personality_profile").length,
    breakingChanges: [],
    minimumRuntimeVersion: DEFAULT_RUNTIME_VERSION,
  });
};

const parseSimpleYaml = (source: string): Record<string, unknown> => {
  const root: Record<string, unknown> = {};
  const lines = source.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentMapKey: string | null = null;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const listMatch = line.match(/^\s*-\s*(.*)$/);
    if (listMatch && currentKey) {
      const existing = Array.isArray(root[currentKey]) ? root[currentKey] as unknown[] : [];
      existing.push(parseScalar(listMatch[1] ?? ""));
      root[currentKey] = existing;
      continue;
    }
    const keyMatch = line.match(/^(\s*)([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!keyMatch) continue;
    const indent = keyMatch[1]?.length ?? 0;
    const key = keyMatch[2] ?? "";
    const value = keyMatch[3] ?? "";
    if (indent === 0) {
      currentKey = key;
      currentMapKey = value ? null : key;
      root[key] = value ? parseScalar(value) : {};
      continue;
    }
    if (currentMapKey && typeof root[currentMapKey] === "object" && !Array.isArray(root[currentMapKey])) {
      (root[currentMapKey] as Record<string, unknown>)[key] = value ? parseScalar(value) : {};
    }
  }
  return root;
};

const parseScalar = (value: string): unknown => {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed.replace(/^["']|["']$/g, "");
};

const groupBy = <T>(items: T[], fn: (item: T) => string) =>
  items.reduce<Record<string, T[]>>((groups, item) => {
    const key = fn(item);
    groups[key] = [...(groups[key] ?? []), item];
    return groups;
  }, {});

const issue = (
  ownerId: string,
  manifest: CorpusManifest,
  severity: CorpusValidationIssue["severity"],
  code: string,
  message: string,
  entryId: string | null,
  at: string,
) =>
  CorpusValidationIssueSchema.parse({
    id: crypto.randomUUID(),
    ownerId,
    corpusId: manifest.corpusId,
    corpusVersion: manifest.corpusVersion,
    severity,
    code,
    message,
    entryId,
    createdAt: at,
  });

const domainForIntent = (intent: string) => {
  if (/APPLICATION/.test(intent)) return "application";
  if (/FILE|FOLDER/.test(intent)) return "files";
  if (/NOTE/.test(intent)) return "notes";
  if (/EVENT|CALENDAR|INVITATION|TODAY|UPCOMING/.test(intent)) return "calendar";
  if (/REMINDER/.test(intent)) return "reminders";
  if (/AGENT/.test(intent)) return "agents";
  if (/WORKFLOW/.test(intent)) return "workflows";
  if (/TEST|BUILD|SERVER|REPOSITORY|WORKSPACE|CODE|SYMBOL|DIAGNOSTIC/.test(intent)) return "development";
  if (/GREETING|THANKS|FAREWELL|APOLOGY|STOP|CANCEL|REPEAT|HELP|CONFIRM|DENY/.test(intent)) return "social";
  return "general";
};

const riskForIntent = (intent: string | null, entryType: CorpusEntry["entryType"]) => {
  if (entryType === "negative_intent_example") return "none";
  if (!intent) return "none";
  if (/DELETE|PAY|BUY|PUBLISH|SEND|ARCHIVE|REMOVE_ALL|STOP_ALL/.test(intent)) return "high";
  if (/CREATE|UPDATE|MOVE|RENAME|EXECUTE|RUN|BUILD/.test(intent)) return "medium";
  if (/LAUNCH|OPEN|FOCUS|SEARCH|SHOW|LIST/.test(intent)) return "low";
  return "none";
};

const isHighRiskIntent = (intent: string | null) =>
  Boolean(intent && /DELETE|PAY|BUY|PUBLISH|SEND|ARCHIVE|REMOVE_ALL|STOP_ALL/.test(intent));

const safeRawString = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;

const inferEntities = (intent: string | null, utterance: string | null) => {
  if (!intent || !utterance) return {};
  const normalized = normalizeCorpusUtterance(utterance);
  const entities: Record<string, string> = {};
  if (/APPLICATION|LAUNCH|OPEN|FOCUS/.test(intent)) {
    if (/\b(vs code|vscode|visual studio code|code)\b/.test(normalized)) {
      entities.application = "vscode";
    } else if (/\bchrome|crome\b/.test(normalized)) {
      entities.application = "chrome";
    } else if (/\bsafari\b/.test(normalized)) {
      entities.application = "safari";
    } else if (/\bfinder\b/.test(normalized)) {
      entities.application = "finder";
    } else if (/\bterminal\b/.test(normalized)) {
      entities.application = "terminal";
    }
  }
  return entities;
};
