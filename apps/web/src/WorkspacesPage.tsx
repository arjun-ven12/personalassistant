import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import type { GitPermissions, WorkspacePermissions } from "@alexa-control/shared";

import { ApiClientError, type ApiClient } from "./api.js";

const emptyWorkspacePermissions: WorkspacePermissions = {
  read: false,
  write: false,
  createFile: false,
  modifyFile: false,
  moveFile: false,
  deleteFile: false,
  runScripts: false,
};
const emptyGitPermissions: GitPermissions = {
  status: false,
  diff: false,
  createBranch: false,
  commit: false,
  push: false,
};

export const WorkspacesPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [id, setId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [rootPath, setRootPath] = useState("");
  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: apiClient.getWorkspaces,
  });
  const create = useMutation({
    mutationFn: apiClient.createWorkspace,
    onSuccess: async () => {
      setId("");
      setDisplayName("");
      setRootPath("");
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
  const update = useMutation({
    mutationFn: ({
      workspaceId,
      input,
    }: {
      workspaceId: string;
      input: Parameters<ApiClient["updateWorkspace"]>[1];
    }) => apiClient.updateWorkspace(workspaceId, input),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
  });
  const disable = useMutation({
    mutationFn: apiClient.disableWorkspace,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({
      id,
      displayName,
      rootPath,
      enabled: false,
      permissions: emptyWorkspacePermissions,
      blockedPatterns: [],
      allowedScripts: [],
      gitPermissions: emptyGitPermissions,
    });
  };

  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Lexical metadata registry</p>
      <h1>Workspaces</h1>
      <p>
        The API does not inspect or access these paths during Phase 2.3. File browsing,
        script execution, and permanent deletion are unavailable.
      </p>
      <form className="registry-form" onSubmit={submit}>
        <label>
          Stable ID
          <input
            onChange={(event) => setId(event.target.value)}
            placeholder="project.main"
            required
            value={id}
          />
        </label>
        <label>
          Display name
          <input
            onChange={(event) => setDisplayName(event.target.value)}
            required
            value={displayName}
          />
        </label>
        <label>
          Absolute metadata path
          <input
            onChange={(event) => setRootPath(event.target.value)}
            placeholder="/Users/name/project"
            required
            value={rootPath}
          />
        </label>
        <button disabled={create.isPending} type="submit">
          Register metadata
        </button>
      </form>
      {create.error instanceof Error ? (
        <p className="form-error">{create.error.message}</p>
      ) : null}

      <div className="registry-list">
        {workspaces.isPending ? <p>Loading workspaces…</p> : null}
        {workspaces.error instanceof ApiClientError ? (
          <p className="form-error">{workspaces.error.message}</p>
        ) : null}
        {workspaces.data?.length === 0 ? (
          <div className="notice">No workspace metadata is registered.</div>
        ) : null}
        {workspaces.data?.map((workspace) => (
          <article key={workspace.id}>
            <div className="registry-card-heading">
              <div>
                <span
                  className={`trust-pill ${workspace.enabled ? "trust-trusted" : ""}`}
                >
                  {workspace.enabled ? "ENABLED" : "DISABLED"}
                </span>
                <h2>{workspace.displayName}</h2>
                <code>{workspace.rootPath}</code>
                <small>{workspace.id}</small>
              </div>
              <div className="device-actions">
                <button
                  onClick={() =>
                    update.mutate({
                      workspaceId: workspace.id,
                      input: { enabled: !workspace.enabled },
                    })
                  }
                  type="button"
                >
                  {workspace.enabled ? "Turn off" : "Enable metadata"}
                </button>
                <button
                  className="danger-button"
                  disabled={!workspace.enabled}
                  onClick={() => disable.mutate(workspace.id)}
                  type="button"
                >
                  Disable
                </button>
              </div>
            </div>
            <h3>Workspace permissions</h3>
            <div className="permission-grid">
              {Object.entries(workspace.permissions).map(([permission, enabled]) => (
                <label key={permission}>
                  <input
                    checked={enabled}
                    disabled={permission === "deleteFile"}
                    onChange={(event) =>
                      update.mutate({
                        workspaceId: workspace.id,
                        input: {
                          permissions: {
                            ...workspace.permissions,
                            [permission]: event.target.checked,
                          },
                        },
                      })
                    }
                    type="checkbox"
                  />
                  {permission}
                </label>
              ))}
            </div>
            <h3>Git permissions</h3>
            <div className="permission-grid">
              {Object.entries(workspace.gitPermissions).map(([permission, enabled]) => (
                <label key={permission}>
                  <input
                    checked={enabled}
                    onChange={(event) =>
                      update.mutate({
                        workspaceId: workspace.id,
                        input: {
                          gitPermissions: {
                            ...workspace.gitPermissions,
                            [permission]: event.target.checked,
                          },
                        },
                      })
                    }
                    type="checkbox"
                  />
                  {permission}
                </label>
              ))}
            </div>
            <details>
              <summary>Blocked patterns ({workspace.blockedPatterns.length})</summary>
              <code>{workspace.blockedPatterns.join(", ")}</code>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
};
