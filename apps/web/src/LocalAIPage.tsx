import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Gauge, ShieldCheck } from "lucide-react";
import type { ApiClient } from "./api.js";

export type AIRuntimeView = "models" | "routing" | "context" | "usage" | "evaluation";

export const LocalAIPage = ({
  apiClient,
  view = "models",
}: {
  apiClient: ApiClient;
  view?: AIRuntimeView;
}) => {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState(
    "take me back to that coding thing I was working on earlier",
  );
  const [monthlyOpenAILimit, setMonthlyOpenAILimit] = useState("5");
  const [overflowBehavior, setOverflowBehavior] = useState<"DENY" | "REQUIRE_APPROVAL">(
    "DENY",
  );
  const [budgetFormTouched, setBudgetFormTouched] = useState(false);
  const health = useQuery({
    queryKey: ["local-ai-health"],
    queryFn: apiClient.getLocalAIHealth,
    refetchInterval: 10_000,
  });
  const stats = useQuery({
    queryKey: ["local-ai-stats"],
    queryFn: apiClient.getLocalAIStats,
    refetchInterval: 10_000,
  });
  const providers = useQuery({
    queryKey: ["ai-providers"],
    queryFn: apiClient.getAIProviders,
    refetchInterval: 10_000,
  });
  const models = useQuery({
    queryKey: ["ai-models"],
    queryFn: apiClient.getAIModels,
    refetchInterval: 10_000,
  });
  const roles = useQuery({
    queryKey: ["ai-roles"],
    queryFn: apiClient.getAIRoles,
    refetchInterval: 10_000,
  });
  const activity = useQuery({
    queryKey: ["ai-activity"],
    queryFn: apiClient.getAIActivity,
    refetchInterval: 10_000,
  });
  const routerMetrics = useQuery({
    queryKey: ["ai-router-metrics"],
    queryFn: apiClient.getAIRouterMetrics,
    refetchInterval: 10_000,
  });
  const economics = useQuery({
    queryKey: ["ai-economics-overview"],
    queryFn: apiClient.getAIEconomicOverview,
    refetchInterval: 10_000,
  });
  const economicHealth = useQuery({
    queryKey: ["ai-economics-health"],
    queryFn: apiClient.getAIEconomicHealth,
    refetchInterval: 10_000,
  });
  const budgets = useQuery({
    queryKey: ["ai-economics-budgets"],
    queryFn: apiClient.getAIBudgets,
    refetchInterval: 10_000,
  });
  const activeOpenAIBudget = budgets.data?.find(
    (budget) =>
      budget.scope === "PROVIDER" &&
      budget.scopeId === "openai" &&
      budget.period === "MONTHLY" &&
      budget.enabled,
  );
  useEffect(() => {
    if (!activeOpenAIBudget || budgetFormTouched) return;
    setMonthlyOpenAILimit(activeOpenAIBudget.limitUsd);
    setOverflowBehavior(
      activeOpenAIBudget.overflowBehavior === "REQUIRE_APPROVAL"
        ? "REQUIRE_APPROVAL"
        : "DENY",
    );
  }, [activeOpenAIBudget, budgetFormTouched]);
  const refreshEconomics = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["ai-economics-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["ai-economics-health"] }),
      queryClient.invalidateQueries({ queryKey: ["ai-economics-budgets"] }),
      queryClient.invalidateQueries({ queryKey: ["approvals"] }),
    ]);
  };
  const saveOpenAIBudget = useMutation({
    mutationFn: async () => {
      const current = activeOpenAIBudget;
      const body = {
        scope: "PROVIDER" as const,
        scopeId: "openai",
        period: "MONTHLY" as const,
        currency: "USD" as const,
        limitUsd: monthlyOpenAILimit,
        warningThresholdPct: current?.warningThresholdPct ?? 70,
        throttleThresholdPct: current?.throttleThresholdPct,
        hardStopThresholdPct: current?.hardStopThresholdPct ?? 100,
        overflowBehavior,
        enabled: true,
        priority: current?.priority,
        maxCallsPerMinute: current?.maxCallsPerMinute,
        maxCallsPerRun: current?.maxCallsPerRun,
        maxCloudCallsPerRun: current?.maxCloudCallsPerRun,
        effectiveFrom: current?.effectiveFrom ?? new Date().toISOString(),
        effectiveUntil: current?.effectiveUntil,
      };
      return current
        ? apiClient.updateAIBudget(current.id, body)
        : apiClient.createAIBudget(body);
    },
    onSuccess: async () => {
      setBudgetFormTouched(false);
      await refreshEconomics();
    },
  });
  const disableBudget = useMutation({
    mutationFn: (id: string) => apiClient.deleteAIBudget(id),
    onSuccess: refreshEconomics,
  });
  const contextProfiles = useQuery({
    queryKey: ["ai-context-profiles"],
    queryFn: apiClient.getAIContextProfiles,
  });
  const contextHealth = useQuery({
    queryKey: ["ai-context-health"],
    queryFn: apiClient.getAIContextHealth,
    refetchInterval: 10_000,
  });
  const contextDryRun = useMutation({
    mutationFn: () =>
      apiClient.simulateAIContext({
        purpose: "INTERPRETATION",
        taskText: prompt,
        requestedProfile: "VOICE_INTERPRETATION",
        privacy: "STANDARD",
        maxContextTokens: 2_000,
      }),
  });
  const runtimeHealth = useQuery({
    queryKey: ["ai-runtime-health"],
    queryFn: apiClient.getAIRuntimeHealth,
    refetchInterval: 10_000,
  });
  const benchmarkSuites = useQuery({
    queryKey: ["ai-benchmark-suites"],
    queryFn: apiClient.getAIBenchmarkSuites,
  });
  const benchmarkRuns = useQuery({
    queryKey: ["ai-benchmark-runs"],
    queryFn: apiClient.getAIBenchmarkRuns,
    refetchInterval: 10_000,
  });
  const benchmark = useMutation({
    mutationFn: () =>
      apiClient.runAIBenchmark({
        suiteId: benchmarkSuites.data?.[0]?.id ?? "alexa-core-deterministic",
        mode: "DRY_RUN",
      }),
  });
  const test = useMutation({
    mutationFn: () => apiClient.testLocalAI({ mode: "interpretation", prompt }),
  });
  const data = health.data;
  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Phase 20C</p>
      <h1>AI Runtime Studio</h1>
      <p>
        Ordinary inference uses the canonical Router → Context → Provider path. Ollama
        is optional, and validated model output never grants execution authority.
      </p>
      <section className="status-grid">
        <article className="status-card">
          <span>
            <Cpu size={14} /> Runtime
          </span>
          <strong>{data?.runtime ?? "loading"}</strong>
          <small>{data?.runtimeAvailable ? "connected" : "unavailable"}</small>
        </article>
        <article className="status-card">
          <span>
            <ShieldCheck size={14} /> Model
          </span>
          <strong>{data?.model ?? "—"}</strong>
          <small>{data?.modelAvailable ? "installed" : "not installed"}</small>
        </article>
        <article className="status-card">
          <span>
            <Gauge size={14} /> Queue
          </span>
          <strong>{data?.queueDepth ?? 0}</strong>
          <small>{data?.averageLatencyMs ?? 0} ms average</small>
        </article>
        <article className="status-card">
          <span>Requests</span>
          <strong>{stats.data?.requestCount ?? 0}</strong>
          <small>{stats.data?.failureCount ?? 0} failures</small>
        </article>
      </section>
      {view === "evaluation" ? <section className="panel-list">
        <h2>Runtime health and benchmarks</h2>
        <article className="panel">
          <p>
            {runtimeHealth.data?.overall ?? "loading"} ·{" "}
            {runtimeHealth.data?.readiness ?? "—"}
          </p>
          <small>
            {runtimeHealth.data?.components.length ?? 0} components ·{" "}
            {benchmarkSuites.data?.length ?? 0} suites ·{" "}
            {benchmarkRuns.data?.length ?? 0} recorded runs
          </small>
          <br />
          <button
            type="button"
            onClick={() => benchmark.mutate()}
            disabled={benchmark.isPending || !benchmarkSuites.data?.length}
          >
            Run safe dry-run suite
          </button>
          {benchmark.data ? (
            <pre>{JSON.stringify(benchmark.data.metrics, null, 2)}</pre>
          ) : null}
        </article>
      </section> : null}
      {view === "context" ? <section className="panel-list">
        <h2>Context Engine</h2>
        <article className="panel">
          <p>
            {contextHealth.data?.status ?? "loading"} · owner scope{" "}
            {contextHealth.data?.ownerScopeReady ? "READY" : "NOT READY"} · privacy
            filter {contextHealth.data?.privacyFilterReady ? "READY" : "NOT READY"}
          </p>
          <small>
            Sources:{" "}
            {contextHealth.data?.registeredSources
              .map(
                (source) =>
                  `${source} ${contextHealth.data?.healthySources.includes(source) ? "READY" : contextHealth.data?.degradedSources.includes(source) ? "DEGRADED" : "NOT READY"}`,
              )
              .join(" · ") ?? "loading"}
          </small>
          {contextHealth.data?.requiredSourceFailures.length ? (
            <p className="danger-text">
              Required failures: {contextHealth.data.requiredSourceFailures.join(", ")}
            </p>
          ) : null}
          <p>
            <small>Profiles: {contextProfiles.data?.join(", ") ?? "loading"}</small>
          </p>
          <p className="danger-text">
            Context previews can contain private owner data. Use this authenticated
            diagnostic only when needed; secret and provider-ineligible blocks remain
            omitted.
          </p>
          <button
            type="button"
            onClick={() => contextDryRun.mutate()}
            disabled={contextDryRun.isPending || !prompt.trim()}
          >
            Compose safe context dry-run
          </button>
          {contextDryRun.data ? (
            <pre>
              {JSON.stringify(
                {
                  providerBoundary: contextDryRun.data.providerBoundary,
                  selected: contextDryRun.data.blocks.map((block) => ({
                    id: block.id,
                    source: block.sourceType,
                    score: block.score,
                    tokens: block.estimatedTokens,
                    scope: block.scope,
                    trust: block.trustLevel,
                    sensitivity: block.sensitivity,
                    provenance: block.sourceReferences,
                  })),
                  omitted: contextDryRun.data.omittedCandidates,
                  conflicts: contextDryRun.data.conflicts,
                  sufficiency: contextDryRun.data.sufficiency,
                  tokenBudget: {
                    used: contextDryRun.data.estimatedTokens,
                    allowed: contextDryRun.data.maxAllowedTokens,
                  },
                },
                null,
                2,
              )}
            </pre>
          ) : null}
        </article>
      </section> : null}
      {view === "usage" ? <section className="panel-list">
        <h2>Economics</h2>
        <article className="panel">
          <p>
            Economic authority: {economicHealth.data?.status ?? "loading"} ·{" "}
            {economicHealth.data?.persistence ?? "unknown persistence"} · pricing{" "}
            {economicHealth.data?.pricingEntries ?? 0}
          </p>
          {economicHealth.data?.reasons.length ? (
            <small className="danger-text">
              {economicHealth.data.reasons.join(" · ")}
            </small>
          ) : null}
          <p>
            Cloud spend: ${economics.data?.monthToDateSpendUsd ?? "0"} / $
            {economics.data?.budgetLimitUsd ?? "—"} · remaining $
            {economics.data?.remainingUsd ?? "0"}
          </p>
          <small>
            Projected month-end ${economics.data?.projectedMonthEndUsd ?? "0"} ·{" "}
            7-day-rate projection $
            {economics.data?.projectedMonthlyFromSevenDayUsd ?? "0"} ·{" "}
            {economics.data?.health ?? "loading"} · local{" "}
            {economics.data?.localRequests ?? 0} · cloud{" "}
            {economics.data?.cloudRequests ?? 0}
          </small>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveOpenAIBudget.mutate();
            }}
          >
            <label>
              OpenAI monthly budget
              <input
                inputMode="decimal"
                min="0.01"
                onChange={(event) => {
                  setBudgetFormTouched(true);
                  setMonthlyOpenAILimit(event.target.value);
                }}
                step="0.01"
                type="number"
                value={monthlyOpenAILimit}
              />
            </label>
            <label>
              Overflow
              <select
                onChange={(event) => {
                  setBudgetFormTouched(true);
                  setOverflowBehavior(
                    event.target.value === "REQUIRE_APPROVAL"
                      ? "REQUIRE_APPROVAL"
                      : "DENY",
                  );
                }}
                value={overflowBehavior}
              >
                <option value="DENY">Deny when exhausted</option>
                <option value="REQUIRE_APPROVAL">Ask for approval</option>
              </select>
            </label>
            <button
              disabled={
                saveOpenAIBudget.isPending ||
                !/^\d+(\.\d{1,8})?$/.test(monthlyOpenAILimit)
              }
              type="submit"
            >
              Save OpenAI budget
            </button>
          </form>
          {saveOpenAIBudget.error instanceof Error ? (
            <p className="danger-text">{saveOpenAIBudget.error.message}</p>
          ) : null}
          {saveOpenAIBudget.data ? (
            <p>
              <small>
                Active OpenAI budget: ${saveOpenAIBudget.data.limitUsd} per{" "}
                {saveOpenAIBudget.data.period.toLowerCase()}.
              </small>
            </p>
          ) : null}
          {budgets.data?.length ? (
            <div>
              <h3>Budget policies</h3>
              {budgets.data.map((budget) => (
                <p key={budget.id}>
                  <strong>
                    {budget.scope}
                    {budget.scopeId ? ` / ${budget.scopeId}` : ""}
                  </strong>{" "}
                  ${budget.limitUsd} {budget.period.toLowerCase()} ·{" "}
                  {budget.overflowBehavior.toLowerCase()} ·{" "}
                  {budget.enabled ? "enabled" : "disabled"}{" "}
                  {budget.enabled ? (
                    <button
                      className="text-button"
                      disabled={disableBudget.isPending}
                      onClick={() => disableBudget.mutate(budget.id)}
                      type="button"
                    >
                      Disable
                    </button>
                  ) : null}
                </p>
              ))}
            </div>
          ) : (
            <p>
              <small>No AI budget policies are configured yet.</small>
            </p>
          )}
          {disableBudget.error instanceof Error ? (
            <p className="danger-text">{disableBudget.error.message}</p>
          ) : null}
        </article>
      </section> : null}
      {view === "routing" ? <section className="panel-list">
        <h2>Routing overview</h2>
        <article className="panel">
          <p>
            Total routes: {routerMetrics.data?.total ?? 0} · no AI:{" "}
            {routerMetrics.data?.noAI ?? 0} · local: {routerMetrics.data?.local ?? 0} ·
            cloud: {routerMetrics.data?.cloud ?? 0}
          </p>
          <small>
            Escalated {routerMetrics.data?.escalated ?? 0} · clarified{" "}
            {routerMetrics.data?.clarified ?? 0} · retries{" "}
            {routerMetrics.data?.retries ?? 0} · failed{" "}
            {routerMetrics.data?.failed ?? 0}
          </small>
        </article>
      </section> : null}
      {view === "models" ? <section className="panel-list">
        <h2>Providers</h2>
        {providers.data?.map((provider) => (
          <article className="panel" key={provider.providerId}>
            <p className="eyebrow">
              {provider.providerType} · {provider.credentialState}
            </p>
            <h3>{provider.displayName}</h3>
            <p>
              {provider.enabled ? "Enabled" : "Disabled"} ·{" "}
              {provider.configured ? "Configured" : "Not configured"}
            </p>
          </article>
        ))}
      </section> : null}
      {view === "usage" ? <section className="panel-list">
        <h2>Models and roles</h2>
        {models.data?.map((model) => (
          <article className="panel" key={`${model.providerId}:${model.modelId}`}>
            <p className="eyebrow">
              {model.locality} · {model.providerId}
            </p>
            <h3>{model.displayName}</h3>
            <p>
              {model.modelId} · {model.capabilities.reasoning ? "reasoning" : "text"}
            </p>
          </article>
        ))}
        {roles.data?.map((role) => (
          <article className="panel" key={role.role}>
            <p className="eyebrow">{role.role}</p>
            <h3>
              {role.providerId} / {role.modelId}
            </h3>
          </article>
        ))}
      </section> : null}
      {view === "routing" ? <section className="panel-list">
        <h2>Runtime activity</h2>
        {activity.data?.slice(0, 8).map((event, index) => (
          <article
            className="panel"
            key={`${event.requestId}:${event.createdAt}:${event.providerId}:${event.modelId}:${index}`}
          >
            <p className="eyebrow">
              {event.purpose} · {event.providerId} · {event.status}
            </p>
            <h3>{event.modelId}</h3>
            <small>{event.latencyMs} ms</small>
          </article>
        ))}
      </section> : null}
      <section className="panel-list">
        <h2>Canonical routing test</h2>
        <article className="panel">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
          />
          <button
            type="button"
            onClick={() => test.mutate()}
            disabled={test.isPending || !prompt.trim()}
          >
            Route structured interpretation
          </button>
          {test.data ? <pre>{JSON.stringify(test.data, null, 2)}</pre> : null}
          {test.error ? (
            <p className="danger-text">Local inference unavailable or invalid.</p>
          ) : null}
        </article>
      </section>
    </section>
  );
};
