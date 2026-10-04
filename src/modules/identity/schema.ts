import type { BetterAuthOptions } from "better-auth";

// Table and column names Better Auth uses, mapped to our snake_case schema
// (db/migrations/0006_identity.sql). Only src/modules/identity may import better-auth;
// the rest of the code talks to this module.

export const identityModels = {
  user: {
    modelName: "users",
    // Our own column, unknown to Better Auth until declared. input:false: a client can never set it.
    additionalFields: {
      status: { type: "string", required: false, defaultValue: "active", input: false },
    },
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  session: {
    modelName: "auth_sessions",
    // Our own columns (migration 0010). input:false: a client can never set them.
    additionalFields: {
      limited: { type: "boolean", required: false, defaultValue: false, input: false },
      unlockMethod: {
        type: "string",
        required: false,
        input: false,
        fieldName: "unlock_method",
      },
    },
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  account: {
    modelName: "auth_accounts",
    fields: {
      userId: "user_id",
      accountId: "account_id",
      providerId: "provider_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "auth_verifications",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
} as const satisfies Pick<BetterAuthOptions, "user" | "session" | "account" | "verification">;

/** Plugin table settings, passed to phoneNumber() and twoFactor() when they are created. */
export const phoneNumberSchema = {
  user: {
    fields: {
      phoneNumber: "phone_number",
      phoneNumberVerified: "phone_number_verified",
    },
  },
} as const;

export const twoFactorSchema = {
  user: { fields: { twoFactorEnabled: "two_factor_enabled" } },
  twoFactor: {
    modelName: "auth_two_factor",
    fields: {
      userId: "user_id",
      backupCodes: "backup_codes",
      failedVerificationCount: "failed_verification_count",
      lockedUntil: "locked_until",
    },
  },
} as const;
