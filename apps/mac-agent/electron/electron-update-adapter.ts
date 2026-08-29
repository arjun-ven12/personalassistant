import { autoUpdater } from "electron-updater";

import type { MacAgentUpdateAdapter, UpdateAdapterEvent } from "./update-runtime.js";

export const createElectronUpdateAdapter = (input: {
  feedUrl: string;
  channel: "stable" | "development";
}): MacAgentUpdateAdapter => {
  const listeners = new Set<(event: UpdateAdapterEvent) => void>();
  const emit = (event: UpdateAdapterEvent) => {
    for (const listener of listeners) listener(event);
  };

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = input.channel === "development";
  autoUpdater.channel = input.channel === "stable" ? "latest" : "development";
  autoUpdater.setFeedURL({
    provider: "generic",
    url: input.feedUrl,
    channel: autoUpdater.channel,
  });

  autoUpdater.on("checking-for-update", () => emit({ type: "checking" }));
  autoUpdater.on("update-available", (info) =>
    emit({ type: "available", version: info.version }),
  );
  autoUpdater.on("update-not-available", () => emit({ type: "not-available" }));
  autoUpdater.on("download-progress", (progress) =>
    emit({ type: "download-progress", percent: progress.percent }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    emit({ type: "downloaded", version: info.version }),
  );
  autoUpdater.on("error", (error) => emit({ type: "error", message: error.message }));

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async checkForUpdates() {
      await autoUpdater.checkForUpdates();
    },
    async downloadUpdate() {
      await autoUpdater.downloadUpdate();
    },
    quitAndInstall() {
      autoUpdater.quitAndInstall(false, true);
    },
  };
};
