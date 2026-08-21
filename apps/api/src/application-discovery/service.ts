import {
  AllowedApplicationSchema,
  ApplicationDiscoveryResponseSchema,
  ApplicationInstallationRecordSchema,
  type ApplicationDiscoveryIngestRequest,
  type ApplicationDiscoveryResponse,
  type ApplicationInstallationRecord,
  type DiscoveredMacApplication,
} from "@alexa-control/shared";
import { createHash, randomUUID } from "node:crypto";

import type { ApplicationAdapterStore } from "../application-adapters/store.js";
import type { GovernanceAuditWriter } from "../governance/approval-service.js";
import type { GovernanceStore } from "../governance/store.js";
import type { NativeProviderStore } from "../native-providers/store.js";
import type { ApplicationDiscoveryStore } from "./store.js";

const emptyPermissions = {
  open: false,
  focus: false,
  inspectWindow: false,
  captureWindow: false,
  automate: false,
  sendKeyboardShortcuts: false,
  readSemanticStructure: false,
  navigate: false,
  interact: false,
  editText: false,
  openFiles: false,
  createDocuments: false,
  deleteContent: false,
  executeCommands: false,
  clipboardAccess: false,
};

const stableApplicationId = (ownerId: string, bundleIdentifier: string) =>
  `app.${createHash("sha256")
    .update(`${ownerId}:${bundleIdentifier.toLowerCase()}`)
    .digest("hex")
    .slice(0, 24)}`;

const canonicalizeName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.app$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const unique = (values: string[], limit: number) =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);

const words = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

const capabilityHints = (application: DiscoveredMacApplication) => {
  const tokens = new Set([
    ...words(application.displayName),
    ...words(application.bundleIdentifier),
    ...(application.executableName ? words(application.executableName) : []),
  ]);
  const hints: ApplicationInstallationRecord["capabilityHints"] = [];
  const add = (hint: ApplicationInstallationRecord["capabilityHints"][number]) => {
    if (!hints.includes(hint)) hints.push(hint);
  };
  if (application.isSystemApp) add("system");
  if (["safari", "chrome", "browser", "firefox", "edge"].some((item) => tokens.has(item)))
    add("browser");
  if (["terminal", "iterm"].some((item) => tokens.has(item))) add("terminal");
  if (["code", "vscode", "xcode", "cursor"].some((item) => tokens.has(item)))
    add("editor");
  if (["slack", "mail", "messages", "zoom", "teams"].some((item) => tokens.has(item)))
    add("communication");
  if (
    ["notes", "calendar", "reminders", "notion", "figma"].some((item) =>
      tokens.has(item),
    )
  )
    add("productivity");
  if (["music", "photos", "preview", "quicktime"].some((item) => tokens.has(item)))
    add("media");
  if (["git", "github", "docker", "postman"].some((item) => tokens.has(item)))
    add("developer");
  return hints;
};

const deriveSearchTokens = (application: DiscoveredMacApplication, canonicalName: string) =>
  unique(
    [
      ...words(canonicalName),
      ...words(application.displayName),
      ...words(application.bundleIdentifier),
      ...(application.executableName ? words(application.executableName) : []),
    ],
    80,
  );

