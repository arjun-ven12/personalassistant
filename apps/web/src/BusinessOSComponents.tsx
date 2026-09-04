import { AlertTriangle, ArrowRight, CircleHelp, MessageCircle } from "lucide-react";
import type {
  BusinessAttentionItem,
  BusinessOSExecutiveSummary,
  ExecutionChain,
} from "@alexa-control/shared";

export const ContextualAskAlexa = ({
  kind,
  id,
  label,
}: {
  kind: string;
  id: string;
  label: string;
}) => {
  const query = new URLSearchParams({
    contextKind: kind,
    contextId: id,
    contextLabel: label,
  });
  return (
    <a className="contextual-ask" href={`/conversation?${query.toString()}`}>
      <MessageCircle size={14} /> Ask Athena
    </a>
  );
};

export const NeedsAttentionFeed = ({
  data,
  compact = false,
}: {
  data: BusinessOSExecutiveSummary | undefined;
  compact?: boolean;
}) => {
  const items = data?.attention.slice(0, compact ? 5 : 20) ?? [];
  return (
    <section className={`business-attention${compact ? " is-compact" : ""}`}>
      <header>
        <div>
          <span className="eyebrow">Needs attention</span>
          <h2>Owner supervision</h2>
        </div>
        <strong>{data?.summary.attentionCount ?? 0}</strong>
      </header>
      {items.map((item) => (
        <AttentionRow item={item} key={item.id} />
      ))}
      {!items.length ? (
        <div className="business-empty">
          <strong>Nothing needs intervention</strong>
          <span>
            Athena has no unresolved owner actions or system-handled incidents.
          </span>
        </div>
      ) : null}
    </section>
  );
};

const AttentionRow = ({ item }: { item: BusinessAttentionItem }) => (
  <article className={`attention-row severity-${item.severity.toLowerCase()}`}>
    <AlertTriangle size={15} />
    <div>
      <span>{item.handling.replaceAll("_", " ")}</span>
      <strong>{item.title}</strong>
      <p>{item.summary}</p>
      <small>
        {item.currentResponse} Owner action: {item.ownerAction}
      </small>
    </div>
    {item.entity.route ? (
      <a href={item.entity.route}>
        {item.handling === "OWNER_ACTION_REQUIRED" ? "Resolve" : "Inspect"}
        <ArrowRight size={13} />
      </a>
    ) : null}
  </article>
);

export const ExecutionChainStrip = ({
  chain,
}: {
  chain: ExecutionChain | undefined;
}) => {
  if (!chain) return null;
  return (
    <section className="execution-chain">
      <header>
        <div>
          <span className="eyebrow">Execution chain</span>
          <h3>How this work connects</h3>
        </div>
      </header>
      <div>
        {chain.nodes.map((node, index) => (
          <span key={`${node.kind}:${node.id}`}>
            {index ? <ArrowRight size={13} /> : null}
            {node.route ? (
              <a href={node.route}>
                <small>{node.kind.replaceAll("_", " ")}</small>
                <strong>{node.label}</strong>
              </a>
            ) : (
              <span>
                <small>{node.kind}</small>
                <strong>{node.label}</strong>
              </span>
            )}
          </span>
        ))}
      </div>
    </section>
  );
};

export const StructuredExplanation = ({
  explanation,
}: {
  explanation: BusinessOSExecutiveSummary["explanations"][number] | undefined;
}) => {
  if (!explanation) return null;
  return (
    <details className="structured-explanation">
      <summary>
        <CircleHelp size={14} /> Why?
      </summary>
      <h3>{explanation.heading}</h3>
      <dl>
        {explanation.evidence.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <p>{explanation.conclusion}</p>
    </details>
  );
};
