import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, GitBranch, HelpCircle, RotateCcw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import type { ApiClient } from "./api.js";

const percent = (value: number | undefined) =>
  `${Math.round((value ?? 0) * 100)}%`;

export const PersonalityPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [simulationText, setSimulationText] = useState("Launch VS Code");
  const [whyText, setWhyText] = useState("Understood boss. Opening VS Code.");
  const [corpusPath, setCorpusPath] = useState(
    "/Users/arjunaravapalli/Downloads/Alexa_Personality_Seed_Corpus_v4_coverage_safety.md",
  );
  const [corpusUtterance, setCorpusUtterance] = useState("bro just open vscode");
  const dashboard = useQuery({
    queryKey: ["human-understanding"],
    queryFn: apiClient.getHumanUnderstanding,
    refetchInterval: 10_000,
  });
  const bootstrap = useMutation({
    mutationFn: apiClient.bootstrapPersonality,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["human-understanding"] });
    },
  });
  const reset = useMutation({
    mutationFn: apiClient.resetPersonality,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["human-understanding"] });
    },
  });
  const simulation = useMutation({
    mutationFn: apiClient.simulateHumanUnderstanding,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["human-understanding"] });
    },
  });
  const profileSwitch = useMutation({
    mutationFn: apiClient.switchPersonalityProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["human-understanding"] });
    },
  });
  const personalitySimulation = useMutation({
    mutationFn: apiClient.simulatePersonalityProfiles,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["human-understanding"] });
    },
  });
  const why = useMutation({
    mutationFn: apiClient.explainPersonalityResponse,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["human-understanding"] });
    },
  });
  const importCorpus = useMutation({
    mutationFn: apiClient.importPersonalityCorpus,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["human-understanding"] });
    },
  });
  const testCorpus = useMutation({
    mutationFn: apiClient.testCorpusUtterance,
  });

  const latest = simulation.data ?? dashboard.data?.lastUnderstanding ?? null;
  const confidenceRows = useMemo(
    () =>
      latest
        ? [
            ["Vocabulary", latest.confidence.vocabulary],
            ["Alias", latest.confidence.alias],
            ["Synonym", latest.confidence.synonym],
            ["Pattern", latest.confidence.pattern],
            ["Behaviour", latest.confidence.behaviour],
            ["Intent", latest.confidence.intent],
            ["Entity", latest.confidence.entity],
            ["Context", latest.confidence.context],
            ["Memory", latest.confidence.memory],
          ]
        : [],
    [latest],
  );

  return (
    <section className="voice-center conversation-center">
      <div className="voice-hero">
        <div>
          <p className="eyebrow">Phase 19A · Personality Core</p>
          <h2>Human Understanding Engine</h2>
          <p>
            Deterministic-first understanding: vocabulary, aliases, synonyms,
            patterns, behaviour rules, memory retrieval, confidence scoring, then
            Planner. AI remains a last-resort capability provider.
          </p>
        </div>
        <div className="voice-hero-actions">
          <button disabled={bootstrap.isPending} onClick={() => bootstrap.mutate()}>
            <Sparkles size={15} /> Bootstrap
          </button>
          <button disabled={reset.isPending} onClick={() => reset.mutate()}>
            <RotateCcw size={15} /> Reset
          </button>
        </div>
      </div>

      <div className="voice-grid">
        <article className="hud-card">
          <p className="eyebrow">
            <BrainCircuit size={13} /> Current profile
          </p>
          <h3>{dashboard.data?.profile.name ?? "Loading"}</h3>
          <p>{dashboard.data?.profile.speechStyle ?? "Model-independent personality."}</p>
        </article>
        <article className="hud-card">
          <p className="eyebrow">Identity</p>
          <h3>{dashboard.data?.identity.assistantName ?? "Alexa"}</h3>
          <p>{dashboard.data?.identity.mission ?? "Owner-scoped model-independent assistant."}</p>
        </article>
        <article className="hud-card">
          <p className="eyebrow">State</p>
          <h3>{latest?.conversationState ?? dashboard.data?.conversationStates[0]?.state ?? "IDLE"}</h3>
          <p>{latest?.confidence.band.replaceAll("_", " ") ?? "Waiting for input."}</p>
        </article>
        <article className="hud-card">
          <p className="eyebrow">
            <HelpCircle size={13} /> Clarifications
          </p>
          <h3>{dashboard.data?.clarifications.filter((item) => item.status === "open").length ?? 0}</h3>
          <p>Low confidence asks before AI fallback.</p>
        </article>
      </div>

      <section className="glass-panel">
        <p className="eyebrow">Personality Studio</p>
        <h3>Profiles, traits, policies, and working style</h3>
        <div className="voice-grid">
          {(dashboard.data?.traits ?? []).slice(0, 6).map((trait) => (
            <article className="hud-card" key={trait.id}>
              <p className="eyebrow">{trait.key.replaceAll("_", " ")}</p>
              <h3>{trait.value}%</h3>
              <p>{trait.description}</p>
            </article>
          ))}
        </div>
        <div className="voice-timeline">
          {(dashboard.data?.interactionPolicies ?? []).slice(0, 6).map((policy) => (
            <article key={policy.id}>
              <strong>{policy.policyKey.replaceAll("_", " ")}</strong>
              <span>
                {policy.enforcement} · priority {policy.priority} · {policy.description}
              </span>
            </article>
          ))}
        </div>
        <div className="voice-actions">
          {["Alexa Default", "Founder", "Developer", "Research", "Trading", "Presentation", "Focus", "Travel"].map(
            (name) => (
              <button
                disabled={profileSwitch.isPending || dashboard.data?.profile.name === name}
                key={name}
                onClick={() => profileSwitch.mutate(name)}
              >
                {name}
              </button>
            ),
          )}
        </div>
      </section>

      <section className="glass-panel">
        <p className="eyebrow">Personality Seed Corpus</p>
        <h3>{dashboard.data?.corpus.manifest?.corpusVersion ?? "No active corpus"}</h3>
        <div className="voice-grid">
          <article className="hud-card">
            <p className="eyebrow">Entries</p>
            <h3>{dashboard.data?.corpus.entries.length ?? 0}</h3>
            <p>Structured corpus records loaded into runtime tables.</p>
          </article>
          <article className="hud-card">
            <p className="eyebrow">Vector seeds</p>
            <h3>{dashboard.data?.corpus.manifest?.vectorSeedCount ?? 0}</h3>
            <p>Seeded through existing memory/vector retrieval infrastructure.</p>
          </article>
          <article className="hud-card">
            <p className="eyebrow">Negative examples</p>
            <h3>{dashboard.data?.corpus.manifest?.negativeExampleCount ?? 0}</h3>
            <p>Discussion, hypotheticals, negation, and quoted commands block execution.</p>
          </article>
        </div>
        <form
          className="voice-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (corpusPath.trim()) importCorpus.mutate(corpusPath.trim());
          }}
        >
          <input
            value={corpusPath}
            onChange={(event) => setCorpusPath(event.target.value)}
            placeholder="Canonical corpus markdown path"
          />
          <button disabled={importCorpus.isPending} type="submit">
            Import Corpus
          </button>
        </form>
        <form
          className="voice-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (corpusUtterance.trim()) testCorpus.mutate(corpusUtterance.trim());
          }}
        >
          <input
            value={corpusUtterance}
            onChange={(event) => setCorpusUtterance(event.target.value)}
            placeholder='Try: "I am reading about how to delete a file"'
          />
          <button disabled={testCorpus.isPending} type="submit">
            Test Utterance
          </button>
        </form>
        {testCorpus.data ? (
          <div className="voice-timeline">
            <article>
              <strong>{testCorpus.data.normalizedInput || "(empty)"}</strong>
              <span>
                {testCorpus.data.candidateIntent ?? "no intent"} · confidence{" "}
                {percent(testCorpus.data.confidence)} · AI used:{" "}
                {testCorpus.data.aiUsed ? "yes" : "no"}
              </span>
            </article>
            <article>
              <strong>{testCorpus.data.mustNotExecute ? "Must not execute" : "Executable candidate allowed"}</strong>
              <span>{testCorpus.data.reason}</span>
            </article>
          </div>
        ) : null}
        <div className="voice-timeline">
          {(dashboard.data?.corpus.validationResults ?? []).slice(0, 4).map((result) => (
            <article key={result.id}>
              <strong>{result.status}</strong>
              <span>
                critical {result.criticalCount} · warnings {result.warningCount} ·{" "}
                {result.corpusVersion}
              </span>
            </article>
          ))}
          {(dashboard.data?.corpus.negativeExamples ?? []).slice(0, 5).map((entry) => (
            <article key={entry.id}>
              <strong>{entry.utterance}</strong>
              <span>{entry.reason} · blocks {entry.blockedIntentCandidates.join(", ")}</span>
            </article>
          ))}
        </div>
      </section>

      <div className="voice-lab-layout">
        <section className="glass-panel">
          <p className="eyebrow">Human Understanding Studio</p>
          <h3>Simulate deterministic understanding</h3>
          <form
            className="voice-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (simulationText.trim()) {
                simulation.mutate({
                  text: simulationText.trim(),
                  source: "text",
                  simulateOnly: true,
                });
              }
            }}
          >
            <input
              value={simulationText}
              onChange={(event) => setSimulationText(event.target.value)}
              placeholder='Try: "Create a note called Sprint Ideas"'
            />
            <button disabled={simulation.isPending} type="submit">
              Understand
            </button>
          </form>
          {latest ? (
            <div className="voice-timeline">
              <article>
                <strong>{latest.normalizedText}</strong>
                <span>
                  {latest.selectedIntent?.intentId ?? "no intent"} · overall{" "}
                  {percent(latest.confidence.overall)}
                </span>
              </article>
              {latest.clarification ? (
                <article>
                  <strong>{latest.clarification.question}</strong>
                  <span>{latest.clarification.reason}</span>
                </article>
              ) : null}
            </div>
          ) : (
            <p>No understanding request has been inspected yet.</p>
          )}
        </section>

        <section className="glass-panel">
          <p className="eyebrow">
            <GitBranch size={13} /> Confidence Engine
          </p>
          <h3>{latest ? percent(latest.confidence.overall) : "Idle"}</h3>
          <div className="voice-timeline">
            {confidenceRows.map(([label, value]) => (
              <article key={label as string}>
                <strong>{label}</strong>
                <span>{percent(value as number)}</span>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="voice-lab-layout">
        <section className="glass-panel">
          <p className="eyebrow">Personality Simulation</p>
          <h3>No-AI behaviour preview</h3>
          <form
            className="voice-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (simulationText.trim()) {
                personalitySimulation.mutate(simulationText.trim());
              }
            }}
          >
            <input
              value={simulationText}
              onChange={(event) => setSimulationText(event.target.value)}
              placeholder="Try: Explain Docker"
            />
            <button disabled={personalitySimulation.isPending} type="submit">
              Simulate Profiles
            </button>
          </form>
          <div className="voice-timeline">
            {(personalitySimulation.data ?? dashboard.data?.personalitySimulations ?? [])
              .slice(0, 8)
              .map((item) => (
                <article key={item.id}>
                  <strong>{item.profileName}</strong>
                  <span>
                    {item.responsePreview} · AI used: {item.aiUsed ? "yes" : "no"}
                  </span>
                </article>
              ))}
          </div>
        </section>

        <section className="glass-panel">
          <p className="eyebrow">Why did I respond this way?</p>
          <h3>Response inspector</h3>
          <form
            className="voice-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (whyText.trim()) {
                why.mutate({ response: whyText.trim(), plannerConfidence: latest?.confidence.overall ?? null, aiUsed: false });
              }
            }}
          >
            <input
              value={whyText}
              onChange={(event) => setWhyText(event.target.value)}
              placeholder="Paste a response to inspect"
            />
            <button disabled={why.isPending} type="submit">
              Explain
            </button>
          </form>
          <div className="voice-timeline">
            {(why.data ? [why.data] : dashboard.data?.responseExplanations ?? []).slice(0, 4).map((item) => (
              <article key={item.id}>
                <strong>{item.response}</strong>
                <span>
                  {item.influencedBy.slice(0, 5).join(" · ")} · AI used: {item.aiUsed ? "yes" : "no"}
                </span>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="voice-lab-layout">
        <section className="glass-panel">
          <p className="eyebrow">Pipeline stages</p>
          <div className="voice-timeline">
            {(latest?.stages ?? []).map((stage) => (
              <article key={stage.id}>
                <strong>{stage.stage}</strong>
                <span>
                  {percent(stage.confidence)} · {Math.round(stage.timingMs)}ms
                </span>
              </article>
            ))}
            {!latest?.stages.length ? <p>Stages appear after simulation or voice input.</p> : null}
          </div>
        </section>

        <section className="glass-panel">
          <p className="eyebrow">Entities & memory</p>
          <div className="voice-timeline">
            {(latest?.entities ?? []).slice(0, 8).map((entity) => (
              <article key={`${entity.type}:${entity.normalizedValue}`}>
                <strong>{entity.value}</strong>
                <span>
                  {entity.type} · {entity.source} · {percent(entity.confidence)}
                </span>
              </article>
            ))}
            {(latest?.retrievedMemories ?? []).slice(0, 5).map((memory) => (
              <article key={memory.id}>
                <strong>{memory.title}</strong>
                <span>memory · {percent(memory.confidence)}</span>
              </article>
            ))}
            {!latest?.entities.length && !latest?.retrievedMemories.length ? (
              <p>No entities or retrieved memories for the latest request.</p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="voice-grid">
        <article className="hud-card">
          <p className="eyebrow">Vocabulary</p>
          <h3>{dashboard.data?.vocabulary.length ?? 0}</h3>
          <p>Versioned words, application names, projects, and technical terms.</p>
        </article>
        <article className="hud-card">
          <p className="eyebrow">Aliases</p>
          <h3>{dashboard.data?.aliases.length ?? 0}</h3>
          <p>Editable phrase-to-intent/entity mappings.</p>
        </article>
        <article className="hud-card">
          <p className="eyebrow">Learning</p>
          <h3>{dashboard.data?.preferenceLearning.filter((item) => item.active).length ?? 0}</h3>
          <p>Preferences activate only after statistical evidence thresholds.</p>
        </article>
        <article className="hud-card">
          <p className="eyebrow">Decision preferences</p>
          <h3>{dashboard.data?.decisionPreferences.length ?? 0}</h3>
          <p>Planner receives these before any AI fallback.</p>
        </article>
      </div>
    </section>
  );
};
