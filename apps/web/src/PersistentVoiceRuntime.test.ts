import { describe, expect, it } from "vitest";

import {
  commandTextFromWakeWord,
  memoryTextFromVoiceCommand,
  ordinalVoiceSelectionIndex,
  voiceRouteFailureMessage,
} from "./voiceRuntimeParsing.js";
import { ApiClientError } from "./api.js";

describe("PersistentVoiceRuntime helpers", () => {
  it("accepts Athena as the primary wake name and Alexa as a legacy alias", () => {
    expect(commandTextFromWakeWord("Hi Athena, open companies")).toBe("open companies");
    expect(commandTextFromWakeWord("Hey Alexa: show approvals")).toBe("show approvals");
    expect(commandTextFromWakeWord("open companies")).toBeNull();
  });

  it("extracts bounded owner teaching memories from voice commands", () => {
    expect(memoryTextFromVoiceCommand("remember that your name is Alexa")).toBe(
      "your name is Alexa",
    );
    expect(memoryTextFromVoiceCommand("note that I prefer short replies.")).toBe(
      "I prefer short replies",
    );
    expect(memoryTextFromVoiceCommand("launch VS Code")).toBeNull();
  });

  it("resolves ordinal follow-ups for ambiguous voice targets", () => {
    expect(ordinalVoiceSelectionIndex("first one")).toBe(0);
    expect(ordinalVoiceSelectionIndex("second")).toBe(1);
    expect(ordinalVoiceSelectionIndex("number three")).toBe(2);
    expect(ordinalVoiceSelectionIndex("the fourth")).toBe(3);
    expect(ordinalVoiceSelectionIndex("that one")).toBeNull();
  });

  it("names expired voice authentication instead of reporting a vague route failure", () => {
    expect(
      voiceRouteFailureMessage(
        new ApiClientError(401, "AUTHENTICATION_REQUIRED", "A valid session is required."),
      ),
    ).toMatch(/session has expired/i);
  });

  it("names the conversation-service error for unknown route failures", () => {
    const response = voiceRouteFailureMessage(new Error("unexpected failure"));
    expect(response).toMatch(/conversation service returned an error/i);
    expect(response).not.toMatch(/did not return a response|back to listening/i);
  });

  it("reports unavailable model capabilities as not enabled", () => {
    expect(
      voiceRouteFailureMessage(
        new ApiClientError(409, "CAPABILITY_UNAVAILABLE", "No eligible model."),
      ),
    ).toMatch(/hasn't been enabled yet/i);
  });

  it("names trusted-origin and CSRF failures for voice route denials", () => {
    expect(
      voiceRouteFailureMessage(
        new ApiClientError(403, "ORIGIN_NOT_ALLOWED", "The request origin is not trusted."),
      ),
    ).toMatch(/WEB_ORIGIN/i);
  });

  it("names internal API failures after the voice request reaches the server", () => {
    expect(
      voiceRouteFailureMessage(
        new ApiClientError(500, "INTERNAL_ERROR", "The request could not be completed."),
      ),
    ).toMatch(/request ID/i);
  });
});
