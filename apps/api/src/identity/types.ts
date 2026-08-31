import type {
  AuditEventType,
  AuditOutcome,
  JsonValue,
  RegisteredDevice,
  User,
} from "@alexa-control/shared";

export interface StoredSession {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
  ipAddress: string;
  userAgent: string;
  activeCompanyId?: string;
  lastNetworkVerification?:
    "PRIVATE_NETWORK" | "PUBLIC_NETWORK" | "UNKNOWN" | "UNAVAILABLE";
}

export interface PairingIntent {
  id: string;
  ownerId: string;
  codeHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface StoredDevice extends RegisteredDevice {
  pairingRequestTokenHash: string;
}

export interface StoredAuditRecord {
  id: string;
  eventType: AuditEventType;
  timestamp: string;
  userId: string | null;
  companyId: string | null;
  deviceId: string | null;
  ipAddress: string;
  outcome: AuditOutcome;
  reason: string;
  requestId: string;
  metadata?: Record<string, JsonValue>;
}

export interface CreateAuditRecord {
  eventType: AuditEventType;
  userId?: string | null;
  companyId?: string | null;
  deviceId?: string | null;
  ipAddress: string;
  outcome: AuditOutcome;
  reason: string;
  requestId: string;
  metadata?: Record<string, JsonValue>;
}

export interface AuthenticatedIdentity {
  user: User;
  session: StoredSession;
}
