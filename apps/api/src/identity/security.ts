import {
  DeviceTrustStatusSchema,
  SignedCommandEnvelopeSchema,
  type NetworkVerificationResult,
  type NetworkVerifier,
  type SignedCommandEnvelope,
} from "@alexa-control/shared";
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { z } from "zod";

import { verifyEnvelopeSignature } from "./crypto.js";
import { ApiSecurityError } from "./errors.js";
import type { IdentityService } from "./service.js";
import type { AuthenticatedIdentity, StoredDevice } from "./types.js";
import type { SecurityStateService } from "../security-state/service.js";

export interface SecurityMiddlewareOptions {
  cookieName: string;
  webOrigin: string;
  signedRequestToleranceSeconds: number;
  networkVerifier: NetworkVerifier;
  executionEnabled: () => boolean;
  privateNetworkRequired?: boolean;
  securityState?: SecurityStateService;
}

const DeviceIdHeaderSchema = z.string().uuid();

export class SecurityMiddleware {
  readonly #identities = new WeakMap<FastifyRequest, AuthenticatedIdentity>();
  readonly #devices = new WeakMap<FastifyRequest, StoredDevice>();
  readonly #envelopes = new WeakMap<FastifyRequest, SignedCommandEnvelope>();
  readonly #networkStates = new WeakMap<FastifyRequest, NetworkVerificationResult>();

  constructor(
    readonly identityService: IdentityService,
    readonly options: SecurityMiddlewareOptions,
  ) {}

