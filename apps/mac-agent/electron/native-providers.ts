import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import {
  NativeCapabilityDispatchRequestSchema,
  type NativeCapabilityDispatchRequest,
  type NativeProviderCapability,
} from "@alexa-control/shared";
import {
  NativeProviderExecutionResultSchema,
  NativeProviderHostStatusSchema,
  type NativeProviderExecutionResult,
  type NativeProviderHostStatus,
} from "./contracts.js";
import {
  NativeSemanticInteractionBridge,
  type NativeSemanticBridgeResult,
} from "./native-semantic-interaction.js";

type FixedCommandRunner = (
  executable: "/usr/bin/open" | "/usr/bin/pgrep",
  args: readonly string[],
) => Promise<void>;

interface NativeProviderDescriptor {
  providerId: string;
  applicationId: string;
  bundleIdentifier: string;
  processName: string;
  processVerificationArgs?: readonly string[];
  implementedCapabilities: NativeProviderCapability[];
  unsupportedCapabilities: NativeProviderCapability[];
}

const execFileAsync = promisify(execFile);

const defaultRunner: FixedCommandRunner = async (executable, args) => {
  await execFileAsync(executable, [...args], {
    shell: false,
    timeout: 10_000,
    windowsHide: true,
  });
};

class ProviderHostError extends Error {
  constructor(
    readonly code:
      | "BUNDLE_ID_NOT_FOUND"
      | "LAUNCH_FAILED"
      | "VERIFICATION_TIMEOUT"
      | "PROVIDER_OPERATION_FAILED",
    message: string,
  ) {
    super(message);
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const descriptors: NativeProviderDescriptor[] = [
  {
    providerId: "provider.vscode",
    applicationId: "vscode",
    bundleIdentifier: "com.microsoft.VSCode",
    processName: "Code",
    implementedCapabilities: [
      "launch",
      "focus",
      "focus_semantic_control",
      "insert_text",
      "replace_selection",
    ],
    unsupportedCapabilities: [
      "open_repository",
      "open_workspace",
      "focus_explorer",
      "focus_search",
      "focus_terminal",
      "open_file",
      "save_file",
      "switch_tab",
      "show_problems",
      "show_extensions",
      "close_tab",
    ],
  },
  {
    providerId: "provider.finder",
    applicationId: "finder",
    bundleIdentifier: "com.apple.finder",
    processName: "Finder",
    implementedCapabilities: ["launch", "focus", "focus_downloads", "focus_desktop"],
    unsupportedCapabilities: [
      "open_folder",
      "reveal_file",
      "search",
      "new_folder",
      "focus_sidebar",
      "open_selected_resource",
    ],
  },
  {
    providerId: "provider.chrome",
    applicationId: "chrome",
    bundleIdentifier: "com.google.Chrome",
    processName: "Google Chrome",
    implementedCapabilities: [
      "launch",
      "focus",
      "open_url",
      "reload",
      "focus_semantic_control",
      "insert_text",
      "activate_semantic_control",
      "submit_composer",
    ],
    unsupportedCapabilities: [
      "new_tab",
      "switch_tab",
      "find",
      "bookmark",
      "close_tab",
    ],
  },
  {
    providerId: "provider.safari",
    applicationId: "safari",
    bundleIdentifier: "com.apple.Safari",
    processName: "Safari",
    implementedCapabilities: [
      "launch",
      "focus",
      "open_url",
      "reload",
      "focus_semantic_control",
      "insert_text",
      "activate_semantic_control",
      "submit_composer",
    ],
    unsupportedCapabilities: ["new_tab", "find", "close_tab"],
  },
  {
    providerId: "provider.terminal",
    applicationId: "terminal",
    bundleIdentifier: "com.apple.Terminal",
    processName: "Terminal",
    implementedCapabilities: ["launch", "focus"],
    unsupportedCapabilities: [
      "open_profile",
      "run_approved_command",
      "interrupt_command",
      "clear_terminal",
      "focus_session",
    ],
  },
  {
    providerId: "provider.chatgpt",
    applicationId: "chatgpt",
    bundleIdentifier: "com.openai.chat",
    processName: "ChatGPT",
    implementedCapabilities: [
      "launch",
      "focus",
      "focus_semantic_control",
      "insert_text",
      "activate_semantic_control",
      "submit_composer",
    ],
    unsupportedCapabilities: [],
  },
  {
    providerId: "provider.codex",
    applicationId: "codex",
    bundleIdentifier: "com.openai.codex",
    // The registered com.openai.codex bundle is hosted by the ChatGPT macOS app.
    // Verify the actual executable process after Launch Services opens it.
    processName: "ChatGPT",
    // macOS reports the main Electron process under a truncated path. Verify
    // the fixed ChatGPT bundle process family rather than accepting a generic
    // process or relying on Launch Services success alone.
    processVerificationArgs: [
      "-f",
      "ChatGPT\\.app",
    ],
    implementedCapabilities: [
      "launch",
      "focus",
      "focus_semantic_control",
      "insert_text",
      "submit_composer",
    ],
    unsupportedCapabilities: [],
  },
];

const safeHttpUrl = z
  .string()
  .min(1)
  .max(2_048)
  .transform((value, ctx) => {
    try {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        ctx.addIssue({
          code: "custom",
          message: "Only http and https URLs are supported by reviewed providers.",
        });
        return z.NEVER;
      }
      return parsed.toString();
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid URL." });
      return z.NEVER;
    }
  });

export class MacNativeProviderHost {
  constructor(
    private readonly runner: FixedCommandRunner = defaultRunner,
    private readonly now: () => Date = () => new Date(),
    private readonly specialFolders: {
      downloads: () => string;
      desktop: () => string;
    } = {
      downloads: () => "",
      desktop: () => "",
    },
    private readonly semanticBridge: Pick<NativeSemanticInteractionBridge, "execute"> =
      new NativeSemanticInteractionBridge(),
  ) {}