export class ApplicationDiscoveryService {
  constructor(
    private readonly store: ApplicationDiscoveryStore,
    private readonly governanceStore: GovernanceStore,
    private readonly applicationAdapterStore: ApplicationAdapterStore,
    private readonly nativeProviderStore: NativeProviderStore,
    private readonly audit: GovernanceAuditWriter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  listInstallations(ownerId: string, deviceId?: string) {
    return this.store.listInstallations(ownerId, deviceId);
  }

  async ingest(
    ownerId: string,
    deviceId: string,
    requestId: string,
    ipAddress: string,
    input: ApplicationDiscoveryIngestRequest,
  ): Promise<ApplicationDiscoveryResponse> {
    const at = this.now().toISOString();
    const existingApplications = await this.governanceStore.listApplications(ownerId);
    const adapterInstances =
      await this.applicationAdapterStore.listAdapterInstances(ownerId, 1_000);
    const nativeProviders = await this.nativeProviderStore.listProviders(ownerId, 1_000);
    let createdApplications = 0;
    const installations: ApplicationInstallationRecord[] = [];

    for (const discovered of input.applications) {
      const applicationId =
        existingApplications.find(
          (application) =>
            application.macBundleId.toLowerCase() ===
            discovered.bundleIdentifier.toLowerCase(),
        )?.id ?? stableApplicationId(ownerId, discovered.bundleIdentifier);
      const currentApplication =
        existingApplications.find((application) => application.id === applicationId) ??
        (await this.governanceStore.findApplicationById(applicationId));

      if (!currentApplication) {
        const created = AllowedApplicationSchema.parse({
          id: applicationId,
          ownerId,
          displayName: discovered.displayName,
          macBundleId: discovered.bundleIdentifier,
          enabled: false,
          permissions: emptyPermissions,
          riskOverrides: {},
          createdAt: at,
          updatedAt: at,
        });
        await this.governanceStore.createApplication(created);
        existingApplications.push(created);
        createdApplications += 1;
      }

      const previous = await this.store.getInstallation(ownerId, deviceId, applicationId);
      const canonicalName = canonicalizeName(discovered.displayName);
      const supportedAdapterId =
        adapterInstances.find(
          (instance) =>
            instance.applicationId === applicationId &&
            !["disabled", "unavailable"].includes(instance.status),
        )?.id ?? null;
      const nativeProviderId =
        nativeProviders.find(
          (provider) =>
            provider.applicationId === applicationId &&
            provider.bundleIdentifier.toLowerCase() ===
              discovered.bundleIdentifier.toLowerCase() &&
            !["disabled", "unavailable"].includes(provider.status),
        )?.id ?? null;
      const installation = ApplicationInstallationRecordSchema.parse({
        id: previous?.id ?? randomUUID(),
        ownerId,
        deviceId,
        applicationId,
        displayName: discovered.displayName,
        bundleIdentifier: discovered.bundleIdentifier,
        canonicalName,
        aliases: unique(
          [
            discovered.displayName,
            canonicalName,
            discovered.executableName ?? "",
            discovered.bundleIdentifier.split(".").at(-1) ?? "",
          ],
          20,
        ),
        searchTokens: deriveSearchTokens(discovered, canonicalName),
        capabilityHints: capabilityHints(discovered),
        supportedAdapterId,
        nativeProviderId,
        bundlePath: discovered.bundlePath,
        executableName: discovered.executableName,
        version: discovered.version,
        buildVersion: discovered.buildVersion,
        iconPath: discovered.iconPath,
        bundleUrl: discovered.bundleUrl,
        source: input.source,
        isSystemApp: discovered.isSystemApp,
        isUserInstalled: discovered.isUserInstalled,
        launchable: Boolean(discovered.executableName),
        installed: true,
        discoveredAt: previous?.discoveredAt ?? discovered.discoveredAt,
        lastSeenAt: at,
        unavailableSince: null,
        provenance: {
          discoveredBy: "mac_agent_bundle_scan",
          rootScope: "fixed_macos_application_roots",
          trustGranted: false,
          permissionsGranted: false,
        },
      });
      installations.push(await this.store.upsertInstallation(installation));
    }

    const markedUnavailable = await this.store.markUnavailableMissing(
      ownerId,
      deviceId,
      input.source,
      installations.map((installation) => installation.applicationId),
      at,
    );

    await this.audit({
      eventType: "APPLICATION_DISCOVERY_INGESTED",
      ownerId,
      deviceId,
      outcome: "SUCCESS",
      reason: "Trusted Mac Agent ingested bounded application bundle metadata.",
      requestId,
      ipAddress,
      metadata: {
        ingested: input.applications.length,
        createdApplications,
        markedUnavailable,
        permissionsGranted: false,
        dynamicAdaptersCreated: false,
      },
    });

    return ApplicationDiscoveryResponseSchema.parse({
      ingested: input.applications.length,
      createdApplications,
      updatedInstallations: installations.length,
      markedUnavailable,
      installations,
      permissionsGranted: false,
      dynamicAdaptersCreated: false,
    });
  }
}
