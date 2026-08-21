import { z } from "zod";

export const AccountStatusSchema = z.enum(["ACTIVE", "LOCKED", "PENDING", "DISABLED"]);

export const UserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.email(),
    displayName: z.string().trim().min(1).max(100),
    passwordHash: z.string().min(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    lastLoginAt: z.iso.datetime().nullable(),
    accountStatus: AccountStatusSchema,
  })
  .strict();

export const PublicUserSchema = UserSchema.omit({ passwordHash: true });

export const PasswordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters.")
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter.")
  .regex(/[A-Z]/, "Password must contain an uppercase letter.")
  .regex(/[0-9]/, "Password must contain a number.")
  .regex(/[^A-Za-z0-9]/, "Password must contain a symbol.");

export const RegisterRequestSchema = z
  .object({
    email: z.email().transform((value) => value.toLowerCase()),
    displayName: z.string().trim().min(1).max(100),
    password: PasswordSchema,
  })
  .strict()
  .refine(
    ({ email, password }) =>
      !password.toLowerCase().includes(email.split("@")[0] ?? ""),
    {
      message: "Password must not contain the email username.",
      path: ["password"],
    },
  );

export const LoginRequestSchema = z
  .object({
    email: z.email().transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();

export const AuthSessionSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    idleExpiresAt: z.iso.datetime(),
    absoluteExpiresAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    revokedAt: z.iso.datetime().nullable(),
    revocationReason: z.string().max(200).nullable(),
    ipAddress: z.string().min(1),
    userAgent: z.string().max(500),
    lastNetworkVerification: z
      .enum(["UNKNOWN", "PRIVATE_NETWORK", "PUBLIC_NETWORK", "UNAVAILABLE"])
      .optional(),
    current: z.boolean().optional(),
  })
  .strict();

export const AuthStateResponseSchema = z
  .object({
    authenticated: z.boolean(),
    user: PublicUserSchema.optional(),
    session: AuthSessionSchema.optional(),
  })
  .strict()
  .refine(
    ({ authenticated, session, user }) =>
      authenticated ? user !== undefined && session !== undefined : true,
    {
      message: "Authenticated responses require a user and session.",
    },
  );

export const AuthSuccessResponseSchema = z
  .object({
    success: z.literal(true),
    user: PublicUserSchema,
    session: AuthSessionSchema,
  })
  .strict();

export const LogoutResponseSchema = z
  .object({
    success: z.literal(true),
  })
  .strict();

export const SessionListResponseSchema = z.array(AuthSessionSchema);

export const SessionRevocationResponseSchema = z
  .object({
    success: z.literal(true),
    sessionId: z.string().uuid(),
  })
  .strict();

export const RevokeOtherSessionsResponseSchema = z
  .object({
    success: z.literal(true),
    revokedCount: z.number().int().nonnegative(),
  })
  .strict();

export const GoogleOAuthStatusSchema = z
  .object({
    available: z.literal(false),
    mode: z.literal("structure_only"),
    message: z.string().min(1),
  })
  .strict();

export type AccountStatus = z.infer<typeof AccountStatusSchema>;
export type User = z.infer<typeof UserSchema>;
export type PublicUser = z.infer<typeof PublicUserSchema>;
export type AuthSession = z.infer<typeof AuthSessionSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type AuthStateResponse = z.infer<typeof AuthStateResponseSchema>;