  status(accessibilityTrusted: boolean): NativeProviderHostStatus {
    return NativeProviderHostStatusSchema.parse({
      available: process.platform === "darwin",
      checkedAt: this.now().toISOString(),
      hostVersion: "17H.1",
      nativeBridgeStatus: "available_reviewed",
      accessibilityTrusted,
      providerImplementations: descriptors.map((descriptor) => ({
        providerId: descriptor.providerId,
        applicationId: descriptor.applicationId,
        bundleIdentifier: descriptor.bundleIdentifier,
        providerVersion: "17H.1",
        implementedCapabilities: descriptor.implementedCapabilities,
        unsupportedCapabilities: descriptor.unsupportedCapabilities,
        nativeBridgeStatus: descriptor.implementedCapabilities.some((capability) =>
          [
            "focus_semantic_control",
            "reload",
            "insert_text",
            "replace_selection",
            "activate_semantic_control",
            "submit_composer",
          ].includes(capability),
        )
          ? "available_reviewed"
          : "not_required",
        accessibilityRequired: descriptor.implementedCapabilities.some((capability) =>
          [
            "focus_semantic_control",
            "reload",
            "insert_text",
            "replace_selection",
            "activate_semantic_control",
            "submit_composer",
          ].includes(capability),
        ),
        verificationMethod:
          "Fixed Launch Services operations or a reviewed finite semantic Accessibility bridge with exact-target verification.",
      })),
      arbitraryExecutionAvailable: false,
      arbitraryAppleScriptAvailable: false,
      arbitraryShellAvailable: false,
      coordinateClickingAvailable: false,
      keyboardReplayAvailable: false,
      ocrAvailable: false,
      screenshotAutomationAvailable: false,
      unrestrictedAccessibilityAvailable: false,
    });
  }

  async execute(input: unknown): Promise<NativeProviderExecutionResult> {
    const request = NativeCapabilityDispatchRequestSchema.parse(input);
    const started = Date.now();
    const descriptor = descriptors.find(
      (item) =>
        item.providerId === request.providerId &&
        item.applicationId === request.applicationId,
    );
    if (!descriptor) {
      return this.result(request, started, {
        status: "denied",
        verified: false,
        errorCode: "PROVIDER_NOT_IMPLEMENTED",
        resultSummary: "No reviewed Mac Agent implementation exists for this provider.",
        verificationSummary: "No macOS operation was attempted.",
      });
    }
    if (!descriptor.implementedCapabilities.includes(request.capability)) {
      return this.result(request, started, {
        status: "unsupported",
        verified: false,
        errorCode: "REVIEWED_BRIDGE_REQUIRED",
        resultSummary:
          "Capability requires a future reviewed Accessibility or application-specific bridge.",
        verificationSummary: "No fallback automation path was used.",
      });
    }
    if (
      [
        "focus_semantic_control",
        "reload",
        "insert_text",
        "replace_selection",
        "activate_semantic_control",
        "submit_composer",
      ].includes(request.capability)
    ) {
      const target = request.arguments.target;
      const bridge = await this.semanticBridge.execute({
        operation: request.capability,
        bundleIdentifier: descriptor.bundleIdentifier,
        target,
        text:
          request.capability === "insert_text" ||
          request.capability === "replace_selection"
            ? request.arguments.text
            : null,
      });
      return this.semanticResult(request, started, descriptor, bridge);
    }
    try {
      await this.executeImplemented(descriptor, request);
      await this.verifyProcessRunning(descriptor);
      return this.result(request, started, {
        status: "verified",
        verified: true,
        errorCode: null,
        resultSummary: "Reviewed native provider operation completed.",
        verificationSummary: `${descriptor.processName} is running after ${request.capability}.`,
      });
    } catch (error) {
      const providerError =
        error instanceof ProviderHostError
          ? error
          : new ProviderHostError(
              "PROVIDER_OPERATION_FAILED",
              error instanceof Error ? error.message : "Provider operation failed.",
            );
      return this.result(request, started, {
        status: "failed",
        verified: false,
        errorCode: providerError.code,
        resultSummary: providerError.message,
        verificationSummary:
          providerError.code === "VERIFICATION_TIMEOUT"
            ? `${descriptor.processName} was not observed running before the verification timeout.`
            : "Provider execution did not complete.",
      });
    }
  }

