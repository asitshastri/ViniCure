import { z } from "zod";

// Environment configuration (backend-architecture.md section 17).
// Validated by Zod. In production a missing or unsafe required value stops the
// app from starting. Names only live in .env.example, never values.
//
// Provider groups (video, payments, SMS, WhatsApp, email, scanner, captcha, AI)
// are optional here. The task that adds each provider also makes its variables
// required in production: P6 video, P5 payments, P8 SMS/WhatsApp/email,
// P4-S scanner, P2 captcha, P7 AI.

const strictBool = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const flag = strictBool.default(false);

const csv = z.string().transform((value) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);

const optionalString = z.string().min(1).optional();

const schema = z.object({
  // App
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
  APP_URL: z.url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

  // Database
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_MIGRATION_URL: z.string().min(1).optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  // Cache
  VALKEY_URL: z.string().min(1).optional(),
  VALKEY_TLS: flag,

  // Google sign-in for patients (P2-17). Both are needed together.
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,

  // Auth
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters").optional(),
  AUTH_TRUSTED_ORIGINS: csv.default([]),
  ALLOWED_PHONE_COUNTRY_CODES: csv.default(["+91"]),

  // Crypto
  CRYPTO_PROVIDER: z.enum(["local", "kms"]).default("local"),
  KMS_KEY_ID: optionalString,
  LOCAL_DEV_KEY: optionalString,

  // Storage
  S3_BUCKET_FILES: optionalString,
  S3_BUCKET_EXPORTS: optionalString,
  S3_REGION: optionalString,
  S3_ENDPOINT: z.url().optional(),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),

  // Video
  VIDEO_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(7200).default(3600),
  VIDEO_JOIN_EARLY_MINUTES: z.coerce.number().int().min(0).max(120).default(10),
  VIDEO_JOIN_LATE_MINUTES: z.coerce.number().int().min(0).max(240).default(30),

  // Providers (secrets are optional until their task makes them required)
  AGORA_APP_ID: optionalString,
  AGORA_APP_CERTIFICATE: optionalString,
  RAZORPAY_KEY_ID: optionalString,
  RAZORPAY_KEY_SECRET: optionalString,
  RAZORPAY_WEBHOOK_SECRET: optionalString,
  MSG91_AUTH_KEY: optionalString,
  MSG91_SENDER_ID: optionalString,
  WHATSAPP_TOKEN: optionalString,
  WHATSAPP_PHONE_NUMBER_ID: optionalString,
  SES_REGION: optionalString,
  EMAIL_FROM: optionalString,
  CLAMAV_HOST: optionalString,
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  HCAPTCHA_SITE_KEY: optionalString,
  HCAPTCHA_SECRET: optionalString,
  AI_API_KEY: optionalString,
  AI_MODEL: optionalString,
  AI_DAILY_BUDGET: z.coerce.number().int().min(0).optional(),

  // Feature flags, all off by default
  FEATURE_AI_TRIAGE: flag,
  FEATURE_RECORDING: flag,
  FEATURE_REFERRALS: flag,

  // Monitoring
  SENTRY_DSN: z.url().optional(),
  // Public by design: the browser needs it to report errors.
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  SENTRY_ENVIRONMENT: optionalString,

  // Budgets
  SMS_DAILY_CAP: z.coerce.number().int().min(0).default(2000),
});

export type Config = Readonly<z.output<typeof schema>>;

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    // Names and reasons only. Values are never included.
    super(`Invalid configuration:\n- ${problems.join("\n- ")}`);
    this.name = "ConfigError";
  }
}

const REQUIRED_IN_PRODUCTION = [
  "DATABASE_URL",
  "VALKEY_URL",
  "AUTH_SECRET",
  "S3_BUCKET_FILES",
  "S3_BUCKET_EXPORTS",
  "S3_REGION",
] as const;

function productionProblems(config: z.output<typeof schema>): string[] {
  const problems: string[] = [];
  for (const name of REQUIRED_IN_PRODUCTION) {
    if (!config[name]) problems.push(`${name} is required in production`);
  }
  if (config.APP_ENV === "local")
    problems.push("APP_ENV must be staging or production in production");
  if (!config.APP_URL.startsWith("https://")) problems.push("APP_URL must use https in production");
  if (config.CRYPTO_PROVIDER !== "kms") problems.push("CRYPTO_PROVIDER must be kms in production");
  if (config.CRYPTO_PROVIDER === "kms" && !config.KMS_KEY_ID) {
    problems.push("KMS_KEY_ID is required when CRYPTO_PROVIDER is kms");
  }
  if (config.LOCAL_DEV_KEY) problems.push("LOCAL_DEV_KEY must not be set in production");
  if (config.S3_ENDPOINT)
    problems.push("S3_ENDPOINT (local storage) must not be set in production");
  if (config.LOG_LEVEL === "trace" || config.LOG_LEVEL === "debug") {
    problems.push("LOG_LEVEL must be info or higher in production");
  }
  return problems;
}

/** Parses and checks an environment. Throws ConfigError listing every problem by name. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  // Empty strings count as unset, so a blank line in an env file is not a value.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    );
  }
  const config = parsed.data;
  if (config.NODE_ENV === "production") {
    const problems = productionProblems(config);
    if (problems.length > 0) throw new ConfigError(problems);
  }
  return Object.freeze(config);
}

let cached: Config | undefined;

/** The validated configuration for this process. Read once, on first use. */
export function getConfig(): Config {
  cached ??= loadConfig(process.env);
  return cached;
}

export function resetConfigForTest(): void {
  cached = undefined;
}
