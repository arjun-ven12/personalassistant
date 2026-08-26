import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import type { AgentEconomyStatus } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";

export const AgentEconomyPanel = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [allocation, setAllocation] = useState(100);
  const economy = useQuery({
    queryKey: ["agent-economy-dashboard"],
    queryFn: apiClient.getAgentEconomyDashboard,
    refetchInterval: 10_000,
  });
  const agents = useQuery({
    queryKey: ["agents-dashboard"],
    queryFn: apiClient.getAgentsDashboard,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["agent-economy-dashboard"] });
  const enroll = useMutation({ mutationFn: (agentId: string) => apiClient.enrollAgentEconomy(agentId), onSuccess: refresh });
  const allocate = useMutation({
    mutationFn: ({ agentId, amount }: { agentId: string; amount: number }) => apiClient.allocateAgentCredits(agentId, { amount, reasonCode: "OWNER_ALLOCATION", idempotencyKey: `owner-allocation:${agentId}:${crypto.randomUUID()}` }),
    onSuccess: refresh,
  });
  const updateStatus = useMutation({
    mutationFn: ({ agentId, status }: { agentId: string; status: AgentEconomyStatus }) => apiClient.updateAgentEconomyStatus(agentId, status),
    onSuccess: refresh,
  });
  const names = useMemo(() => new Map((agents.data?.agents ?? []).map((agent) => [agent.id, agent.displayName])), [agents.data]);
  const selected = economy.data?.accounts.find((account) => account.agentId === selectedAgentId) ?? economy.data?.accounts[0];
  const performance = economy.data?.performance.find((record) => record.agentId === selected?.agentId);
  const unenrolled = (agents.data?.agents ?? []).filter((agent) => !economy.data?.accounts.some((account) => account.agentId === agent.id));
  const overview = economy.data?.overview;

  return (
    <div className="agent-economy-workspace">
      <div className="compact-metric-strip" aria-label="Agent economy summary">
        <span><small>Allocated</small><strong>{overview?.allocatedCredits ?? 0}</strong></span>
        <span><small>Available</small><strong>{overview?.availableCredits ?? 0}</strong></span>
        <span><small>Reserved</small><strong>{overview?.reservedCredits ?? 0}</strong></span>
        <span><small>Spent</small><strong>{overview?.spentCredits ?? 0}</strong></span>
        <span><small>Active</small><strong>{overview?.activeAgents ?? 0}</strong></span>
        <span><small>Dormant</small><strong>{overview?.dormantAgents ?? 0}</strong></span>
        <span><small>Avg reputation</small><strong>{(overview?.averageReputation ?? 0).toFixed(1)}</strong></span>
      </div>

      {unenrolled.length ? (
        <section className="panel-list">
          <div className="section-heading-row"><div><p className="eyebrow">Enrollment</p><h2>Registered agents without economy accounts</h2></div></div>
          <div className="dense-list">
            {unenrolled.map((agent) => (
              <div className="dense-row" key={agent.id}>
                <div><strong>{agent.displayName}</strong><small>{agent.status} · zero runtime allocated</small></div>
                <button disabled={enroll.isPending} onClick={() => enroll.mutate(agent.id)} type="button">Enroll dormant</button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="split-workspace">
        <section className="panel-list">
          <div className="section-heading-row"><div><p className="eyebrow">Accounts</p><h2>Agent economy</h2></div><span className="mono-meta">{economy.data?.registeredAgents ?? 0} registered</span></div>
          <div className="table-scroll">
            <table className="dense-table">
              <thead><tr><th>Agent</th><th>State</th><th>Credits</th><th>Spent</th><th>Rep</th><th>Tasks</th></tr></thead>
              <tbody>
                {(economy.data?.accounts ?? []).map((account) => {
                  const record = economy.data?.performance.find((item) => item.agentId === account.agentId);
                  return (
                    <tr className={selected?.agentId === account.agentId ? "is-selected" : ""} key={account.agentId} onClick={() => setSelectedAgentId(account.agentId)}>
                      <td>{names.get(account.agentId) ?? account.agentId}</td>
                      <td><span className={`status-badge status-${account.economyStatus.toLowerCase()}`}>{account.economyStatus}</span></td>
                      <td className="mono-number">{account.availableCredits}</td>
                      <td className="mono-number">{account.lifetimeSpent}</td>
                      <td className="mono-number">{account.reputation.toFixed(1)}</td>
                      <td className="mono-number">{record?.tasksCompleted ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel-list economy-inspector">
          <p className="eyebrow">Economy detail</p>
          <h2>{selected ? names.get(selected.agentId) ?? selected.agentId : "Select an agent"}</h2>
          {selected ? (
            <>
              <dl className="compact-definition-list">
                <div><dt>Available</dt><dd>{selected.availableCredits}</dd></div>
                <div><dt>Reserved</dt><dd>{selected.reservedCredits}</dd></div>
                <div><dt>Lifetime earned</dt><dd>{selected.lifetimeEarned}</dd></div>
                <div><dt>Lifetime spent</dt><dd>{selected.lifetimeSpent}</dd></div>
                <div><dt>Reputation</dt><dd>{selected.reputation.toFixed(1)}</dd></div>
                <div><dt>Calibration</dt><dd>{performance ? `${(performance.calibration * 100).toFixed(1)}%` : "No outcomes"}</dd></div>
              </dl>
              <label>Allocate internal credits<input min={1} max={1_000_000} type="number" value={allocation} onChange={(event) => setAllocation(Number(event.target.value))} /></label>
              <button disabled={allocate.isPending || allocation < 1} onClick={() => allocate.mutate({ agentId: selected.agentId, amount: allocation })} type="button">Allocate credits</button>
              <label>Participation<select value={selected.economyStatus} onChange={(event) => updateStatus.mutate({ agentId: selected.agentId, status: event.target.value as AgentEconomyStatus })}><option value="DORMANT">Dormant</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="ECONOMY_DISABLED">Disabled</option></select></label>
            </>
          ) : null}
        </aside>
      </div>

      <section className="panel-list">
        <div className="section-heading-row"><div><p className="eyebrow">Ledger</p><h2>Recent economic events</h2></div><span className="mono-meta">Internal credits, not currency</span></div>
        <div className="dense-list">
          {(economy.data?.ledger ?? []).slice(0, 50).map((entry) => (
            <div className="dense-row" key={entry.id}>
              <div><strong>{entry.type}</strong><small>{names.get(entry.agentId) ?? entry.agentId} · {entry.reasonCode}</small></div>
              <div className="row-meta"><span className="mono-number">{["CREDIT_GRANTED", "REWARD_EARNED"].includes(entry.type) ? "+" : "−"}{entry.amount}</span><time>{new Date(entry.createdAt).toLocaleString()}</time></div>
            </div>
          ))}
          {economy.data?.ledger.length === 0 ? <div className="notice">No economic events yet.</div> : null}
        </div>
      </section>
    </div>
  );
};
