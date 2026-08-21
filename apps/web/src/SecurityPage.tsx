import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { ApiClient } from "./api.js";

export const SecurityPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const [codes, setCodes] = useState<string[]>([]);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [releasePassword, setReleasePassword] = useState("");
  const readiness = useQuery({
    queryKey: ["security-readiness"],
    queryFn: apiClient.getSecurityReadiness,
  });
  const network = useQuery({
    queryKey: ["network-status"],
    queryFn: apiClient.getNetworkStatus,
  });
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: apiClient.getSessions,
  });
  const recovery = useQuery({
    queryKey: ["recovery-code-status"],
    queryFn: apiClient.getRecoveryCodeStatus,
  });
  const generate = useMutation({
    mutationFn: async () => {
      const challenge = await apiClient.createRecentAuthChallenge(
        "generate_recovery_codes",
      );
      await apiClient.verifyRecentPassword({
        challengeId: challenge.challengeId,
        challengeToken: challenge.challengeToken,
        password: recoveryPassword,
      });
      return apiClient.generateRecoveryCodes();
    },
    onSuccess: async (result) => {
      setCodes(result.codes);
      await queryClient.invalidateQueries({ queryKey: ["recovery-code-status"] });
    },
    onSettled: () => setRecoveryPassword(""),
  });
  const releaseStop = useMutation({
    mutationFn: async () => {
      const challenge = await apiClient.createRecentAuthChallenge(
        "modify_security_settings",
      );
      await apiClient.verifyRecentPassword({
        challengeId: challenge.challengeId,
        challengeToken: challenge.challengeToken,
        password: releasePassword,
      });
      return apiClient.releaseEmergencyStop();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["security-readiness"] });
    },
    onSettled: () => setReleasePassword(""),
  });

  return (
    <section className="placeholder-page wide-page">
      <p className="eyebrow">Phase 2.3 security boundary</p>
      <h1>Security</h1>
      <p>
        Network reachability, login, device trust, policy authorization, and execution
        are independent controls.
      </p>
      <div className="registry-list">
        <article>
          <h2>Private networking</h2>
          <p>{network.data?.state ?? "UNKNOWN"}</p>
          <small>{network.data?.reasonCode ?? "Checking network verification…"}</small>
        </article>
        <article>
          <h2>Readiness</h2>
          <dl>
            <div>
              <dt>Database</dt>
              <dd>{readiness.data?.database ?? "unknown"}</dd>
            </div>
            <div>
              <dt>CSRF</dt>
              <dd>{readiness.data?.csrfProtection ? "enabled" : "unknown"}</dd>
            </div>
            <div>
              <dt>Secure cookies</dt>
              <dd>{readiness.data?.secureCookies ? "enabled" : "development"}</dd>
            </div>
            <div>
              <dt>Emergency stop</dt>
              <dd>{readiness.data?.emergencyStopActive ? "active" : "inactive"}</dd>
            </div>
            <div>
              <dt>Execution</dt>
              <dd>unavailable</dd>
            </div>
          </dl>
        </article>
        <article>
          <h2>Sessions</h2>
          <p>{sessions.data?.length ?? 0} active session(s)</p>
        </article>
        <article>
          <h2>Emergency stop</h2>
          <p>{readiness.data?.emergencyStopActive ? "Active" : "Released"}</p>
          {readiness.data?.emergencyStopActive ? (
            <>
              <label>
                Re-enter password to release
                <input
                  autoComplete="current-password"
                  type="password"
                  value={releasePassword}
                  onChange={(event) => setReleasePassword(event.target.value)}
                />
              </label>
              <button
                disabled={!releasePassword || releaseStop.isPending}
                onClick={() => releaseStop.mutate()}
                type="button"
              >
                Authenticate and release stop
              </button>
            </>
          ) : null}
        </article>
        <article>
          <h2>Recovery codes</h2>
          <p>{recovery.data?.unusedCount ?? 0} unused code(s)</p>
          <label>
            Re-enter password to generate
            <input
              autoComplete="current-password"
              onChange={(event) => setRecoveryPassword(event.target.value)}
              type="password"
              value={recoveryPassword}
            />
          </label>
          <button
            disabled={!recoveryPassword || generate.isPending}
            onClick={() => generate.mutate()}
            type="button"
          >
            Authenticate and generate new codes
          </button>
          {generate.error instanceof Error ? (
            <p className="form-error">{generate.error.message}</p>
          ) : null}
          {codes.length > 0 ? (
            <div className="notice">
              <strong>Save these now. They will not be shown again.</strong>
              <pre>{codes.join("\n")}</pre>
              <button onClick={() => setCodes([])} type="button">
                Dismiss
              </button>
            </div>
          ) : null}
        </article>
      </div>
      <p>
        Deploy the dashboard and API behind the same Tailscale Serve HTTPS origin.
        Public Funnel exposure is unsupported.
      </p>
    </section>
  );
};
