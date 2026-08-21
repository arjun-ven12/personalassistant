import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiClient } from "./api.js";

export const DevicesPage = ({ apiClient }: { apiClient: ApiClient }) => {
  const queryClient = useQueryClient();
  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: apiClient.getDevices,
  });
  const intent = useMutation({
    mutationFn: apiClient.createPairingIntent,
  });
  const mutateDevice = useMutation({
    mutationFn: ({
      action,
      deviceId,
    }: {
      action: "approve" | "revoke";
      deviceId: string;
    }) =>
      action === "approve"
        ? apiClient.approveDevice(deviceId)
        : apiClient.revokeDevice(deviceId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["devices"] }),
        queryClient.invalidateQueries({ queryKey: ["audit"] }),
      ]);
    },
  });

  return (
    <section className="placeholder-page wide-page" aria-labelledby="device-heading">
      <p className="eyebrow">Registered-device identity</p>
      <h1 id="device-heading">Devices</h1>
      <p>
        Generate a five-minute pairing code, enter it on the Mac agent, then compare the
        fingerprint before approving the pending device.
      </p>
      <div className="notice">
        Pairing codes are one-use and expire quickly. Generate the code here, paste it
        into the Mac Agent, click Request pairing there, then return here to approve
        the pending device.
      </div>
      <div className="pairing-control">
        <button
          disabled={intent.isPending}
          onClick={() => intent.mutate()}
          type="button"
        >
          Generate pairing code
        </button>
        {intent.data ? (
          <div className="pairing-code" aria-live="polite">
            <strong>{intent.data.pairingCode}</strong>
            <span>
              Paste this exact code into the Mac Agent. Expires{" "}
              {new Date(intent.data.expiresAt).toLocaleTimeString()}.
            </span>
          </div>
        ) : null}
      </div>
      <div className="device-list">
        {devices.isPending ? <p>Loading devices…</p> : null}
        {devices.data?.length === 0 ? (
          <div className="notice">No devices have requested pairing.</div>
        ) : null}
        {devices.data?.map((device) => (
          <article className="device-card" key={device.id}>
            <div>
              <span className={`trust-pill trust-${device.trustStatus.toLowerCase()}`}>
                {device.trustStatus}
              </span>
              <h2>{device.deviceName}</h2>
              <p>{device.deviceType.replace("_", " ")}</p>
              <code>{device.fingerprint}</code>
            </div>
            <div className="device-actions">
              {device.trustStatus === "PENDING" ? (
                <button
                  onClick={() =>
                    mutateDevice.mutate({
                      action: "approve",
                      deviceId: device.id,
                    })
                  }
                  type="button"
                >
                  Approve
                </button>
              ) : null}
              {device.trustStatus !== "REVOKED" ? (
                <button
                  className="danger-button"
                  onClick={() =>
                    mutateDevice.mutate({
                      action: "revoke",
                      deviceId: device.id,
                    })
                  }
                  type="button"
                >
                  Revoke
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
