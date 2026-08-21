import {
  VoiceCaptureLeaseResponseSchema,
  type VoiceCaptureClientType,
  type VoiceCaptureLeaseResponse,
} from "@alexa-control/shared";

import type { RedisService } from "../intelligence/redis-service.js";

const LEASE_TTL_MS = 20_000;
const LOCK_ATTEMPTS = 12;
const LOCK_RETRY_BASE_MS = 50;

interface CaptureLease {
  ownerId: string;
  deviceId: string | null;
  voiceSessionId: string;
  clientType: VoiceCaptureClientType;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
}

type LeaseAction = "acquire" | "takeover" | "heartbeat" | "release" | "status";

interface LeaseInput {
  ownerId: string;
  deviceId: string | null;
  voiceSessionId: string;
  clientType: VoiceCaptureClientType;
  action: LeaseAction;
}

type LeaseIdentity = Omit<LeaseInput, "action">;

export class VoiceCaptureLeaseService {
  #memory = new Map<string, CaptureLease[]>();
  #memoryLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly redis: RedisService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async act(input: LeaseInput): Promise<VoiceCaptureLeaseResponse> {
    return this.withOwnerLock(input.ownerId, async () => {
      const now = this.now();
      const leases = (await this.read(input.ownerId)).filter(
        (lease) => new Date(lease.expiresAt) > now,
      );
      const own = leases.find((lease) => this.isSameLease(lease, input));
      const conflicting = this.findConflict(leases, input);

      if (input.action === "status") return this.response(conflicting ?? own ?? null, now);
      if (input.action === "acquire" || input.action === "takeover") {
        if (own) {
          const renewed = this.renew(own, now);
          await this.write(input.ownerId, leases.map((lease) => (lease === own ? renewed : lease)), now);
          return this.response(renewed, now, "ACQUIRED");
        }
        if (conflicting && input.action === "acquire")
          return this.response(conflicting, now, "DENIED");
        const acquired = this.create(input, now);
        const retained =
          input.action === "takeover"
            ? leases.filter((lease) => !this.conflicts(lease, input))
            : leases;
        await this.write(input.ownerId, [...retained, acquired], now);
        return this.response(acquired, now, "ACQUIRED");
      }
      if (!own) return this.response(conflicting ?? null, now, conflicting ? "DENIED" : "FREE");
      if (input.action === "heartbeat") {
        const renewed = this.renew(own, now);
        await this.write(input.ownerId, leases.map((lease) => (lease === own ? renewed : lease)), now);
        return this.response(renewed, now, "ACQUIRED");
      }
      await this.write(input.ownerId, leases.filter((lease) => lease !== own), now);
      return this.response(null, now, "FREE");
    });
  }

  async isOwner(input: LeaseIdentity) {
    return this.withOwnerLock(input.ownerId, async () => {
      const now = this.now();
      const leases = (await this.read(input.ownerId)).filter(
        (lease) => new Date(lease.expiresAt) > now,
      );
      await this.write(input.ownerId, leases, now);
      return leases.some((lease) => this.isSameLease(lease, input));
    });
  }

  private key(ownerId: string) {
    return `voice:capture:${ownerId}`;
  }

  private async withOwnerLock<T>(ownerId: string, work: () => Promise<T>) {
    if (this.redis.mode !== "disabled") {
      for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
        try {
          return await this.redis.withLock(this.key(ownerId), 3, work);
        } catch (error) {
          if (
            !(error instanceof Error) ||
            error.message !== "DISTRIBUTED_LOCK_NOT_ACQUIRED" ||
            attempt === LOCK_ATTEMPTS - 1
          )
            throw error;
          await new Promise((resolve) =>
            setTimeout(resolve, LOCK_RETRY_BASE_MS * (attempt + 1)),
          );
        }
      }
      throw new Error("DISTRIBUTED_LOCK_NOT_ACQUIRED");
    }
    const previous = this.#memoryLocks.get(ownerId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#memoryLocks.set(ownerId, current);
    await previous;
    try {
      return await work();
    } finally {
      release?.();
      if (this.#memoryLocks.get(ownerId) === current) this.#memoryLocks.delete(ownerId);
    }
  }

  private async read(ownerId: string): Promise<CaptureLease[]> {
    if (this.redis.mode === "disabled") return this.#memory.get(ownerId) ?? [];
    const raw = await this.redis.get(this.key(ownerId));
    if (!raw) return [];
    try {
      const value: unknown = JSON.parse(raw);
      return Array.isArray(value) ? (value as CaptureLease[]) : [];
    } catch {
      return [];
    }
  }

  private async write(ownerId: string, leases: CaptureLease[], now: Date) {
    if (this.redis.mode === "disabled") {
      if (leases.length === 0) this.#memory.delete(ownerId);
      else this.#memory.set(ownerId, leases);
      return;
    }
    if (leases.length === 0) return this.redis.del(this.key(ownerId));
    const latestExpiry = Math.max(...leases.map((lease) => new Date(lease.expiresAt).getTime()));
    const ttlSeconds = Math.max(1, Math.ceil((latestExpiry - now.getTime()) / 1_000));
    await this.redis.set(this.key(ownerId), JSON.stringify(leases), ttlSeconds);
  }

  private findConflict(leases: CaptureLease[], input: LeaseInput) {
    // Browser capture is deliberately owner-wide: the web client cannot prove
    // which trusted Mac microphone it is using. Overlay leases remain device-bound.
    if (input.clientType === "WEB") return leases[0] ?? null;
    return (
      leases.find((lease) => lease.clientType === "WEB") ??
      leases.find((lease) => lease.deviceId === input.deviceId) ??
      null
    );
  }

  private conflicts(lease: CaptureLease, input: LeaseInput) {
    if (input.clientType === "WEB") return true;
    return lease.clientType === "WEB" || lease.deviceId === input.deviceId;
  }

  private isSameLease(lease: CaptureLease, input: LeaseIdentity) {
    return (
      lease.clientType === input.clientType &&
      lease.deviceId === input.deviceId &&
      lease.voiceSessionId === input.voiceSessionId
    );
  }

  private create(input: LeaseInput, now: Date): CaptureLease {
    const timestamp = now.toISOString();
    return {
      ownerId: input.ownerId,
      deviceId: input.deviceId,
      voiceSessionId: input.voiceSessionId,
      clientType: input.clientType,
      acquiredAt: timestamp,
      heartbeatAt: timestamp,
      expiresAt: new Date(now.getTime() + LEASE_TTL_MS).toISOString(),
    };
  }

  private renew(lease: CaptureLease, now: Date): CaptureLease {
    return {
      ...lease,
      heartbeatAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + LEASE_TTL_MS).toISOString(),
    };
  }

  private response(lease: CaptureLease | null, now: Date, forced?: "ACQUIRED" | "DENIED" | "FREE") {
    return VoiceCaptureLeaseResponseSchema.parse({
      status: forced ?? (lease ? "DENIED" : "FREE"),
      owner: lease?.clientType ?? null,
      expiresAt: lease && new Date(lease.expiresAt) > now ? lease.expiresAt : null,
    });
  }
}
