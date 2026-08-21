import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  ClipboardList,
  Command,
  History,
  Layers3,
  Library,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import type { ApiClient } from "./api.js";

const safetyClass = (safetyLevel: string) =>
  safetyLevel === "critical" || safetyLevel === "high_risk"
    ? "danger-text"
    : safetyLevel === "moderate_risk"
      ? "warning-text"
      : "success-text";

export const CommandsPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [request, setRequest] = useState(
    "Review this repository, identify risks, and create a validation plan.",
  );
  const [savedName, setSavedName] = useState("Repository review");
  const [macroName, setMacroName] = useState("Work Mode");
  const commandCenter = useQuery({
    queryKey: ["command-center"],
    queryFn: apiClient.getCommandCenter,
    refetchInterval: 20_000,
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["command-center"] });
    await queryClient.invalidateQueries({ queryKey: ["agent-society-dashboard"] });
  };
  const submitCommand = useMutation({
    mutationFn: apiClient.submitCommand,
    onSuccess: refresh,
  });
  const saveCommand = useMutation({
    mutationFn: apiClient.saveCommandTemplate,
    onSuccess: refresh,
  });
  const createMacro = useMutation({
    mutationFn: apiClient.createCommandMacro,
    onSuccess: refresh,
  });
  const data = commandCenter.data;
  const latest = submitCommand.data;
  const waitingApproval =
    data?.commands.filter((command) => command.status === "waiting_approval").length ??
    0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    submitCommand.mutate({ request, source: "desktop" });
  };

  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Phase 11</p>
      <h1>Command Center</h1>
      <p>
        Natural-language requests become structured intents, inspectable execution
        plans, approval gates, and auditable command history. The command engine is a
        router, not a bypass: execution still flows through policy, agents, workflows,
        integrations, validation, and human approval.
      </p>

      <section className="status-grid">
        <article className="status-card">
          <span>
            <Command size={14} /> Commands
          </span>
          <strong>{data?.commands.length ?? 0}</strong>
          <small>Owner-scoped command records</small>
        </article>
        <article className="status-card">
          <span>
            <Route size={14} /> Execution plans
          </span>
          <strong>{data?.plans.length ?? 0}</strong>
          <small>Inspectable before routing</small>
        </article>
        <article className="status-card">
          <span>
            <ShieldCheck size={14} /> Waiting approval
          </span>
          <strong>{waitingApproval}</strong>
          <small>Governed by existing approval policy</small>
        </article>
        <article className="status-card">
          <span>
            <AlertTriangle size={14} /> Governance bypass
          </span>
          <strong>{data?.bypassesGovernance ? "Yes" : "No"}</strong>
          <small>Must remain false</small>
        </article>
      </section>

      <section className="panel-list">
        <h2>
          <BrainCircuit size={18} /> Universal command parser
        </h2>
        <form className="policy-form" onSubmit={submit}>
          <label>
            Natural-language request
            <textarea
              rows={4}
              value={request}
              onChange={(event) => setRequest(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button disabled={submitCommand.isPending} type="submit">
              Analyse intent
            </button>
            <button
              disabled={saveCommand.isPending}
              onClick={() =>
                saveCommand.mutate({
                  name: savedName,
                  requestTemplate: request,
                  pinned: true,
                  favorite: true,
                })
              }
              type="button"
            >
              Save command
            </button>
            <button
              disabled={createMacro.isPending}
              onClick={() =>
                createMacro.mutate({
                  name: macroName,
                  description:
                    "Reusable command collection for focused owner-approved work.",
                  commandTemplateIds:
                    data?.templates.slice(0, 3).map((item) => item.id) ?? [],
                  mode: "work",
                })
              }
              type="button"
            >
              Create macro
            </button>
          </div>
          <div className="command-row">
            <label>
              Saved command name
              <input
                value={savedName}
                onChange={(event) => setSavedName(event.target.value)}
              />
            </label>
            <label>
              Macro name
              <input
                value={macroName}
                onChange={(event) => setMacroName(event.target.value)}
              />
            </label>
          </div>
        </form>
      </section>

      {latest ? (
        <section className="panel-list">
          <h2>
            <Sparkles size={18} /> Latest intent analysis
          </h2>
          <article className="panel">
            <p className="eyebrow">
              {latest.command.status} ·{" "}
              <span className={safetyClass(latest.command.safetyLevel)}>
                {latest.command.safetyLevel}
              </span>
            </p>
            <h3>{latest.command.command.action}</h3>
            <p>{latest.plan.summary}</p>
            <small>
              Approval: {latest.command.command.approvalLevel} · Private network:{" "}
              {latest.command.privateNetworkRequired ? "required" : "not required"} ·
              Trusted device:{" "}
              {latest.command.trustedDeviceRequired ? "required" : "not required"}
            </small>
          </article>
          <section className="status-grid">
            {latest.steps.map((step) => (
              <article className="status-card" key={step.id}>
                <span>
                  Step {step.sequence} <ArrowRight size={13} /> {step.executionProvider}
                </span>
                <strong>{step.status}</strong>
                <small>{step.title}</small>
              </article>
            ))}
          </section>
        </section>
      ) : null}

      <section className="panel-list">
        <h2>
          <ClipboardList size={18} /> Intent inspector
        </h2>
        {data?.intentAnalyses.slice(0, 8).map((intent) => (
          <article className="panel" key={intent.id}>
            <p className="eyebrow">
              {intent.category} · confidence {Math.round(intent.confidence * 100)}%
            </p>
            <h3>{intent.primaryGoal}</h3>
            <p>{intent.contextSummary}</p>
            <small>
              Capabilities: {intent.requiredCapabilities.join(" · ")} · Permissions:{" "}
              {intent.requiredPermissions.join(" · ")}
            </small>
          </article>
        ))}
        {!data?.intentAnalyses.length ? (
          <article className="panel">
            <p className="eyebrow">No commands yet</p>
            <h3>Submit a request to inspect structured intent.</h3>
            <p>Ambiguous requests create clarification sessions instead of guessing.</p>
          </article>
        ) : null}
      </section>

      <section className="panel-list">
        <h2>
          <History size={18} /> Command history
        </h2>
        {data?.history.slice(0, 6).map((history) => (
          <article className="panel" key={history.id}>
            <p className="eyebrow">{history.outcome}</p>
            <h3>{history.originalRequest}</h3>
            <p>{history.lessonsLearned.join(" ")}</p>
            <small>
              Agents: {history.agentsInvolved.join(" · ") || "none"} · Approvals:{" "}
              {history.approvals.join(" · ") || "none"}
            </small>
          </article>
        ))}
      </section>

      <section className="panel-list">
        <h2>
          <Library size={18} /> Saved commands, macros, and suggestions
        </h2>
        <section className="status-grid">
          <article className="status-card">
            <span>Templates</span>
            <strong>{data?.templates.length ?? 0}</strong>
            <small>
              {data?.templates.map((template) => template.name).join(" · ")}
            </small>
          </article>
          <article className="status-card">
            <span>Saved</span>
            <strong>{data?.savedCommands.length ?? 0}</strong>
            <small>
              {data?.savedCommands.map((command) => command.name).join(" · ") ||
                "No saved commands yet"}
            </small>
          </article>
          <article className="status-card">
            <span>Macros</span>
            <strong>{data?.macros.length ?? 0}</strong>
            <small>
              {data?.macros.map((macro) => macro.name).join(" · ") || "No macros yet"}
            </small>
          </article>
          <article className="status-card">
            <span>
              <Layers3 size={14} /> Suggestions
            </span>
            <strong>{data?.suggestions.length ?? 0}</strong>
            <small>{data?.suggestions[0]?.title ?? "No suggestions yet"}</small>
          </article>
        </section>
      </section>
    </section>
  );
};
