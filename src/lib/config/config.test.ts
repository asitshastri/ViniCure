import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config";
import { FEATURE_FLAGS, isEnabled } from "./flags";

const prodEnv = {
  NODE_ENV: "production",
  APP_ENV: "production",
  APP_URL: "https://vinicure.example",
  DATABASE_URL: "postgres://app@db/vinicure",
  VALKEY_URL: "rediss://cache:6379",
  AUTH_SECRET: "x".repeat(40),
  CRYPTO_PROVIDER: "kms",
  KMS_KEY_ID: "alias/vinicure",
  KMS_WRAPPED_KEYS: `k1=${"A".repeat(80)}`,
  KMS_CURRENT_KEY_ID: "k1",
  S3_BUCKET_FILES: "files",
  S3_BUCKET_EXPORTS: "exports",
  S3_REGION: "ap-south-1",
};

describe("loadConfig", () => {
  it("loads defaults for local development", () => {
    const config = loadConfig({});
    expect(config.NODE_ENV).toBe("development");
    expect(config.APP_ENV).toBe("local");
    expect(config.DATABASE_POOL_MAX).toBe(10);
    expect(config.ALLOWED_PHONE_COUNTRY_CODES).toEqual(["+91"]);
  });

  it("accepts a complete production environment", () => {
    expect(loadConfig(prodEnv).NODE_ENV).toBe("production");
  });

  it.each([
    "DATABASE_URL",
    "VALKEY_URL",
    "AUTH_SECRET",
    "S3_BUCKET_FILES",
    "S3_BUCKET_EXPORTS",
    "S3_REGION",
    "KMS_KEY_ID",
    "KMS_WRAPPED_KEYS",
    "KMS_CURRENT_KEY_ID",
  ])("production refuses to boot without %s", (name) => {
    const env: Record<string, string | undefined> = { ...prodEnv };
    delete env[name];
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(new RegExp(name));
  });

  it("treats a blank value as missing", () => {
    expect(() => loadConfig({ ...prodEnv, AUTH_SECRET: "" })).toThrow(/AUTH_SECRET/);
  });

  it("production rejects unsafe settings", () => {
    expect(() => loadConfig({ ...prodEnv, CRYPTO_PROVIDER: "local" })).toThrow(/kms/);
    expect(() => loadConfig({ ...prodEnv, LOCAL_DEV_KEY: "abc" })).toThrow(/LOCAL_DEV_KEY/);
    expect(() => loadConfig({ ...prodEnv, APP_URL: "http://vinicure.example" })).toThrow(/https/);
    expect(() => loadConfig({ ...prodEnv, APP_ENV: "local" })).toThrow(/APP_ENV/);
    expect(() => loadConfig({ ...prodEnv, S3_ENDPOINT: "http://minio:9000" })).toThrow(
      /S3_ENDPOINT/,
    );
    expect(() => loadConfig({ ...prodEnv, LOG_LEVEL: "debug" })).toThrow(/LOG_LEVEL/);
  });

  it("rejects a short AUTH_SECRET and reports names, never values", () => {
    try {
      loadConfig({ ...prodEnv, AUTH_SECRET: "short-secret-value" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).toMatch(/AUTH_SECRET/);
      expect((error as Error).message).not.toContain("short-secret-value");
    }
  });

  it("reports every problem at once", () => {
    try {
      loadConfig({ NODE_ENV: "production" });
      expect.unreachable();
    } catch (error) {
      expect((error as ConfigError).problems.length).toBeGreaterThan(4);
    }
  });

  it("rejects malformed values", () => {
    expect(() => loadConfig({ DATABASE_POOL_MAX: "0" })).toThrow(/DATABASE_POOL_MAX/);
    expect(() => loadConfig({ APP_URL: "not a url" })).toThrow(/APP_URL/);
    expect(() => loadConfig({ FEATURE_RECORDING: "yes" })).toThrow(/FEATURE_RECORDING/);
  });

  it("returns a frozen object", () => {
    expect(Object.isFrozen(loadConfig({}))).toBe(true);
  });
});

describe("feature flags", () => {
  it("are all off by default", () => {
    const config = loadConfig({});
    for (const flag of FEATURE_FLAGS) expect(isEnabled(flag, config)).toBe(false);
  });

  it("switch on only with an explicit true or 1", () => {
    const config = loadConfig({
      FEATURE_AI_TRIAGE: "true",
      FEATURE_RECORDING: "1",
      FEATURE_REFERRALS: "false",
      S3_BUCKET_RECORDINGS: "recordings",
      RECORDING_RETENTION_DAYS: "90",
      S3_REGION: "ap-south-1",
    });
    expect(isEnabled("ai_triage", config)).toBe(true);
    expect(isEnabled("recording", config)).toBe(true);
    expect(isEnabled("referrals", config)).toBe(false);
  });

  it("recording stays closed without a recordings bucket in Mumbai and a retention period", () => {
    expect(() => loadConfig({ FEATURE_RECORDING: "1" })).toThrow(/S3_BUCKET_RECORDINGS/);
    expect(() => loadConfig({ FEATURE_RECORDING: "1" })).toThrow(/RECORDING_RETENTION_DAYS/);
    const ok = {
      FEATURE_RECORDING: "1",
      S3_BUCKET_RECORDINGS: "recordings",
      RECORDING_RETENTION_DAYS: "90",
      S3_REGION: "ap-south-1",
    };
    expect(() => loadConfig({ ...ok, S3_REGION: "us-east-1" })).toThrow(/ap-south-1/);
    expect(() => loadConfig({ ...ok, RECORDING_RETENTION_DAYS: "0" })).toThrow(
      /RECORDING_RETENTION_DAYS/,
    );
    expect(isEnabled("recording", loadConfig(ok))).toBe(true);
    // Off by default: the two settings alone change nothing.
    expect(isEnabled("recording", loadConfig({ S3_BUCKET_RECORDINGS: "recordings" }))).toBe(false);
  });
});

describe("email and SMS settings", () => {
  it("SMTP needs a from address, and a user and password go together", () => {
    expect(() => loadConfig({ SMTP_HOST: "smtp.test" })).toThrow(/EMAIL_FROM/);
    expect(
      loadConfig({ SMTP_HOST: "localhost", SMTP_PORT: "1025", EMAIL_FROM: "a@b.cd" }).SMTP_PORT,
    ).toBe(1025);
    expect(() => loadConfig({ SMTP_USER: "u" })).toThrow(/together/);
    expect(() => loadConfig({ SMTP_PASSWORD: "p" })).toThrow(/together/);
    expect(() => loadConfig({ SMTP_PORT: "70000" })).toThrow(/SMTP_PORT/);
    expect(loadConfig({ SMTP_SECURE: "true" }).SMTP_SECURE).toBe(true);
    expect(loadConfig({}).SMTP_SECURE).toBeUndefined();
  });
});
