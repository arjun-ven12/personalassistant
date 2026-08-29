import type { RecentAuthPurpose } from "@alexa-control/shared";

import {
  createSecretToken,
  hashPassword,
  hashSecret,
  secretsMatch,
  verifyPassword,
} from "../identity/crypto.js";
import { ApiSecurityError } from "../identity/errors.js";
import type { IdentityService } from "../identity/service.js";
import type { AuthenticatedIdentity } from "../identity/types.js";
import type {
  SecurityStateStore,
  StoredRecentAuthGrant,
  StoredRecoveryCode,
} from "./store.js";

export interface SecurityStateServiceOptions {
  csrfTtlSeconds: number;
  recentAuthTtlSeconds: number;
  recoveryCodeCount: number;
  now?: () => Date;
}

export class SecurityStateService {
  readonly #now: () => Date;

  constructor(
    readonly store: SecurityStateStore,
    readonly identity: IdentityService,
    readonly options: SecurityStateServiceOptions,
  ) {
    this.#now = options.now ?? (() => new Date());
  }

  async issueCsrf(identity: AuthenticatedIdentity) {
    const token = createSecretToken();
    const now = this.#now();
    const expiresAt = new Date(
      Math.min(
        now.getTime() + this.options.csrfTtlSeconds * 1_000,
        new Date(identity.session.absoluteExpiresAt).getTime(),
      ),
    );
    await this.store.putCsrfToken({
      sessionId: identity.session.id,
      tokenHash: hashSecret(token),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async verifyCsrf(identity: AuthenticatedIdentity, token: string | undefined) {
    if (!token) {
      throw new ApiSecurityError(
        403,
        "CSRF_TOKEN_REQUIRED",
        "A CSRF token is required.",
      );
    }
    const stored = await this.store.findCsrfToken(identity.session.id);
    if (!stored) {
      throw new ApiSecurityError(
        403,
        "CSRF_TOKEN_INVALID",
        "The CSRF token is invalid.",
      );
    }
    if (new Date(stored.expiresAt).getTime() <= this.#now().getTime()) {
      await this.store.deleteCsrfToken(identity.session.id);
      throw new ApiSecurityError(403, "CSRF_TOKEN_EXPIRED", "The CSRF token expired.");
    }
    if (!secretsMatch(stored.tokenHash, hashSecret(token))) {
      throw new ApiSecurityError(
        403,
        "CSRF_TOKEN_INVALID",
        "The CSRF token is invalid.",
      );
    }
  }

  async createRecentAuthChallenge(
    identity: AuthenticatedIdentity,
    purpose: RecentAuthPurpose,
  ) {
    const challengeToken = createSecretToken();
    const now = this.#now();
    const expiresAt = new Date(now.getTime() + 5 * 60_000);
    const challenge = {
      id: crypto.randomUUID(),
      ownerId: identity.user.id,
      sessionId: identity.session.id,
      tokenHash: hashSecret(challengeToken),
      purpose,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      usedAt: null,
    };
    await this.store.createRecentAuthChallenge(challenge);
    return {
      challengeId: challenge.id,
      challengeToken,
      purpose,
      expiresAt: challenge.expiresAt,
    };
  }

  async verifyRecentPassword(
    identity: AuthenticatedIdentity,
    input: { challengeId: string; challengeToken: string; password: string },
  ) {
    const challenge = await this.store.findRecentAuthChallenge(input.challengeId);
    const now = this.#now();
    const validChallenge =
      challenge &&
      challenge.ownerId === identity.user.id &&
      challenge.sessionId === identity.session.id &&
      challenge.usedAt === null &&
      new Date(challenge.expiresAt).getTime() > now.getTime() &&
      secretsMatch(challenge.tokenHash, hashSecret(input.challengeToken));
    const passwordValid = await verifyPassword(
      identity.user.passwordHash,
      input.password,
    );
    if (!validChallenge || !passwordValid) {
      throw new ApiSecurityError(
        401,
        "RECENT_AUTHENTICATION_FAILED",
        "Recent authentication failed.",
      );
    }
    await this.store.updateRecentAuthChallenge({
      ...challenge,
      usedAt: now.toISOString(),
    });
    const grant: StoredRecentAuthGrant = {
      id: crypto.randomUUID(),
      ownerId: identity.user.id,
      sessionId: identity.session.id,
      purpose: challenge.purpose,
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + this.options.recentAuthTtlSeconds * 1_000,
      ).toISOString(),
      consumedAt: null,
      revokedAt: null,
    };
    await this.store.createRecentAuthGrant(grant);
    return grant;
  }

  async verifyTrustedDeviceBiometric(
    identity: AuthenticatedIdentity,
    input: { challengeId: string; challengeToken: string },
  ) {
    const challenge = await this.store.findRecentAuthChallenge(input.challengeId);
    const now = this.#now();
    const validChallenge =
      challenge &&
      challenge.ownerId === identity.user.id &&
      challenge.sessionId === identity.session.id &&
      challenge.purpose === "approve_high_risk_action" &&
      challenge.usedAt === null &&
      new Date(challenge.expiresAt).getTime() > now.getTime() &&
      secretsMatch(challenge.tokenHash, hashSecret(input.challengeToken));
    if (!validChallenge) {
      throw new ApiSecurityError(
        401,
        "RECENT_AUTHENTICATION_FAILED",
        "Recent authentication failed.",
      );
    }
    await this.store.updateRecentAuthChallenge({
      ...challenge,
      usedAt: now.toISOString(),
    });
    const grant: StoredRecentAuthGrant = {
      id: crypto.randomUUID(),
      ownerId: identity.user.id,
      sessionId: identity.session.id,
      purpose: challenge.purpose,
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + this.options.recentAuthTtlSeconds * 1_000,
      ).toISOString(),
      consumedAt: null,
      revokedAt: null,
    };
    await this.store.createRecentAuthGrant(grant);
    return grant;
  }

  async status(identity: AuthenticatedIdentity, purpose: RecentAuthPurpose) {
    const grant = await this.store.findRecentAuthGrant(
      identity.user.id,
      identity.session.id,
      purpose,
      this.#now(),
    );
    return grant
      ? { active: true as const, purpose: grant.purpose, expiresAt: grant.expiresAt }
      : { active: false as const };
  }

  async consumeGrant(identity: AuthenticatedIdentity, purpose: RecentAuthPurpose) {
    const grant = await this.store.findRecentAuthGrant(
      identity.user.id,
      identity.session.id,
      purpose,
      this.#now(),
    );
    if (!grant) {
      throw new ApiSecurityError(
        409,
        "RECENT_AUTHENTICATION_REQUIRED",
        "Recent authentication is required.",
      );
    }
    if (
      !(await this.store.consumeRecentAuthGrant(grant.id, this.#now().toISOString()))
    ) {
      throw new ApiSecurityError(
        409,
        "RECENT_AUTHENTICATION_REQUIRED",
        "Recent authentication is required.",
      );
    }
  }

  async recoveryStatus(ownerId: string) {
    const records = await this.store.listRecoveryCodes(ownerId);
    const active = records.filter(
      (code) => code.consumedAt === null && code.invalidatedAt === null,
    );
    return {
      unusedCount: active.length,
      generatedAt:
        records.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0]
          ?.generatedAt ?? null,
    };
  }

  async generateRecoveryCodes(ownerId: string) {
    const now = this.#now().toISOString();
    await this.store.invalidateRecoveryCodes(ownerId, now);
    const plaintext = Array.from({ length: this.options.recoveryCodeCount }, () =>
      this.recoveryCode(),
    );
    const stored: StoredRecoveryCode[] = await Promise.all(
      plaintext.map(async (code) => ({
        id: crypto.randomUUID(),
        ownerId,
        codeHash: await hashPassword(code),
        generatedAt: now,
        consumedAt: null,
        invalidatedAt: null,
      })),
    );
    await this.store.createRecoveryCodes(stored);
    return { codes: plaintext, generatedAt: now };
  }

  async invalidateRecoveryCodes(ownerId: string) {
    return this.store.invalidateRecoveryCodes(ownerId, this.#now().toISOString());
  }

  async useRecoveryCode(email: string, plaintext: string) {
    const owner = await this.identity.store.findUserByEmail(email);
    if (owner) {
      const active = (await this.store.listRecoveryCodes(owner.id)).filter(
        (code) => code.consumedAt === null && code.invalidatedAt === null,
      );
      for (const code of active) {
        if (await verifyPassword(code.codeHash, plaintext)) {
          if (
            await this.store.consumeRecoveryCode(code.id, this.#now().toISOString())
          ) {
            return owner;
          }
        }
      }
    } else {
      await hashPassword(plaintext);
    }
    throw new ApiSecurityError(
      401,
      "RECOVERY_CODE_INVALID",
      "The recovery code is invalid or has already been used.",
    );
  }

  private recoveryCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const raw = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
    return raw.match(/.{5}/g)!.join("-");
  }
}
