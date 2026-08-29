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
if (process.env.CSC_LINK && process.env.CSC_IDENTITY_AUTO_DISCOVERY !== "false") {
  delete mac.identity;
} else {
  mac.identity = "-";
  mac.entitlements = "build-resources/entitlements.mac.local.plist";
  mac.entitlementsInherit = "build-resources/entitlements.mac.local.plist";
}

module.exports = {
  ...base,
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
