import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import { Sector } from "../../src/secure-reader/contracts.js";
import "./style.css";
const AdminState = z.object({
  users: z.array(
    z.object({
      id: z.string(),
      email: z.string(),
      role: z.string(),
      enabled: z.boolean(),
    }),
  ),
  documents: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      sector: z.string(),
      classification: z.string(),
      version: z.number(),
      page_count: z.number(),
      sha256: z.string(),
      removed_at: z.string().nullable(),
      watermark: z.unknown(),
    }),
  ),
  documentVersions: z.array(
    z.object({
      document_id: z.string(),
      version: z.number(),
      sha256: z.string(),
      page_count: z.number(),
      title: z.string(),
      created_at: z.string(),
    }),
  ),
  grants: z.array(
    z.object({
      user_id: z.string(),
      document_id: z.string(),
      expires_at: z.string(),
      revoked_at: z.string().nullable(),
    }),
  ),
  sessions: z.array(
    z.object({
      id: z.string(),
      user_id: z.string(),
      device_label: z.string(),
      expires_at: z.string(),
      revoked_at: z.string().nullable(),
    }),
  ),
  audit: z.array(
    z.object({
      id: z.string(),
      at: z.string(),
      actor_id: z.string().nullable(),
      event: z.string(),
      resource_id: z.string().nullable(),
      outcome: z.string(),
    }),
  ),
});
function Admin() {
  const [token, setToken] = useState(""),
    [state, setState] = useState<z.infer<typeof AdminState> | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [manualCode, setManualCode] = useState<null | {
      email: string;
      code: string;
    }>(null),
    [tab, setTab] = useState("Documents"),
    [receipt, setReceipt] = useState<null | {
      title: string;
      sector: string;
      classification: string;
      version: number;
      pageCount: number;
      sha256: string;
    }>(null),
    [preview, setPreview] = useState<null | {
      documentId: string;
      page: number;
      url: string;
    }>(null);
  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }
  useEffect(() => {
    if (!preview) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        URL.revokeObjectURL(preview.url);
        setPreview(null);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [preview]);
  useEffect(() => {
    if (tab !== "Recipients") setManualCode(null);
  }, [tab]);
  useEffect(() => {
    const clearOnHide = () => {
      if (document.visibilityState === "hidden") setManualCode(null);
    };
    document.addEventListener("visibilitychange", clearOnHide);
    return () => document.removeEventListener("visibilitychange", clearOnHide);
  }, []);
  async function call(route: string, method = "GET", body?: unknown, session = token) {
    const r = await fetch(window.location.origin + "/api/secure-reader" + route, {
      method,
      headers: {
        ...(session ? { authorization: `Bearer ${session}` } : {}),
        ...(body && !(body instanceof FormData)
          ? { "content-type": "application/json" }
          : {}),
      },
      ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
    });
    if (!r.ok) {
      if (r.status === 401) {
        closePreview();
        setToken("");
        setState(null);
      }
      throw Error(`Request unavailable (${r.status}).`);
    }
    return r.json() as Promise<unknown>;
  }
  async function refresh(t = token) {
    setState(AdminState.parse(await call("/admin/state", "GET", undefined, t)));
  }
  async function action(fn: () => Promise<unknown>) {
    setError("");
    setMessage("");
    try {
      await fn();
      await refresh();
      setMessage("Change recorded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request unavailable");
    }
  }
  async function showPreview(documentId: string, page: number) {
    setError("");
    try {
      const ticket = z.object({ ticket: z.string() }).parse(
        await call(`/admin/documents/${documentId}/preview-ticket`, "POST", {
          page,
        }),
      ).ticket;
      const response = await fetch(
        window.location.origin + "/api/secure-reader/reader/page",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ ticket }),
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
        },
      );
      if (response.status === 401) {
        closePreview();
        setToken("");
        setState(null);
        throw Error("Session expired.");
      }
      if (
        !response.ok ||
        response.headers.get("content-type")?.split(";")[0] !== "image/png"
      )
        throw Error("Preview unavailable.");
      const bytes = await response.blob();
      if (bytes.size > 8 * 1024 * 1024) throw Error("Preview exceeds limit.");
      const url = URL.createObjectURL(bytes);
      closePreview();
      setPreview({ documentId, page, url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview unavailable.");
    }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (!sent) {
        await call("/auth/start", "POST", { email });
        setSent(true);
      } else {
        const r = z.object({ token: z.string() }).parse(
          await call("/auth/finish", "POST", {
            email,
            code,
            deviceLabel: "Disclosure administration",
          }),
        );
        const s = z
          .object({ role: z.string() })
          .parse(await call("/session", "GET", undefined, r.token));
        if (s.role !== "ADMIN") throw Error("Administrator access required.");
        setToken(r.token);
        setCode("");
        await refresh(r.token);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in unavailable");
    }
  }
  function values(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    return new FormData(e.currentTarget);
  }
  function field(values: FormData, name: string) {
    const value = values.get(name);
    return typeof value === "string" ? value : "";
  }
  return (
    <div className="admin-shell">
      <header>
        <div className="wordmark">
          ATHENA<span>DISCLOSURE ADMINISTRATION</span>
        </div>
        {state && (
          <button
            onClick={() => {
              void call("/session")
                .then((v) => {
                  const s = z.object({ id: z.string() }).parse(v);
                  return call("/sessions/" + s.id, "DELETE");
                })
                .finally(() => {
                  closePreview();
                  setToken("");
                  setState(null);
                });
            }}
          >
            Sign out
          </button>
        )}
      </header>
      {!state ? (
        <section className="login">
          <div className="eyebrow">Administrator access</div>
          <h1>Share with care.</h1>
          <p>Invitations and explicit document permissions.</p>
          <form onSubmit={(e) => void login(e)}>
            <label>
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {sent && (
              <label>
                Email verification code
                <input
                  required
                  maxLength={64}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
            )}
            <button className="primary">
              {sent ? "Sign in" : "Send verification code"}
            </button>
          </form>
          <p className="error">{error}</p>
        </section>
      ) : (
        <>
          <nav className="tabs">
            {["Documents", "Recipients", "Access grants", "Sessions", "Audit"].map(
              (t) => (
                <button
                  className={tab === t ? "active" : ""}
                  onClick={() => setTab(t)}
                  key={t}
                >
                  {t}
                </button>
              ),
            )}
            <button onClick={() => void action(() => refresh())}>Refresh</button>
          </nav>
          <div className="notice" role="status">
            {error ||
              message ||
              "Local review candidate · No production release accepted"}
          </div>
          {tab === "Documents" && (
            <section>
              <h1>Protected publications</h1>
              <p>
                Original PDFs remain in private backend storage. Five MiB / 100 pages
                maximum. No document is automatically granted.
              </p>
              <form
                className="form-grid"
                onSubmit={(e) => {
                  const v = values(e);
                  const file = v.get("pdf");
                  if (!(file instanceof File) || file.size > 5 * 1024 * 1024) {
                    setError("Select a PDF under 5 MiB.");
                    return;
                  }
                  if (
                    v.get("replace") &&
                    !confirm(
                      "Replace this document version? Existing grants remain subject to the server's permission checks; active page tickets become invalid.",
                    )
                  )
                    return;
                  void action(async () => {
                    const digest = await crypto.subtle.digest(
                      "SHA-256",
                      await file.arrayBuffer(),
                    );
                    const expectedSha256 = Array.from(new Uint8Array(digest), (b) =>
                      b.toString(16).padStart(2, "0"),
                    ).join("");
                    const form = new FormData();
                    form.set("pdf", file);
                    const replace = field(v, "replace");
                    const result = z
                      .object({
                        id: z.string(),
                        title: z.string(),
                        sector: z.string(),
                        classification: z.string(),
                        version: z.number(),
                        pageCount: z.number(),
                        sha256: z.string(),
                      })
                      .parse(
                        await call(
                          "/admin/documents?" +
                            new URLSearchParams({
                              title: field(v, "title"),
                              sector: field(v, "sector"),
                              expectedSha256,
                              ...(replace ? { replaceId: replace } : {}),
                            }).toString(),
                          "POST",
                          form,
                        ),
                      );
                    if (result.sha256 !== expectedSha256)
                      throw Error("Upload checksum mismatch.");
                    setReceipt(result);
                    closePreview();
                  });
                }}
              >
                <label>
                  Title
                  <input name="title" required maxLength={120} />
                </label>
                <label>
                  Sector
                  <select name="sector" onChange={() => setReceipt(null)}>
                    {Sector.options.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <p className="form-note">
                  Classification is assigned by the server: Founder Governance is highly
                  restricted; all other sectors are confidential. New documents have no
                  reader grants. Version numbers are assigned by the server.
                </p>
                <label>
                  Replace version
                  <select name="replace">
                    <option value="">New document</option>
                    {state.documents
                      .filter((d) => !d.removed_at)
                      .map((d) => (
                        <option value={d.id} key={d.id}>
                          {d.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  PDF
                  <input name="pdf" type="file" accept="application/pdf" required />
                </label>
                <button className="primary">Upload protected PDF</button>
              </form>
              {receipt && (
                <div className="upload-receipt" role="status">
                  <strong>Upload verified</strong>
                  <span>
                    {receipt.title} · {receipt.sector} · {receipt.classification}
                  </span>
                  <span>
                    {receipt.pageCount} pages · Version {receipt.version}
                  </span>
                  <code>SHA-256 {receipt.sha256}</code>
                </div>
              )}
              {state.documents.map((d) => (
                <article className="admin-row" key={d.id}>
                  <div>
                    <strong>{d.title}</strong>
                    <small>
                      {d.sector} · {d.classification} · {d.page_count} pages · Version{" "}
                      {d.version} {d.removed_at ? "· REMOVED" : ""}
                    </small>
                    <code>{d.id}</code>
                    <details>
                      <summary>Version history and checksums</summary>
                      {state.documentVersions
                        .filter((v) => v.document_id === d.id)
                        .map((v) => (
                          <div className="version-row" key={v.version}>
                            Version {v.version} · {v.page_count} pages ·{" "}
                            {new Date(v.created_at).toLocaleString()}
                            <code>SHA-256 {v.sha256}</code>
                          </div>
                        ))}
                    </details>
                  </div>
                  {!d.removed_at && (
                    <div className="actions">
                      <button onClick={() => void showPreview(d.id, 1)}>
                        Preview page 1
                      </button>
                      <form
                        onSubmit={(e) => {
                          const v = values(e);
                          void action(() =>
                            call(`/admin/documents/${d.id}/watermark`, "PUT", {
                              opacity: Number(v.get("opacity")),
                              placement: v.get("placement"),
                              fontSize: 18,
                            }),
                          );
                        }}
                      >
                        <label>
                          Watermark opacity
                          <input
                            name="opacity"
                            type="number"
                            defaultValue="0.18"
                            min="0.12"
                            max="0.35"
                            step="0.01"
                          />
                        </label>
                        <select name="placement" aria-label="Placement">
                          <option>diagonal</option>
                          <option>horizontal</option>
                        </select>
                        <button>Apply style</button>
                      </form>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `Archive ${d.title}? Reading access ends immediately. Audit and private version history are retained.`,
                            )
                          )
                            void action(async () => {
                              await call("/admin/documents/" + d.id, "DELETE");
                              closePreview();
                            });
                        }}
                      >
                        Archive document
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {preview && (
                <div className="admin-preview">
                  <div>
                    <strong>Protected preview · Page {preview.page}</strong>
                    <button onClick={closePreview}>Close preview</button>
                  </div>
                  <img
                    src={preview.url}
                    alt="Server-rendered watermarked document page"
                    draggable={false}
                  />
                </div>
              )}
            </section>
          )}
          {tab === "Recipients" && (
            <section>
              <h1>Invited recipients</h1>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  const v = values(e);
                  const recipient = field(v, "email");
                  const delivery = field(v, "delivery");
                  setManualCode(null);
                  void action(async () => {
                    const result = await call("/admin/invitations", "POST", {
                      email: recipient,
                      delivery,
                    });
                    if (delivery === "manual") {
                      const issued = z
                        .object({ code: z.string().regex(/^[a-f0-9]{64}$/) })
                        .parse(result);
                      if (document.visibilityState === "visible")
                        setManualCode({ email: recipient, code: issued.code });
                    }
                    return result;
                  });
                }}
              >
                <label>
                  Email address
                  <input name="email" type="email" required />
                </label>
                <label>
                  Delivery
                  <select name="delivery" defaultValue="manual">
                    <option value="manual">
                      Show one-time code for private handoff
                    </option>
                    <option value="email">Send by email, if configured</option>
                  </select>
                </label>
                <button className="primary">Create invitation</button>
              </form>
              {manualCode && (
                <div className="upload-receipt" role="status">
                  <strong>Private invitation code · shown once</strong>
                  <span>{manualCode.email} · expires in 10 minutes · single use</span>
                  <code className="manual-code">{manualCode.code}</code>
                  <small>
                    Share privately with this recipient. Clear this view before leaving
                    the device. The code is not saved to browser storage.
                  </small>
                  <button onClick={() => setManualCode(null)}>Clear code</button>
                </div>
              )}
              {state.users.map((u) => (
                <div className="row" key={u.id}>
                  <span>
                    {u.email}
                    <small>
                      {u.role} · {u.enabled ? "Enabled" : "Disabled"}
                    </small>
                    <code>{u.id}</code>
                  </span>
                  <button
                    disabled={!u.enabled}
                    onClick={() => {
                      if (confirm("Disable this recipient and revoke their sessions?"))
                        void action(() => call(`/admin/users/${u.id}/disable`, "POST"));
                    }}
                  >
                    Disable recipient
                  </button>
                </div>
              ))}
            </section>
          )}
          {tab === "Access grants" && (
            <section>
              <h1>Explicit document access</h1>
              <p>
                Organization membership grants nothing. Founder Governance requires an
                administrator plus an explicit grant.
              </p>
              <form
                className="form-grid"
                onSubmit={(e) => {
                  const v = values(e);
                  void action(() =>
                    call("/admin/grants", "POST", {
                      userId: field(v, "user"),
                      documentId: field(v, "document"),
                      expiresAt: new Date(field(v, "expiry")).toISOString(),
                    }),
                  );
                }}
              >
                <label>
                  Recipient
                  <select name="user">
                    {state.users
                      .filter((u) => u.enabled)
                      .map((u) => (
                        <option value={u.id} key={u.id}>
                          {u.email}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Document
                  <select name="document">
                    {state.documents
                      .filter((d) => !d.removed_at)
                      .map((d) => (
                        <option value={d.id} key={d.id}>
                          {d.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Expiry (local time)
                  <input type="datetime-local" name="expiry" required />
                </label>
                <button className="primary">Grant access</button>
              </form>
              {state.grants.map((g) => (
                <div className="row" key={g.user_id + g.document_id}>
                  <span>
                    {state.users.find((u) => u.id === g.user_id)?.email} →{" "}
                    {state.documents.find((d) => d.id === g.document_id)?.title}
                    <small>
                      {g.revoked_at
                        ? "Revoked"
                        : "Expires " + new Date(g.expires_at).toLocaleString()}
                    </small>
                  </span>
                  <button
                    disabled={!!g.revoked_at}
                    onClick={() =>
                      void action(() =>
                        call(`/admin/grants/${g.user_id}/${g.document_id}`, "DELETE"),
                      )
                    }
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </section>
          )}
          {tab === "Sessions" && (
            <section>
              <h1>Reading sessions</h1>
              {state.sessions.map((s) => (
                <div className="row" key={s.id}>
                  <span>
                    {state.users.find((u) => u.id === s.user_id)?.email} ·{" "}
                    {s.device_label}
                    <small>
                      {s.revoked_at
                        ? "Revoked"
                        : `Expires ${new Date(s.expires_at).toLocaleString()}`}
                    </small>
                  </span>
                  <button
                    disabled={!!s.revoked_at}
                    onClick={() =>
                      void action(() => call("/admin/sessions/" + s.id, "DELETE"))
                    }
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </section>
          )}
          {tab === "Audit" && (
            <section>
              <h1>Disclosure evidence</h1>
              <p>
                Latest 200 events. Content, email codes and bearer tokens are never
                logged here.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Event</th>
                    <th>Actor</th>
                    <th>Resource</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {state.audit.map((a) => (
                    <tr key={a.id}>
                      <td>{new Date(a.at).toLocaleString()}</td>
                      <td>{a.event}</td>
                      <td>
                        <code>{a.actor_id?.slice(0, 8) ?? "—"}</code>
                      </td>
                      <td>
                        <code>{a.resource_id?.slice(0, 8) ?? "—"}</code>
                      </td>
                      <td>{a.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Admin />);
