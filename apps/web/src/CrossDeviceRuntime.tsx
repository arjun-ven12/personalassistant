import type { CrossDeviceCommand, CrossDeviceFailureCode } from "@alexa-control/shared";
import { useEffect, useRef } from "react";

import type { ApiClient } from "./api.js";
import {
  crossDeviceCommandPath,
  webClientInstanceId,
  webCrossDeviceCapabilities,
} from "./crossDeviceClient.js";

export const CrossDeviceRuntime = ({
  apiClient,
  navigate,
}: {
  apiClient: ApiClient;
  navigate: (path: string) => void;
}) => {
  const processing = useRef(new Set<string>());

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const clientInstanceId = webClientInstanceId();

    const receipt = (
      command: CrossDeviceCommand,
      status: "ACKNOWLEDGED" | "EXECUTING" | "SUCCEEDED" | "FAILED" | "REJECTED",
      safeMessage: string,
      failureCode: CrossDeviceFailureCode | null = null,
    ) => apiClient.recordCrossDeviceReceipt({
      clientInstanceId,
      commandId: command.id,
      status,
      failureCode,
      safeMessage,
    });

    const execute = async (command: CrossDeviceCommand) => {
      if (processing.current.has(command.id)) return;
      processing.current.add(command.id);
      try {
        if (command.status === "DISPATCHED")
          await receipt(command, "ACKNOWLEDGED", "Alexa Web acknowledged the command.");
        if (command.status !== "EXECUTING")
          await receipt(command, "EXECUTING", "Alexa Web is applying the finite navigation command.");
        if (command.capability === "REFRESH_VIEW") {
          window.location.reload();
          return;
        }
        if (command.capability === "FOCUS_SEARCH") {
          const search = document.getElementById("global-command-search");
          if (!search) {
            await receipt(command, "FAILED", "No registered search control is available on this view.", "CAPABILITY_UNAVAILABLE");
            return;
          }
          search.focus();
          await receipt(command, "SUCCEEDED", "Alexa Web focused the registered search control.");
          return;
        }
        const path = crossDeviceCommandPath(command);
        if (!path) {
          await receipt(command, "REJECTED", "Alexa Web rejected an unsupported command capability.", "CAPABILITY_UNAVAILABLE");
          return;
        }
        navigate(path);
        await receipt(command, "SUCCEEDED", "Alexa Web opened the requested registered view.");
      } catch {
        // The same command remains server-side and will be returned again until
        // its bounded lease expires; never claim success after a network error.
      } finally {
        processing.current.delete(command.id);
      }
    };

    const poll = async () => {
      try {
        const response = await apiClient.pollCrossDeviceCommands({
          clientInstanceId,
          currentRoute: window.location.pathname,
          limit: 5,
        });
        for (const command of response.commands) void execute(command);
      } catch {
        // Presence expires server-side when authenticated polling stops.
      } finally {
        if (!stopped)
          timer = window.setTimeout(
            () => void poll(),
            document.hidden ? 15_000 : 5_000,
          );
      }
    };

    void apiClient.registerCrossDeviceClient({
      clientInstanceId,
      clientType: "WEB",
      displayName: `${navigator.platform || "Browser"} Web`,
      platform: navigator.platform || "web",
      capabilities: webCrossDeviceCapabilities,
      currentRoute: window.location.pathname,
    }).then(() => void poll()).catch(() => {
      if (!stopped) timer = window.setTimeout(() => void poll(), 5_000);
    });

    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [apiClient, navigate]);

  return null;
};
