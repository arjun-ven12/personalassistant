import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiClient } from "./api.js";

export const SettingsPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: apiClient.getSessions,
  });
  const revoke = useMutation({
    mutationFn: apiClient.revokeSession,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["auth-session"] }),
      ]);
    },
  });

  return (
    <section className="placeholder-page wide-page" aria-labelledby="settings-heading">
      <p className="eyebrow">Identity settings</p>
      <h1 id="settings-heading">Sessions</h1>
      <p>Sessions expire automatically and can be revoked immediately.</p>
      <div className="session-list">
        {sessions.data?.map((session) => (
          <article key={session.id}>
            <div>
              <strong>{session.current ? "Current session" : "Session"}</strong>
              <span>{session.ipAddress}</span>
            </div>
            <small>
              Last seen {new Date(session.lastSeenAt).toLocaleString()} · expires{" "}
              {new Date(session.expiresAt).toLocaleString()}
            </small>
            {session.revokedAt ? (
              <span className="trust-pill trust-revoked">REVOKED</span>
            ) : (
              <button
                className="danger-button"
                onClick={() => revoke.mutate(session.id)}
                type="button"
              >
                Revoke
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
};
