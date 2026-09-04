import { ApiClientError } from "./api.js";

const normalizeVoiceLabel = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export const commandTextFromWakeWord = (transcript: string) => {
  const match = transcript.match(/\b(?:athena|alexa)\b[\s,.:;-]*(.*)$/i);
  return match ? (match[1]?.trim() ?? "") : null;
};

export const memoryTextFromVoiceCommand = (transcript: string) => {
  const match = transcript.match(
    /^(?:please\s+)?(?:remember|remember that|remember this|note that|save this memory)\s+(?:that\s+)?(.+)$/i,
  );
  return match?.[1]?.trim().replace(/[.!?]+$/u, "") ?? null;
};

export const ordinalVoiceSelectionIndex = (transcript: string) => {
  const normalized = normalizeVoiceLabel(transcript);
  if (/^(first|first one|the first|number one|one|1)$/.test(normalized)) return 0;
  if (/^(second|second one|the second|number two|two|2)$/.test(normalized)) return 1;
  if (/^(third|third one|the third|number three|three|3)$/.test(normalized)) return 2;
  if (/^(fourth|fourth one|the fourth|number four|four|4)$/.test(normalized)) return 3;
  return null;
};

export const voiceRouteFailureMessage = (error: unknown) => {
  if (error instanceof ApiClientError) {
    if (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED")
      return "I heard you, but this voice session has expired. Sign in again, then try once more.";
    if (
      error.status === 403 ||
      /csrf|trusted origin|forbidden/i.test(`${error.code} ${error.message}`)
    )
      return "I heard you, but the governed voice route rejected this request. Refresh the page and make sure the API WEB_ORIGIN exactly matches this browser origin so the auth cookie and CSRF token are accepted.";
    if (error.status >= 500)
      return "I heard you, but the conversation service hit an internal error after the request reached the API. Check the API terminal for the request ID, then try again after the server restarts.";
    if (error.code === "API_UNREACHABLE")
      return "Voice understanding isn't available right now because the local API is offline.";
    if (
      error.code === "CAPABILITY_UNAVAILABLE" ||
      error.code === "PROVIDER_UNAVAILABLE" ||
      error.code === "MODEL_UNAVAILABLE"
    )
      return "That voice function hasn't been enabled yet.";
  }
  return "I couldn't process that request because the conversation service returned an error.";
};