  private async executeImplemented(
    descriptor: NativeProviderDescriptor,
    request: NativeCapabilityDispatchRequest,
  ) {
    if (request.capability === "launch" || request.capability === "focus") {
      await this.runLaunchServices(descriptor, ["-b", descriptor.bundleIdentifier]);
      return;
    }
    if (request.capability === "open_url") {
      const url = safeHttpUrl.parse(request.arguments.url);
      await this.runLaunchServices(descriptor, [
        "-b",
        descriptor.bundleIdentifier,
        url,
      ]);
      return;
    }
    if (request.capability === "focus_downloads") {
      const downloads = this.specialFolders.downloads();
      if (!downloads) throw new Error("Downloads folder is unavailable.");
      await this.runner("/usr/bin/open", [downloads]);
      return;
    }
    if (request.capability === "focus_desktop") {
      const desktop = this.specialFolders.desktop();
      if (!desktop) throw new Error("Desktop folder is unavailable.");
      await this.runner("/usr/bin/open", [desktop]);
      return;
    }
    throw new Error("Capability is not implemented by the reviewed Mac provider.");
  }

  private async verifyProcessRunning(descriptor: NativeProviderDescriptor) {
    const deadline = Date.now() + 5_000;
    while (Date.now() <= deadline) {
      try {
        await this.runner(
          "/usr/bin/pgrep",
          descriptor.processVerificationArgs ?? ["-x", descriptor.processName],
        );
        return;
      } catch {
        await wait(250);
      }
    }
    throw new ProviderHostError(
      "VERIFICATION_TIMEOUT",
      `${descriptor.processName} process verification timed out after launch.`,
    );
  }

  private async runLaunchServices(
    descriptor: NativeProviderDescriptor,
    args: readonly string[],
  ) {
    try {
      await this.runner("/usr/bin/open", args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const bundleMissing =
        message.includes("Unable to find application") ||
        message.includes("LSOpenURLsWithRole") ||
        message.includes(descriptor.bundleIdentifier);
      throw new ProviderHostError(
        bundleMissing ? "BUNDLE_ID_NOT_FOUND" : "LAUNCH_FAILED",
        bundleMissing
          ? `Application bundle ${descriptor.bundleIdentifier} was not found.`
          : `Launch Services failed for ${descriptor.bundleIdentifier}.`,
      );
    }
  }

  private result(
    request: NativeCapabilityDispatchRequest,
    started: number,
    details: {
      status: "verified" | "failed" | "unsupported" | "denied";
      verified: boolean;
      errorCode: string | null;
      resultSummary: string;
      verificationSummary: string;
      nativeBridgeUsed?: boolean;
      semanticId?: string | null;
      matchedCount?: number;
    },
  ): NativeProviderExecutionResult {
    return NativeProviderExecutionResultSchema.parse({
      providerId: request.providerId,
      applicationId: request.applicationId,
      capability: request.capability,
      status: details.status,
      verified: details.verified,
      verificationSummary: details.verificationSummary,
      resultSummary: details.resultSummary,
      errorCode: details.errorCode,
      latencyMs: Math.max(0, Date.now() - started),
      completedAt: this.now().toISOString(),
      nativeBridgeUsed: details.nativeBridgeUsed ?? false,
      semanticId: details.semanticId ?? null,
      matchedCount: details.matchedCount ?? 0,
      arbitraryExecutionAvailable: false,
      arbitraryAppleScriptAvailable: false,
      arbitraryShellAvailable: false,
      coordinateClickingAvailable: false,
      keyboardReplayAvailable: false,
      unrestrictedAccessibilityAvailable: false,
    });
  }

  private semanticResult(
    request: NativeCapabilityDispatchRequest,
    started: number,
    descriptor: NativeProviderDescriptor,
    bridge: NativeSemanticBridgeResult,
  ) {
    const success = bridge.status === "SUCCESS";
    const unsupported = bridge.status === "UNSUPPORTED";
    const denied = ["PERMISSION_DENIED", "SECURE_TARGET_BLOCKED"].includes(
      bridge.status,
    );
    return this.result(request, started, {
      status: success
        ? "verified"
        : unsupported
          ? "unsupported"
          : denied
            ? "denied"
            : "failed",
      verified: success,
      errorCode: success ? null : bridge.status,
      resultSummary: success
        ? "Reviewed semantic application interaction completed."
        : `Reviewed semantic interaction stopped with ${bridge.status}.`,
      verificationSummary: success
        ? `${descriptor.processName} matched exactly one frozen semantic target and completed ${request.capability}.`
        : "No fallback mouse, keyboard, script, or unrestricted Accessibility operation was used.",
      nativeBridgeUsed: true,
      semanticId: bridge.semanticId,
      matchedCount: bridge.matchedCount,
    });
  }
}
