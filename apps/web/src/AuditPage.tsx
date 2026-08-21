import { useQuery } from "@tanstack/react-query";

import type { ApiClient } from "./api.js";

export const AuditPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const audit = useQuery({
    queryKey: ["audit"],
    queryFn: apiClient.getAudit,
    refetchInterval: 15_000,
  });

  return (
    <section className="placeholder-page wide-page" aria-labelledby="audit-heading">
      <p className="eyebrow">Security evidence</p>
      <h1 id="audit-heading">Audit log</h1>
      <p>
        Development-only in-memory records. Secrets, passwords, session tokens, private
        keys, and public-key material are excluded.
      </p>
      <div className="audit-list">
        {audit.isPending ? <p>Loading audit records…</p> : null}
        {audit.data?.map((record) => (
          <article key={record.id}>
            <div>
              <strong>{record.eventType.replaceAll("_", " ")}</strong>
              <span>{record.outcome}</span>
            </div>
            <p>{record.reason}</p>
            <small>
              {new Date(record.timestamp).toLocaleString()} · request {record.requestId}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
};
