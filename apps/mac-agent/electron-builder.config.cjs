const path = require("node:path");

const packageJson = require("./package.json");
const base = packageJson.build;
const configSource = process.env.ALEXA_MAC_AGENT_CONFIG_PATH
  ? path.resolve(process.env.ALEXA_MAC_AGENT_CONFIG_PATH)
  : path.resolve(__dirname, "build-resources/mac-agent.config.json");
const mac = {
  ...base.mac,
  target: [
    { target: "dir", arch: ["arm64"] },
    { target: "dmg", arch: ["arm64"] },
    { target: "zip", arch: ["arm64"] },
  ],
};
const isSignedDistribution =
  process.env.CSC_LINK && process.env.CSC_IDENTITY_AUTO_DISCOVERY !== "false";
if (isSignedDistribution) {
  delete mac.identity;
} else {
  mac.identity =
    process.env.ALEXA_MAC_AGENT_LOCAL_SIGNING_IDENTITY ??
    "Alexa Local Development";
  mac.entitlements = "build-resources/entitlements.mac.local.plist";
  mac.entitlementsInherit = "build-resources/entitlements.mac.local.plist";
}

module.exports = {
  ...base,
  // Electron safeStorage binds its Keychain service to the packaged product
  // identity. Keep ad-hoc local upgrades on the established identity so a
  // trusted device key remains decryptable across developer builds.
  ...(!isSignedDistribution ? { productName: "Alexa Mac Agent" } : {}),
  buildVersion: process.env.ALEXA_MAC_AGENT_BUILD_NUMBER ?? base.buildVersion,
  publish: [
    {
      provider: "generic",
      url:
        process.env.ALEXA_UPDATE_FEED_URL ??
        "https://updates.invalid/alexa-mac-agent/stable",
    },
  ],
  mac,
  extraResources: [
    { from: "dist-native", to: "native", filter: ["**/*.app/**/*"] },
    { from: configSource, to: "mac-agent.config.json" },
    { from: "build-resources/trayTemplate.png", to: "assets/trayTemplate.png" },
  ],
};
