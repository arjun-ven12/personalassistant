import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, Boxes, GitBranch, Network, RefreshCcw } from "lucide-react";
import { useMemo, useState } from "react";

import type { ProviderSelectionRequest } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";

export const ApplicationIntelligencePage = ({
  apiClient,
}: {
  apiClient: ApiClient;
}) => {
  const queryClient = useQueryClient();
  const [capabilityId, setCapabilityId] = useState("CodeEditing.OpenFile");
  const intelligence = useQuery({
    queryKey: ["application-intelligence"],
    queryFn: apiClient.getApplicationIntelligence,
    refetchInterval: 10_000,
  });
  const selectProvider = useMutation({
    mutationFn: (input: ProviderSelectionRequest) =>
      apiClient.selectApplicationProvider(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["application-intelligence"] });
    },
  });
  const data = intelligence.data;
  const capabilities = data?.capabilities ?? [];
  const providerCapabilities = useMemo(
    () => data?.providerCapabilities ?? [],
    [data?.providerCapabilities],
  );
  const latestSelection =
    selectProvider.data?.selection ?? data?.providerSelectionHistory[0] ?? null;
  const coverageByDomain = useMemo(() => {
    const map = new Map<string, number>();
    for (const capability of providerCapabilities) {
      map.set(capability.domain, (map.get(capability.domain) ?? 0) + 1);
    }
    return map;
  }, [providerCapabilities]);

  return (
    <section className="desktop-center">
      <div className="voice-hero">
        <div>
          <p className="eyebrow">Phase 18A · Universal Application Intelligence</p>
          <h2>Application Intelligence Center</h2>
          <p>
            Planner-facing capabilities are application-independent. Trusted
            applications become interchangeable providers selected by health,
            permissions, context, and memory.
          </p>
        </div>
        <div className="voice-hero-actions">
          <button
            disabled={intelligence.isFetching}
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ["application-intelligence"],
              })
            }
            type="button"
          >
            <RefreshCcw size={15} /> Refresh
          </button>
        </div>
      </div>

      <section className="status-grid">
        <article className="status-card">
          <span>Semantic domains</span>
          <strong>{data?.domains.length ?? 0}</strong>
          <small>extensible capability families</small>
        </article>
        <article className="status-card">
          <span>Capabilities</span>
          <strong>{capabilities.length}</strong>
          <small>planner-visible semantic actions</small>
        </article>
        <article className="status-card">
          <span>Provider mappings</span>
          <strong>{providerCapabilities.length}</strong>
          <small>trusted apps implementing capabilities</small>
        </article>
        <article className="status-card">
          <span>Raw automation</span>
          <strong>
            {data?.rawApplicationAutomationAvailable ? "Available" : "Blocked"}
          </strong>
          <small>must remain blocked</small>
        </article>
      </section>

      <section className="voice-lab-layout">
        <article className="glass-panel">
          <p className="eyebrow">
            <BrainCircuit size={13} /> Provider Selection Engine
          </p>
          <h3>Resolve a semantic capability</h3>
          <form
            className="voice-form"
            onSubmit={(event) => {
              event.preventDefault();
              selectProvider.mutate({
                capabilityId,
                origin: "dashboard",
              });
            }}
          >
            <select
              value={capabilityId}
              onChange={(event) => setCapabilityId(event.target.value)}
            >
              {capabilities.map((capability) => (
                <option key={capability.capabilityId} value={capability.capabilityId}>
                  {capability.capabilityId}
                </option>
              ))}
            </select>
            <button disabled={selectProvider.isPending} type="submit">
              Select provider
            </button>
          </form>
          {latestSelection ? (
            <div className="notice">
              <strong>
                {latestSelection.selected
                  ? `${latestSelection.selectedProviderId} selected`
                  : "No provider selected"}
              </strong>
              <span>{latestSelection.decisionReason}</span>
            </div>
          ) : null}
        </article>

        <article className="glass-panel">
          <p className="eyebrow">
            <Boxes size={13} /> Semantic Domains
          </p>
          <div className="voice-shortcut-list">
            {(data?.domains ?? []).map((domain) => (
              <div className="voice-shortcut-card" key={domain.id}>
                <strong>{domain.displayName}</strong>
                <span>{domain.description}</span>
                <small>
                  {coverageByDomain.get(domain.domain) ?? 0} provider mappings
                </small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="status-grid">
        {providerCapabilities.slice(0, 12).map((capability) => (
          <article className="status-card" key={capability.id}>
            <span>{capability.domain.replaceAll("_", " ")}</span>
            <strong>{capability.capabilityId}</strong>
            <small>
              {capability.providerId} · {capability.implementation}
            </small>
            <small>
              permission {capability.permissionState} · health{" "}
              {capability.healthState}
            </small>
          </article>
        ))}
      </section>

      <article className="panel">
        <p className="eyebrow">
          <Network size={13} /> Selection history
        </p>
        {(data?.providerSelectionHistory ?? []).slice(0, 8).map((selection) => (
          <div className="timeline-row" key={selection.id}>
            <strong>{selection.capabilityId}</strong>
            <span>
              {selection.selectedProviderId ?? "none"} ·{" "}
              {new Date(selection.createdAt).toLocaleTimeString()}
            </span>
            <small>{selection.decisionReason}</small>
          </div>
        ))}
        {data?.providerSelectionHistory.length === 0 ? (
          <p>No provider selection decisions have been recorded yet.</p>
        ) : null}
      </article>

      <article className="panel">
        <p className="eyebrow">
          <GitBranch size={13} /> Cross-application workflows
        </p>
        {(data?.crossApplicationWorkflows ?? []).map((workflow) => (
          <div className="timeline-row" key={workflow.id}>
            <strong>{workflow.name}</strong>
            <span>{workflow.status}</span>
            <small>{workflow.capabilityIds.join(" → ")}</small>
          </div>
        ))}
      </article>
    </section>
  );
};
