import { GoogleAuth } from "google-auth-library";

import type { ExecutivePushPayload } from "@alexa-control/shared";

export interface PushProviderResult {
  accepted: boolean;
  messageId: string | null;
  reasonCode: string;
  invalidateToken: boolean;
}

export interface PushProvider {
  send(token: string, payload: ExecutivePushPayload): Promise<PushProviderResult>;
}

export class DisabledPushProvider implements PushProvider {
  send(): Promise<PushProviderResult> {
    return Promise.resolve({
      accepted: false,
      messageId: null,
      reasonCode: "PUSH_PROVIDER_DISABLED",
      invalidateToken: false,
    });
  }
}

export class FcmPushProvider implements PushProvider {
  readonly #auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });

  constructor(readonly projectId: string) {}

  async send(token: string, payload: ExecutivePushPayload): Promise<PushProviderResult> {
    try {
      const client = await this.#auth.getClient();
      const accessToken = await client.getAccessToken();
      if (!accessToken.token) throw new Error("FCM access token unavailable.");
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/messages:send`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token,
              data: payload,
              android: {
                priority: payload.severity === "CRITICAL" ? "HIGH" : "NORMAL",
              },
            },
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        name?: unknown;
        error?: { details?: Array<{ errorCode?: unknown }> };
      };
      const errorCode = body.error?.details
        ?.map((item) => item.errorCode)
        .find((item): item is string => typeof item === "string");
      return {
        accepted: response.ok,
        messageId: response.ok && typeof body.name === "string" ? body.name : null,
        reasonCode: response.ok ? "FCM_ACCEPTED" : errorCode ?? `FCM_HTTP_${response.status}`,
        invalidateToken: errorCode === "UNREGISTERED" || errorCode === "INVALID_ARGUMENT",
      };
    } catch {
      return {
        accepted: false,
        messageId: null,
        reasonCode: "FCM_UNAVAILABLE",
        invalidateToken: false,
      };
    }
  }
}
