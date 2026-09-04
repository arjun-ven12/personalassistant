import { z } from "zod";

export const MacAgentUpdatePhaseSchema = z.enum([
  "IDLE",
  "CHECKING",
  "AVAILABLE",
  "DOWNLOADING",
  "DOWNLOADED",
  "INSTALLING",
  "RESTART_REQUIRED",
  "UP_TO_DATE",
  "FAILED",
]);

export const MacAgentUpdateStatusSchema = z
  .object({
    enabled: z.boolean(),
    phase: MacAgentUpdatePhaseSchema,
    channel: z.enum(["stable", "development"]),
    currentVersion: z.string().min(1).max(40),
    availableVersion: z.string().min(1).max(40).nullable(),
    downloadPercent: z.number().min(0).max(100).nullable(),
    lastCheckedAt: z.iso.datetime().nullable(),
    restartDeferred: z.boolean(),
    message: z.string().min(1).max(240),
  })
  .strict();

export type MacAgentUpdateStatus = z.infer<typeof MacAgentUpdateStatusSchema>;

export type UpdateAdapterEvent =
  | { type: "checking" }
  | { type: "available"; version: string }
  | { type: "not-available" }
  | { type: "download-progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string };

export interface MacAgentUpdateAdapter {
  subscribe: (listener: (event: UpdateAdapterEvent) => void) => () => void;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  quitAndInstall: () => void;
}

export const productionUpdateEnabled = (input: {
  isPackaged: boolean;
  developerIdSigned: boolean;
  environment: "development" | "production";
  provider: "disabled" | "generic";
  feedUrl?: string;
}) =>
  input.isPackaged &&
  input.developerIdSigned &&
  input.environment === "production" &&
  input.provider === "generic" &&
  Boolean(input.feedUrl);

type UpdateRuntimeOptions = {
  enabled: boolean;
  channel: "stable" | "development";
  currentVersion: string;
  adapter: MacAgentUpdateAdapter;
  isExecutionActive: () => boolean;
  onChanged?: (status: MacAgentUpdateStatus) => void;
  record?: (event: string, detail?: string) => void | Promise<void>;
};

const safeMessage = (message: string) =>
  message.replace(/[\r\n]+/g, " ").slice(0, 240) || "Update operation failed.";

export class MacAgentUpdateRuntime {
  readonly #options: UpdateRuntimeOptions;
  readonly #unsubscribe: () => void;
  #status: MacAgentUpdateStatus;
  #automaticTimer: ReturnType<typeof setTimeout> | null = null;
  #intervalTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: UpdateRuntimeOptions) {
    this.#options = options;
    this.#status = MacAgentUpdateStatusSchema.parse({
      enabled: options.enabled,
      phase: "IDLE",
      channel: options.channel,
      currentVersion: options.currentVersion,
      availableVersion: null,
      downloadPercent: null,
      lastCheckedAt: null,
      restartDeferred: false,
      message: options.enabled
        ? "Ready to check for signed updates."
        : "Production auto-update is disabled for this build.",
    });
    this.#unsubscribe = options.adapter.subscribe((event) => this.#handle(event));
  }

  get status() {
    return MacAgentUpdateStatusSchema.parse(this.#status);
  }

  async check() {
    this.#assertEnabled();
    if (["CHECKING", "DOWNLOADING", "INSTALLING"].includes(this.#status.phase)) {
      throw new Error("An update operation is already in progress.");
    }
    this.#set({ phase: "CHECKING", message: "Checking for signed updates." });
    await this.#record("UPDATE_CHECK_STARTED");
    try {
      await this.#options.adapter.checkForUpdates();
    } catch (error) {
      this.#fail(error);
    }
    return this.status;
  }

  async download() {
    this.#assertEnabled();
    if (this.#status.phase !== "AVAILABLE") {
      throw new Error("An available update is required before downloading.");
    }
    this.#set({
      phase: "DOWNLOADING",
      downloadPercent: 0,
      message: "Downloading signed update.",
    });
    await this.#record(
      "UPDATE_DOWNLOAD_STARTED",
      this.#status.availableVersion ?? undefined,
    );
    try {
      await this.#options.adapter.downloadUpdate();
    } catch (error) {
      this.#fail(error);
    }
    return this.status;
  }

  async restartAndInstall() {
    this.#assertEnabled();
    if (
      !(["DOWNLOADED", "RESTART_REQUIRED"] as const).includes(
        this.#status.phase as "DOWNLOADED" | "RESTART_REQUIRED",
      )
    ) {
      throw new Error("A downloaded update is required before restart.");
    }
    if (this.#options.isExecutionActive()) {
      this.#set({
        phase: "RESTART_REQUIRED",
        restartDeferred: true,
        message: "Restart deferred until the active governed execution finishes.",
      });
      await this.#record("UPDATE_RESTART_DEFERRED", "Active governed execution.");
      return this.status;
    }
    this.#set({
      phase: "INSTALLING",
      restartDeferred: false,
      message: "Restarting to install the signed update.",
    });
    await this.#record(
      "UPDATE_INSTALL_STARTED",
      this.#status.availableVersion ?? undefined,
    );
    this.#options.adapter.quitAndInstall();
    return this.status;
  }

  scheduleAutomaticChecks(initialDelayMs: number, intervalMs: number) {
    if (!this.#status.enabled) return;
    this.#automaticTimer = setTimeout(() => {
      void this.#automaticCheck();
      this.#intervalTimer = setInterval(() => void this.#automaticCheck(), intervalMs);
    }, initialDelayMs);
  }

  dispose() {
    if (this.#automaticTimer) clearTimeout(this.#automaticTimer);
    if (this.#intervalTimer) clearInterval(this.#intervalTimer);
    this.#unsubscribe();
  }

  #handle(event: UpdateAdapterEvent) {
    switch (event.type) {
      case "checking":
        this.#set({ phase: "CHECKING", message: "Checking for signed updates." });
        return;
      case "available":
        this.#set({
          phase: "AVAILABLE",
          availableVersion: event.version,
          lastCheckedAt: new Date().toISOString(),
          message: `Version ${event.version} is available.`,
        });
        void this.#record("UPDATE_AVAILABLE", event.version);
        return;
      case "not-available":
        this.#set({
          phase: "UP_TO_DATE",
          lastCheckedAt: new Date().toISOString(),
          message: "Athena Mac Agent is up to date.",
        });
        void this.#record("UPDATE_NOT_AVAILABLE");
        return;
      case "download-progress":
        this.#set({
          phase: "DOWNLOADING",
          downloadPercent: Math.max(0, Math.min(100, event.percent)),
          message: `Downloading update (${Math.round(event.percent)}%).`,
        });
        return;
      case "downloaded":
        this.#set({
          phase: "DOWNLOADED",
          availableVersion: event.version,
          downloadPercent: 100,
          message: "Update downloaded. Restart when no execution is active.",
        });
        void this.#record("UPDATE_DOWNLOADED", event.version);
        return;
      case "error":
        this.#fail(new Error(event.message));
    }
  }

  async #automaticCheck() {
    if (
      ["DOWNLOADING", "DOWNLOADED", "INSTALLING", "RESTART_REQUIRED"].includes(
        this.#status.phase,
      )
    )
      return;
    await this.check().catch(() => undefined);
  }

  #assertEnabled() {
    if (!this.#status.enabled) {
      throw new Error("Production auto-update is disabled for this build.");
    }
  }

  #fail(error: unknown) {
    const message = safeMessage(
      error instanceof Error ? error.message : "Update operation failed.",
    );
    this.#set({ phase: "FAILED", message });
    void this.#record("UPDATE_FAILED", message);
  }

  #set(next: Partial<MacAgentUpdateStatus>) {
    this.#status = MacAgentUpdateStatusSchema.parse({ ...this.#status, ...next });
    this.#options.onChanged?.(this.status);
  }

  async #record(event: string, detail?: string) {
    await this.#options.record?.(event, detail);
  }
}
