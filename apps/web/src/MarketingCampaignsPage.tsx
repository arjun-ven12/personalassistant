import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  FileText,
  Image,
  Layers3,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { MarketingArtifact, MarketingDeliverable } from "@alexa-control/shared";
import type { ApiClient } from "./api.js";

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not recorded";

const formatMoney = (minor: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(minor / 100);

const displayStatus = (value: string) => value.replaceAll("_", " ").toLowerCase();

const activeDeliverable = (item: MarketingDeliverable) => item.status === "RUNNING";

type ArtifactCategory = "all" | "copy" | "research" | "brand" | "ads" | "analytics" | "image" | "video" | "package";

const artifactCategory = (artifact: MarketingArtifact): Exclude<ArtifactCategory, "all"> => {
  switch (artifact.type) {
    case "RESEARCH": return "research";
    case "BRAND_STRATEGY":
    case "POSITIONING":
    case "MESSAGING": return "brand";
    case "AD_CONCEPT":
    case "AD_COPY": return "ads";
    case "ANALYTICS_REPORT": return "analytics";
    case "IMAGE_ASSET": return "image";
    case "VIDEO_ASSET": return "video";
    case "LAUNCH_PACKAGE": return "package";
    default: return "copy";
  }
};

const categoryOptions: ReadonlyArray<{ id: ArtifactCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "copy", label: "Copy" },
  { id: "research", label: "Research" },
  { id: "brand", label: "Brand" },
  { id: "ads", label: "Ads" },
  { id: "analytics", label: "Analytics" },
  { id: "image", label: "Images" },
  { id: "video", label: "Video" },
  { id: "package", label: "Packages" },
];

const StructuredValue = ({ value, depth = 0 }: { value: unknown; depth?: number }) => {
  if (value === null) return <span className="marketing-artifact-null">Not provided</span>;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <span>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (!value.length) return <span className="marketing-artifact-null">None</span>;
    const items: unknown[] = value;
    return <ol className="marketing-artifact-list">{items.map((item, index) => <li key={index}><StructuredValue depth={depth + 1} value={item} /></li>)}</ol>;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return <span className="marketing-artifact-null">No fields</span>;
    return <dl className={depth ? "marketing-artifact-fields nested" : "marketing-artifact-fields"}>{entries.map(([key, item]) => <div key={key}><dt>{displayStatus(key)}</dt><dd><StructuredValue depth={depth + 1} value={item} /></dd></div>)}</dl>;
  }
  return <span className="marketing-artifact-null">Unsupported value</span>;
};