  readonly requireAuthentication: preHandlerHookHandler = async (request) => {
    try {
      const token = request.cookies[this.options.cookieName];
      if (!token) {
        throw new ApiSecurityError(
          401,
          "AUTHENTICATION_REQUIRED",
          "A valid session is required.",
        );
      }
      this.#identities.set(
        request,
        await this.identityService.authenticateToken(token),
      );
    } catch (error) {
      this.auditDenial(request, "Authentication failed.");
      throw error;
    }
  };

  readonly requireTrustedOrigin: preHandlerHookHandler = (request, _reply, done) => {
    const origin = request.headers.origin;
    if (origin !== this.options.webOrigin) {
      this.auditDenial(request, "Request origin was not trusted.");
      done(
        new ApiSecurityError(
          403,
          "ORIGIN_NOT_ALLOWED",
          "The request origin is not trusted.",
        ),
      );
      return;
    }
    done();
  };

  readonly requireCsrf: preHandlerHookHandler = async (request) => {
    if (!this.options.securityState) {
      throw new ApiSecurityError(
        503,
        "SECURITY_STATE_UNAVAILABLE",
        "CSRF protection is unavailable.",
      );
    }
    const header = request.headers["x-csrf-token"];
    try {
      await this.options.securityState.verifyCsrf(
        this.getIdentity(request),
        typeof header === "string" ? header : undefined,
      );
    } catch (error) {
      void Promise.resolve(
        this.identityService.store.appendAudit({
          eventType: "CSRF_VALIDATION_FAILED",
          ...(this.#identities.get(request)
            ? { userId: this.#identities.get(request)!.user.id }
            : {}),
          ipAddress: request.ip,
          outcome: "DENIED",
          reason: "CSRF validation failed.",
          requestId: request.id,
        }),
      ).catch(() => undefined);
      throw error;
    }
  };

  readonly requireTrustedDevice: preHandlerHookHandler = async (request) => {
    try {
      const identity = this.getIdentity(request);
      const deviceId = DeviceIdHeaderSchema.parse(request.headers["x-device-id"]);
      const device = await this.identityService.store.findDeviceById(deviceId);
      if (
        !device ||
        device.ownerId !== identity.user.id ||
        DeviceTrustStatusSchema.parse(device.trustStatus) !== "TRUSTED"
      ) {
        throw new ApiSecurityError(
          403,
          "TRUSTED_DEVICE_REQUIRED",
          "A trusted device is required.",
        );
      }
      const touched = { ...device, lastSeen: new Date().toISOString() };
      await this.identityService.store.updateDevice(touched);
      this.#devices.set(request, touched);
    } catch (error) {
      this.auditDenial(request, "Device trust verification failed.");
      throw error;
    }
  };

  readonly verifySignedRequest: preHandlerHookHandler = async (request) => {
    const device = this.getDevice(request);
    const envelope = SignedCommandEnvelopeSchema.parse(request.body);
    const now = new Date();
    const issuedAt = new Date(envelope.issuedAt);
    const expiresAt = new Date(envelope.expiresAt);
    const toleranceMs = this.options.signedRequestToleranceSeconds * 1_000;

    if (
      envelope.deviceId !== device.id ||
      Math.abs(now.getTime() - issuedAt.getTime()) > toleranceMs ||
      expiresAt.getTime() - issuedAt.getTime() > toleranceMs ||
      expiresAt.getTime() <= now.getTime()
    ) {
      this.auditSignatureFailure(request, device.id, "Signed request expired.");
      throw new ApiSecurityError(
        401,
        "SIGNED_REQUEST_EXPIRED",
        "The signed request timestamp is outside the allowed window.",
      );
    }

    let valid = false;
    try {
      valid = await verifyEnvelopeSignature(device.publicKey, envelope);
    } catch {
      valid = false;
    }
    if (!valid) {
      this.auditSignatureFailure(request, device.id, "Signature verification failed.");
      throw new ApiSecurityError(
        401,
        "INVALID_SIGNATURE",
        "The request signature is invalid.",
      );
    }

    if (
      !(await this.identityService.store.consumeNonce(
        device.id,
        envelope.nonce,
        expiresAt,
        now,
      ))
    ) {
      const identity = this.getIdentity(request);
      await this.identityService.store.appendAudit({
        eventType: "REPLAY_REJECTED",
        userId: identity.user.id,
        deviceId: device.id,
        ipAddress: request.ip,
        outcome: "DENIED",
        reason: "Duplicate nonce rejected.",
        requestId: request.id,
      });
      throw new ApiSecurityError(
        409,
        "DUPLICATE_NONCE",
        "The request nonce has already been used.",
      );
    }

    this.#envelopes.set(request, envelope);
  };

  readonly verifyPrivateNetwork: preHandlerHookHandler = async (request) => {
    const result = await this.inspectNetworkState(request);
    if (result.state !== "PRIVATE_NETWORK") {
      this.auditDenial(request, `Network verification returned ${result.state}.`);
      throw new ApiSecurityError(
        403,
        "PRIVATE_NETWORK_REQUIRED",
        "Private-network verification is required.",
      );
    }
  };

  readonly verifyTransportNetwork: preHandlerHookHandler = async (request) => {
    const result = await this.inspectNetworkState(request);
    if (
      this.options.privateNetworkRequired !== false &&
      result.state !== "PRIVATE_NETWORK"
    ) {
      this.auditDenial(request, `Network verification returned ${result.state}.`);
      throw new ApiSecurityError(
        403,
        "PRIVATE_NETWORK_REQUIRED",
        "Private-network verification is required.",
      );
    }
  };

  readonly inspectNetwork: preHandlerHookHandler = async (request) => {
    await this.inspectNetworkState(request);
  };

  readonly requireExecutionEnabled: preHandlerHookHandler = (request, _reply, done) => {
    if (!this.options.executionEnabled()) {
      this.auditDenial(request, "Execution is disabled.");
      done(new ApiSecurityError(409, "EXECUTION_DISABLED", "Execution is disabled."));
      return;
    }
    done();
  };

  getIdentity(request: FastifyRequest) {
    const identity = this.#identities.get(request);
    if (!identity) {
      throw new ApiSecurityError(
        401,
        "AUTHENTICATION_REQUIRED",
        "A valid session is required.",
      );
    }
    return identity;
  }

  getDevice(request: FastifyRequest) {
    const device = this.#devices.get(request);
    if (!device) {
      throw new ApiSecurityError(
        403,
        "TRUSTED_DEVICE_REQUIRED",
        "A trusted device is required.",
      );
    }
    return device;
  }

  getEnvelope(request: FastifyRequest) {
    const envelope = this.#envelopes.get(request);
    if (!envelope) {
      throw new ApiSecurityError(
        401,
        "SIGNED_REQUEST_REQUIRED",
        "A valid signed request is required.",
      );
    }
    return envelope;
  }

  getNetworkState(request: FastifyRequest) {
    return this.#networkStates.get(request)?.state ?? "UNKNOWN";
  }

  getNetworkResult(request: FastifyRequest) {
    return this.#networkStates.get(request);
  }

  private auditDenial(request: FastifyRequest, reason: string) {
    const identity = this.#identities.get(request);
    const device = this.#devices.get(request);
    void Promise.resolve(
      this.identityService.store.appendAudit({
        eventType: "REQUEST_DENIED",
        ...(identity ? { userId: identity.user.id } : {}),
        ...(device ? { deviceId: device.id } : {}),
        ipAddress: request.ip,
        outcome: "DENIED",
        reason,
        requestId: request.id,
      }),
    ).catch(() => undefined);
  }

  private auditSignatureFailure(
    request: FastifyRequest,
    deviceId: string,
    reason: string,
  ) {
    const identity = this.getIdentity(request);
    void Promise.resolve(
      this.identityService.store.appendAudit({
        eventType: "INVALID_SIGNATURE",
        userId: identity.user.id,
        deviceId,
        ipAddress: request.ip,
        outcome: "DENIED",
        reason,
        requestId: request.id,
      }),
    ).catch(() => undefined);
  }

  private async inspectNetworkState(request: FastifyRequest) {
    const result = await this.options.networkVerifier.verify({
      remoteAddress: request.socket.remoteAddress ?? request.ip,
      ...(typeof request.headers["tailscale-user-login"] === "string"
        ? { tailscaleUserLogin: request.headers["tailscale-user-login"] }
        : {}),
      ...(typeof request.headers["tailscale-user-name"] === "string"
        ? { tailscaleUserName: request.headers["tailscale-user-name"] }
        : {}),
    });
    this.#networkStates.set(request, result);
    const identity = this.#identities.get(request);
    if (identity) {
      const session = {
        ...identity.session,
        lastNetworkVerification: result.state,
      };
      await this.identityService.store.updateSession(session);
      this.#identities.set(request, { ...identity, session });
    }
    void Promise.resolve(
      this.identityService.store.appendAudit({
        eventType:
          result.state === "PRIVATE_NETWORK"
            ? "NETWORK_VERIFICATION_SUCCEEDED"
            : result.reasonCode === "TAILSCALE_HEADERS_FROM_UNTRUSTED_PROXY"
              ? "UNTRUSTED_PROXY_DETECTED"
              : "NETWORK_VERIFICATION_FAILED",
        ...(identity ? { userId: identity.user.id } : {}),
        ipAddress: request.ip,
        outcome: result.state === "PRIVATE_NETWORK" ? "SUCCESS" : "DENIED",
        reason: `Network verification: ${result.reasonCode}.`,
        requestId: request.id,
        metadata: {
          state: result.state,
          source: result.source,
          reasonCode: result.reasonCode,
        },
      }),
    ).catch(() => undefined);
    return result;
  }
}

export const clearSessionCookie = (
  reply: FastifyReply,
  cookieName: string,
  secure: boolean,
) => {
  reply.clearCookie(cookieName, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure,
  });
};
