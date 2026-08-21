import {
  AuthSessionSchema,
  DeviceViewSchema,
  PublicUserSchema,
  RegisteredDeviceSchema,
  UserSchema,
  type AuthSession,
  type DeviceType,
  type DeviceView,
  type Ed25519PublicKey,
  type LoginRequest,
  type PublicUser,
  type RegisterRequest,
} from "@alexa-control/shared";

import {
  createPairingCode,
  createSecretToken,
  fingerprintPublicKey,
  hashPassword,
  hashSecret,
  secretsMatch,
  verifyPassword,
} from "./crypto.js";
import { ApiSecurityError } from "./errors.js";
import type { IdentityStore } from "./store.js";
import type {
  AuthenticatedIdentity,
  PairingIntent,
  StoredDevice,
  StoredSession,
} from "./types.js";

export interface IdentityServiceOptions {
  allowOwnerBootstrap: boolean;
  sessionIdleTtlSeconds: number;
  sessionAbsoluteTtlSeconds: number;
  pairingTtlSeconds: number;
  now?: () => Date;
}

export interface RequestMetadata {
  ipAddress: string;
  userAgent: string;
}

const toPublicUser = (user: {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  accountStatus: "ACTIVE" | "LOCKED" | "PENDING" | "DISABLED";
}): PublicUser =>
  PublicUserSchema.parse({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
    accountStatus: user.accountStatus,
  });

export const toAuthSession = (session: StoredSession, current?: boolean): AuthSession =>
  AuthSessionSchema.parse({
    id: session.id,
    userId: session.userId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    idleExpiresAt: session.idleExpiresAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
    lastSeenAt: session.lastSeenAt,
    revokedAt: session.revokedAt,
    revocationReason: session.revocationReason,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    ...(session.lastNetworkVerification
      ? { lastNetworkVerification: session.lastNetworkVerification }
      : {}),
    ...(current === undefined ? {} : { current }),
  });

export const toDeviceView = (device: StoredDevice): DeviceView =>
  DeviceViewSchema.parse({
    id: device.id,
    deviceName: device.deviceName,
    deviceType: device.deviceType,
    trustStatus: device.trustStatus,
    fingerprint: device.fingerprint,
    pairedAt: device.pairedAt,
    lastSeen: device.lastSeen,
    revokedAt: device.revokedAt,
    ownerId: device.ownerId,
    createdAt: device.createdAt,
    capabilities: device.capabilities,
    metadata: device.metadata,
  });

export class IdentityService {
  readonly #dummyPasswordHash: string;

  private constructor(
    readonly store: IdentityStore,
    readonly options: IdentityServiceOptions,
    dummyPasswordHash: string,
  ) {
    this.#dummyPasswordHash = dummyPasswordHash;
  }

  static async create(store: IdentityStore, options: IdentityServiceOptions) {
    return new IdentityService(store, options, await hashPassword(createSecretToken()));
  }

  async registerOwner(input: RegisterRequest, metadata: RequestMetadata) {
    if (!this.options.allowOwnerBootstrap || (await this.store.countUsers()) > 0) {
      throw new ApiSecurityError(
        409,
        "OWNER_BOOTSTRAP_UNAVAILABLE",
        "Owner registration is not available.",
      );
    }

    const now = this.now().toISOString();
    const user = UserSchema.parse({
      id: crypto.randomUUID(),
      email: input.email,
      displayName: input.displayName,
      passwordHash: await hashPassword(input.password),
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
      accountStatus: "ACTIVE",
    });
    if ((await this.store.countUsers()) > 0) {
      throw new ApiSecurityError(
        409,
        "OWNER_BOOTSTRAP_UNAVAILABLE",
        "Owner registration is not available.",
      );
    }
    await this.store.createUser(user);
    const created = await this.createSession(user.id, metadata);

    return {
      user: toPublicUser(user),
      session: toAuthSession(created.session, true),
      token: created.token,
    };
  }

  async login(input: LoginRequest, metadata: RequestMetadata) {
    const user = await this.store.findUserByEmail(input.email);
    const passwordValid = await verifyPassword(
      user?.passwordHash ?? this.#dummyPasswordHash,
      input.password,
    );

    if (!user || !passwordValid || user.accountStatus !== "ACTIVE") {
      throw new ApiSecurityError(
        401,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect.",
      );
    }

    const now = this.now().toISOString();
    const updated = UserSchema.parse({
      ...user,
      lastLoginAt: now,
      updatedAt: now,
    });
    await this.store.updateUser(updated);
    const created = await this.createSession(updated.id, metadata);

    return {
      user: toPublicUser(updated),
      session: toAuthSession(created.session, true),
      token: created.token,
    };
  }

