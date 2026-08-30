import type {
  CrossDeviceCapability,
  CrossDeviceCommand,
} from "@alexa-control/shared";

const storageKey = "alexa.cross-device.client-instance.v1";

export const webCrossDeviceCapabilities: CrossDeviceCapability[] = [
  "NAVIGATE_TO_ROUTE",
  "OPEN_OBJECTIVE",
  "OPEN_AGENT",
  "OPEN_WORKFLOW",
  "OPEN_APPROVAL",
  "OPEN_CONVERSATION",
  "FOCUS_SEARCH",
  "REFRESH_VIEW",
];

export const webClientInstanceId = () => {
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(storageKey, created);
  return created;
};

export const isCrossDeviceUtterance = (utterance: string) =>
  /\b(?:on|to|there|that device|same device)\s+(?:(?:my|the)\s+)?(?:mac|macbook|desktop|phone|android|mobile|web|browser|website|dashboard)\b/i.test(
    utterance,
  ) || /\b(?:show|open)\s+(?:this|current (?:screen|page))\s+(?:on|there)\b/i.test(utterance) ||
  /\b(?:here|this device|current device)\b/i.test(utterance);

export const crossDeviceCommandPath = (command: CrossDeviceCommand) => {
  const objectId = command.arguments.objectId
    ? encodeURIComponent(command.arguments.objectId)
    : null;
  switch (command.capability) {
    case "NAVIGATE_TO_ROUTE":
    case "SHOW_SCREEN":
      return command.arguments.route ?? null;
    case "OPEN_OBJECTIVE":
      return objectId ? `/objectives?objectiveId=${objectId}` : "/objectives";
    case "OPEN_AGENT":
      return objectId ? `/agents?agentId=${objectId}` : "/agents";
    case "OPEN_WORKFLOW":
      return objectId ? `/workflows?workflowId=${objectId}` : "/workflows";
    case "OPEN_APPROVAL":
      return objectId ? `/approvals?approvalId=${objectId}` : "/approvals";
    case "OPEN_CONVERSATION":
      return objectId ? `/conversation?conversationId=${objectId}` : "/conversation";
    default:
      return null;
  }
};
