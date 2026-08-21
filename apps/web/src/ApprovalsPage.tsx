import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ApiClientError, type ApiClient } from "./api.js";

export const ApprovalsPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [recentApprovalId, setRecentApprovalId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const approvals = useQuery({
    queryKey: ["approvals"],
    queryFn: () => apiClient.getApprovals(),
  });
  const recentAuthenticate = useMutation({
    mutationFn: async () => {
      if (!recentApprovalId) throw new Error("No approval selected.");
      const challenge = await apiClient.createRecentAuthChallenge(
        "approve_high_risk_action",
      );
      await apiClient.verifyRecentPassword({
        challengeId: challenge.challengeId,
        challengeToken: challenge.challengeToken,
        password,
      });
      return apiClient.approveApproval(recentApprovalId);
    },
    onSuccess: async () => {
      setRecentApprovalId(null);
      await queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
    onSettled: () => {
      setPassword("");
    },
  });
  const decide = useMutation({
    mutationFn: ({
      action,
      approvalId,
    }: {
      action: "approve" | "reject" | "cancel";
      approvalId: string;
    }) => {
      if (action === "approve") return apiClient.approveApproval(approvalId);
      if (action === "reject") return apiClient.rejectApproval(approvalId);
      return apiClient.cancelApproval(approvalId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["approvals"] }),
        queryClient.invalidateQueries({ queryKey: ["policy-evaluations"] }),
        queryClient.invalidateQueries({ queryKey: ["audit"] }),
      ]);
    },
  });

  return (
    <section className="placeholder-page wide-page governance-page">
      <p className="eyebrow">Digest-bound owner decisions</p>
      <h1>Approvals</h1>
      <p>
        Approvals authorize only the exact canonical proposal. They never call an
        executor. High-risk decisions require a fresh password verification.
      </p>
      {approvals.isPending ? <p>Loading approvals…</p> : null}
      {approvals.error instanceof ApiClientError ? (
        <p className="form-error">{approvals.error.message}</p>
      ) : null}
      {decide.error instanceof Error ? (
        <p className="form-error">{decide.error.message}</p>
      ) : null}
      {approvals.data?.length === 0 ? (
        <div className="notice">No approval requests have been created.</div>
      ) : null}
      <div className="registry-list">
        {approvals.data?.map((approval) => {
          const pending = approval.status === "PENDING";
          const needsRecentAuth =
            approval.approvalRequirement === "recent_authentication";
          return (
            <article key={approval.id}>
              <div className="registry-card-heading">
                <div>
                  <span className={`trust-pill trust-${approval.status.toLowerCase()}`}>
                    {approval.status}
                  </span>
                  <h2>{approval.toolName}</h2>
                  <p>{approval.humanSummary}</p>
                </div>
                <div className="device-actions">
                  <button
                    disabled={!pending || decide.isPending}
                    onClick={() => {
                      if (needsRecentAuth) {
                        setRecentApprovalId(approval.id);
                      } else {
                        decide.mutate({
                          action: "approve",
                          approvalId: approval.id,
                        });
                      }
                    }}
                    type="button"
                  >
                    Approve
                  </button>
                  <button
                    className="danger-button"
                    disabled={!pending || decide.isPending}
                    onClick={() =>
                      decide.mutate({
                        action: "reject",
                        approvalId: approval.id,
                      })
                    }
                    type="button"
                  >
                    Reject
                  </button>
                  <button
                    className="text-button"
                    disabled={!pending || decide.isPending}
                    onClick={() =>
                      decide.mutate({
                        action: "cancel",
                        approvalId: approval.id,
                      })
                    }
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Risk</dt>
                  <dd>{approval.riskLevel}</dd>
                </div>
                <div>
                  <dt>Requirement</dt>
                  <dd>{approval.approvalRequirement}</dd>
                </div>
                <div>
                  <dt>Requested</dt>
                  <dd>{new Date(approval.requestedAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Expires</dt>
                  <dd>{new Date(approval.expiresAt).toLocaleString()}</dd>
                </div>
              </dl>
              {approval.applicationId || approval.workspaceId ? (
                <small>Target: {approval.applicationId ?? approval.workspaceId}</small>
              ) : null}
              {needsRecentAuth && pending ? (
                <div className="notice">
                  Password recent authentication is required. Approval will not execute
                  the underlying action.
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {recentApprovalId ? (
        <div role="dialog" aria-modal="true" aria-labelledby="recent-auth-title">
          <h2 id="recent-auth-title">Confirm this high-risk approval</h2>
          <p>
            Re-enter your owner password. The password is submitted directly and is
            never retained by this page.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              recentAuthenticate.mutate();
            }}
          >
            <label>
              Password
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>
            <button disabled={!password || recentAuthenticate.isPending} type="submit">
              Authenticate and approve
            </button>
            <button
              className="text-button"
              onClick={() => {
                setPassword("");
                setRecentApprovalId(null);
              }}
              type="button"
            >
              Cancel
            </button>
          </form>
          {recentAuthenticate.error instanceof Error ? (
            <p className="form-error">{recentAuthenticate.error.message}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