  async authenticateToken(token: string): Promise<AuthenticatedIdentity> {
    const session = await this.store.findSessionByTokenHash(hashSecret(token));
    if (
      !session ||
      session.revokedAt !== null ||
      new Date(session.idleExpiresAt).getTime() <= this.now().getTime() ||
      new Date(session.absoluteExpiresAt).getTime() <= this.now().getTime()
    ) {
      throw new ApiSecurityError(
        401,
        "AUTHENTICATION_REQUIRED",
        "A valid session is required.",
      );
    }

    const user = await this.store.findUserById(session.userId);
    if (!user || user.accountStatus !== "ACTIVE") {
      throw new ApiSecurityError(
        401,
        "AUTHENTICATION_REQUIRED",
        "A valid session is required.",
      );
    }

    const now = this.now();
    const touched = {
      ...session,
      lastSeenAt: now.toISOString(),
      idleExpiresAt: new Date(
        Math.min(
          now.getTime() + this.options.sessionIdleTtlSeconds * 1_000,
          new Date(session.absoluteExpiresAt).getTime(),
        ),
      ).toISOString(),
    };
    await this.store.updateSession(touched);
    return { user, session: touched };
  }

  async revokeSession(sessionId: string, ownerId: string, reason = "OWNER_REVOKED") {
    const session = await this.store.findSessionById(sessionId);
    if (!session || session.userId !== ownerId) {
      throw new ApiSecurityError(404, "SESSION_NOT_FOUND", "Session was not found.");
    }
    const revoked = {
      ...session,
      revokedAt: this.now().toISOString(),
      revocationReason: reason,
    };
    await this.store.updateSession(revoked);
    return revoked;
  }

  async createPairingIntent(ownerId: string) {
    const pairingCode = createPairingCode();
    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.options.pairingTtlSeconds * 1_000);
    const intent: PairingIntent = {
      id: crypto.randomUUID(),
      ownerId,
      codeHash: hashSecret(pairingCode),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      usedAt: null,
    };
    await this.store.createPairingIntent(intent);
    return { pairingCode, expiresAt: intent.expiresAt };
  }

  async requestPairing(input: {
    pairingCode: string;
    deviceName: string;
    deviceType: DeviceType;
    publicKey: Ed25519PublicKey;
  }) {
    const now = this.now();
    const intent = await this.store.consumePairingIntent(
      hashSecret(input.pairingCode),
      now,
    );
    if (!intent) {
      throw new ApiSecurityError(
        400,
        "PAIRING_CODE_INVALID",
        "The pairing code is invalid or expired.",
      );
    }

    const pairingRequestToken = createSecretToken();
    const device = RegisteredDeviceSchema.parse({
      id: crypto.randomUUID(),
      deviceName: input.deviceName,
      deviceType: input.deviceType,
      trustStatus: "PENDING",
      publicKey: input.publicKey,
      fingerprint: fingerprintPublicKey(input.publicKey),
      pairedAt: null,
      lastSeen: null,
      revokedAt: null,
      ownerId: intent.ownerId,
      createdAt: now.toISOString(),
      capabilities: [],
      metadata: {},
    });
    await this.store.createDevice({
      ...device,
      pairingRequestTokenHash: hashSecret(pairingRequestToken),
    });
    return { device, pairingRequestToken };
  }

  async getPairingStatus(deviceId: string, pairingRequestToken: string) {
    const device = await this.store.findDeviceById(deviceId);
    if (
      !device ||
      !secretsMatch(device.pairingRequestTokenHash, hashSecret(pairingRequestToken))
    ) {
      throw new ApiSecurityError(
        404,
        "PAIRING_REQUEST_NOT_FOUND",
        "Pairing request was not found.",
      );
    }
    return device;
  }

  async mutateDevice(deviceId: string, ownerId: string, action: "approve" | "revoke") {
    const device = await this.store.findDeviceById(deviceId);
    if (!device || device.ownerId !== ownerId) {
      throw new ApiSecurityError(404, "DEVICE_NOT_FOUND", "Device was not found.");
    }
    if (action === "approve" && device.trustStatus !== "PENDING") {
      throw new ApiSecurityError(
        409,
        "DEVICE_NOT_PENDING",
        "Only pending devices can be approved.",
      );
    }
    if (action === "revoke" && device.trustStatus === "REVOKED") {
      return device;
    }

    const now = this.now().toISOString();
    const updated: StoredDevice = {
      ...device,
      trustStatus: action === "approve" ? "TRUSTED" : "REVOKED",
      pairedAt: action === "approve" ? now : device.pairedAt,
      revokedAt: action === "revoke" ? now : null,
    };
    await this.store.updateDevice(updated);
    return updated;
  }

  private async createSession(userId: string, metadata: RequestMetadata) {
    const token = createSecretToken();
    const now = this.now();
    const idleExpiresAt = new Date(
      now.getTime() + this.options.sessionIdleTtlSeconds * 1_000,
    );
    const absoluteExpiresAt = new Date(
      now.getTime() + this.options.sessionAbsoluteTtlSeconds * 1_000,
    );
    const session: StoredSession = {
      id: crypto.randomUUID(),
      userId,
      tokenHash: hashSecret(token),
      createdAt: now.toISOString(),
      expiresAt: absoluteExpiresAt.toISOString(),
      lastSeenAt: now.toISOString(),
      revokedAt: null,
      revocationReason: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      idleExpiresAt: idleExpiresAt.toISOString(),
      absoluteExpiresAt: absoluteExpiresAt.toISOString(),
    };
    await this.store.createSession(session);
    return { session, token };
  }

  private now() {
    return this.options.now?.() ?? new Date();
  }
}