export const MarketingCampaignsPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const campaigns = useQuery({
    queryKey: ["marketing-campaigns"],
    queryFn: apiClient.getMarketingCampaigns,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: "always",
  });
  const [selectedId, setSelectedId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("campaign"),
  );
  const [artifactFilter, setArtifactFilter] = useState<ArtifactCategory>("all");
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const selectedCampaign = useMemo(
    () => campaigns.data?.campaigns.find((campaign) => campaign.id === selectedId) ?? campaigns.data?.campaigns[0],
    [campaigns.data?.campaigns, selectedId],
  );
  const detail = useQuery({
    queryKey: ["marketing-campaign", selectedCampaign?.id],
    queryFn: () => apiClient.getMarketingCampaign(selectedCampaign!.id),
    enabled: Boolean(selectedCampaign),
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: "always",
  });

  useEffect(() => {
    if (selectedCampaign && selectedCampaign.id !== selectedId) setSelectedId(selectedCampaign.id);
  }, [selectedCampaign, selectedId]);

  const campaign = detail.data?.campaign ?? selectedCampaign;
  const active = campaign?.deliverables.filter(activeDeliverable) ?? [];
  const assets = detail.data?.artifacts.filter((artifact) =>
    artifact.type === "IMAGE_ASSET" || artifact.type === "VIDEO_ASSET",
  ) ?? [];
  const filteredArtifacts = useMemo(() => (detail.data?.artifacts ?? [])
    .filter((artifact) => artifactFilter === "all" || artifactCategory(artifact) === artifactFilter)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt)), [artifactFilter, detail.data?.artifacts]);
  const selectedArtifact = filteredArtifacts.find((artifact) => artifact.id === selectedArtifactId) ?? filteredArtifacts[0];
  const unavailable = campaign?.deliverables.filter((item) => item.status === "TOOL_UNAVAILABLE") ?? [];
  const landingPreview = campaign?.deliverables.find((item) =>
    item.type === "LANDING_PAGE" && item.artifactRef?.startsWith("engineering-delivery:") && campaign.firstEngineeringPreviewAt,
  );

  useEffect(() => {
    setSelectedArtifactId((current) => filteredArtifacts.some((artifact) => artifact.id === current) ? current : filteredArtifacts[0]?.id ?? null);
  }, [filteredArtifacts]);

  return (
    <section className="marketing-page">
      <header className="marketing-header">
        <div>
          <span className="eyebrow"><Megaphone size={14} /> Marketing</span>
          <h1>Campaigns</h1>
          <p>Review campaign drafts, work state, stored assets, governance, costs, and verified previews.</p>
        </div>
        <button className="marketing-refresh" onClick={() => void campaigns.refetch()} type="button">
          <RefreshCw size={15} /> Refresh
        </button>
      </header>

      {campaigns.isError ? (
        <p className="marketing-notice error"><AlertTriangle size={15} /> Campaigns could not be loaded. No campaign state is shown.</p>
      ) : null}

      <div className="marketing-workspace">
        <aside className="marketing-campaign-list" aria-label="Campaigns">
          <header><h2>Campaign drafts</h2><span>{campaigns.data?.campaigns.length ?? 0}</span></header>
          {campaigns.data?.campaigns.map((item) => (
            <button
              aria-pressed={item.id === campaign?.id}
              className={item.id === campaign?.id ? "selected" : ""}
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              type="button"
            >
              <span className={`marketing-status status-${item.status.toLowerCase()}`}>{displayStatus(item.status)}</span>
              <strong>{item.title}</strong>
              <small>{item.productOrCompany} · {item.deliverables.length} deliverables</small>
            </button>
          ))}
          {!campaigns.isLoading && !campaigns.data?.campaigns.length ? (
            <div className="marketing-empty"><strong>No campaign drafts</strong><p>Create a governed campaign draft through the Marketing API to inspect it here.</p></div>
          ) : null}
        </aside>

        <article className="marketing-detail">
          {!campaign ? (
            <div className="marketing-empty"><strong>Select a campaign</strong><p>Campaign progress is available only after a stored campaign draft exists.</p></div>
          ) : (
            <>
              <header className="marketing-detail-header">
                <div>
                  <span className={`marketing-status status-${campaign.status.toLowerCase()}`}>{displayStatus(campaign.status)}</span>
                  <h2>{campaign.title}</h2>
                  <p>{campaign.productOrCompany} · {displayStatus(campaign.objectiveType)} · {campaign.channels.length ? campaign.channels.join(", ") : "No channel selected"}</p>
                </div>
                <small>Updated {formatDate(campaign.updatedAt)}</small>
              </header>

              {detail.isError ? <p className="marketing-notice error"><AlertTriangle size={15} /> Campaign detail could not be verified. Summary data may be stale.</p> : null}
              {unavailable.length ? <p className="marketing-notice warning"><AlertTriangle size={15} /> {unavailable.length} creative deliverable{unavailable.length === 1 ? " is" : "s are"} unavailable; no asset generation is claimed.</p> : null}

              <section className="marketing-summary" aria-label="Campaign summary">
                <div><span>Progress</span><strong>{detail.data ? `${detail.data.progressPercent}%` : "Unavailable"}</strong><i><b style={{ width: `${detail.data?.progressPercent ?? 0}%` }} /></i></div>
                <div><span>Active work</span><strong>{active.length}</strong><small>{active.length ? "Deliverables running" : "No running deliverables"}</small></div>
                <div><span>Approvals pending</span><strong>{detail.data?.approvalsPending ?? "Unavailable"}</strong><small>Public actions remain unavailable</small></div>
                <div><span>Preview</span><strong>{campaign.firstEngineeringPreviewAt ? "Verified" : "Not available"}</strong><small>{formatDate(campaign.firstEngineeringPreviewAt)}</small></div>
              </section>

              <section className="marketing-section">
                <header><h3><Timer size={15} /> Deliverables</h3><span>{campaign.deliverables.length} planned</span></header>
                <div className="marketing-deliverables">
                  {campaign.deliverables.map((item) => (
                    <article key={item.id}>
                      <div><strong>{displayStatus(item.type)}</strong><small>{displayStatus(item.role)} · v{item.version}</small></div>
                      <span className={`marketing-status status-${item.status.toLowerCase()}`}>{displayStatus(item.status)}</span>
                      <small>{item.approvalState === "NOT_REQUIRED" ? "No approval required" : `Approval ${displayStatus(item.approvalState)}`}</small>
                    </article>
                  ))}
                </div>
              </section>

              <section className="marketing-section marketing-artifact-browser">
                <header><h3><Layers3 size={15} /> Artifact browser</h3><span>{detail.data?.artifacts.length ?? 0} stored</span></header>
                <nav aria-label="Artifact categories" className="marketing-artifact-filters">
                  {categoryOptions.map((option) => (
                    <button aria-pressed={artifactFilter === option.id} key={option.id} onClick={() => setArtifactFilter(option.id)} type="button">
                      {option.label}<span>{(detail.data?.artifacts ?? []).filter((artifact) => option.id === "all" || artifactCategory(artifact) === option.id).length}</span>
                    </button>
                  ))}
                </nav>
                {filteredArtifacts.length ? (
                  <div className="marketing-artifact-workspace">
                    <div className="marketing-artifact-index" role="list">
                      {filteredArtifacts.map((artifact) => (
                        <button aria-pressed={artifact.id === selectedArtifact?.id} key={artifact.id} onClick={() => setSelectedArtifactId(artifact.id)} role="listitem" type="button">
                          <FileText size={14} /><span><strong>{displayStatus(artifact.type)}</strong><small>{artifact.status} · v{artifact.version}</small></span>
                        </button>
                      ))}
                    </div>
                    {selectedArtifact ? (
                      <article className="marketing-artifact-inspector">
                        <header><div><span className={`marketing-status status-${selectedArtifact.status.toLowerCase()}`}>{displayStatus(selectedArtifact.status)}</span><h4>{displayStatus(selectedArtifact.type)}</h4></div><small>{formatDate(selectedArtifact.createdAt)}</small></header>
                        <StructuredValue value={selectedArtifact.content} />
                        <footer>
                          <code>Digest {selectedArtifact.contentDigest.slice(0, 16)}…</code>
                          {selectedArtifact.externalRef ? <span>External reference: <code>{selectedArtifact.externalRef}</code></span> : null}
                        </footer>
                      </article>
                    ) : null}
                  </div>
                ) : <p className="marketing-muted">No stored artifacts match this category.</p>}
              </section>

              <section className="marketing-section marketing-preview-inspector">
                <header><h3><Eye size={15} /> Landing preview</h3><span>{landingPreview ? "Verified" : "Unavailable"}</span></header>
                {landingPreview ? (
                  <div><ShieldCheck size={18} /><span><strong>Engineering preview verified</strong><small>{formatDate(campaign.firstEngineeringPreviewAt)}</small><code>{landingPreview.artifactRef}</code></span></div>
                ) : <p className="marketing-muted">No healthy Engineering preview reference was supplied by the campaign API.</p>}
              </section>

              <div className="marketing-lower-grid">
                <section className="marketing-section">
                  <header><h3><Image size={15} /> Assets</h3><span>{assets.length} stored</span></header>
                  {assets.length ? <div className="marketing-assets">{assets.map((asset) => <article key={asset.id}><strong>{displayStatus(asset.type)}</strong><small>{asset.status} · v{asset.version} · {formatDate(asset.createdAt)}</small><code>{asset.contentDigest.slice(0, 12)}…</code></article>)}</div> : <p className="marketing-muted">No stored image or video asset. Provider availability alone does not create an asset.</p>}
                </section>
                <section className="marketing-section">
                  <header><h3><CircleDollarSign size={15} /> Cost and budget</h3></header>
                  <dl className="marketing-costs">
                    <div><dt>Tool cost</dt><dd>Not aggregated</dd></div>
                    <div><dt>Unknown tool costs</dt><dd>Not aggregated</dd></div>
                    <div><dt>Tool budget</dt><dd>{formatMoney(campaign.toolBudgetMinor)}</dd></div>
                    <div><dt>Ad budget</dt><dd>{formatMoney(campaign.adBudgetMinor)}</dd></div>
                    <div><dt>Model budget</dt><dd>{campaign.modelBudgetCredits} credits</dd></div>
                  </dl>
                </section>
              </div>

              <footer className="marketing-footer"><CheckCircle2 size={15} /> This is a review view. Publishing, paid activation, and spend controls are unavailable.</footer>
            </>
          )}
        </article>
      </div>
    </section>
  );
};
