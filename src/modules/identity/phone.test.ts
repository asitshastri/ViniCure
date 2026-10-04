import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it, vi } from "vitest";
import { FakeSmsProvider } from "../../lib/adapters/fakes";
import { createAuth } from "./auth";
import {
  isPlaceholderEmail,
  isAllowedPhone,
  normalizePhone,
  createPhonePlugin,
  OTP_MAX_ATTEMPTS,
} from "./phone";

const SECRET = "test-secret-with-at-least-thirty-two-characters!";
const ORIGIN = "https://vinicure.example";
const NUMBER = "+919876543210";

type Row = Record<string, unknown>;

function setup(options: { allowed?: string[] } = {}) {
  const db: Record<string, Row[]> = {
    users: [],
    auth_sessions: [],
    auth_accounts: [],
    auth_verifications: [],
  };
  const sms = new FakeSmsProvider();
  const verified: string[] = [];
  const failures: string[] = [];
  const auth = createAuth({
    database: memoryAdapter(db),
    secret: SECRET,
    baseUrl: ORIGIN,
    trustedOrigins: [ORIGIN],
    production: true,
    rolesOf: async () => ["patient"],
    plugins: [
      createPhonePlugin({
        sms,
        isStaff: async () => false,
        allowedCountryCodes: options.allowed ?? ["+91"],
        onVerified: async (id) => void verified.push(id),
        onSmsFailure: (kind) => void failures.push(kind),
      }),
    ],
  });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    auth.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
        body: JSON.stringify(body),
      }),
    );
  const lastCode = () => {
    const message = sms.sent.at(-1);
    expect(message?.templateKey).toBe("otp");
    return message?.variables.code as string;
  };
  return { db, sms, post, lastCode, verified, failures };
}

describe("normalizePhone", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["98765 43210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["+91 (98765) 43210", "+919876543210"],
  ])("accepts %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each([
    "",
    "12345",
    "5876543210", // Indian mobiles start 6 to 9
    "+14155552671", // not allow-listed
    "+449876543210",
    "+91987654321", // too short
    "+9198765432100", // too long
    "+91abcdefghij",
    "98765\u000043210",
    "+91 9876543210; DROP TABLE users",
    "9".repeat(40),
  ])("rejects %j", (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });

  it("honours a wider allow-list", () => {
    expect(normalizePhone("+14155552671", ["+91", "+1"])).toBe("+14155552671");
    expect(isAllowedPhone("+14155552671", ["+91"])).toBe(false);
  });
});

describe("phone OTP sign-in with the fake SMS provider", () => {
  it("sends a 6 digit code and signs a new patient up on verification", async () => {
    const ctx = setup();
    const send = await ctx.post("/phone-number/send-otp", { phoneNumber: NUMBER });
    expect(send.status).toBe(200);
    expect(ctx.sms.sent).toHaveLength(1);
    expect(ctx.sms.sent[0]?.to).toBe(NUMBER);
    const code = ctx.lastCode();
    expect(code).toMatch(/^\d{6}$/);

    const verify = await ctx.post("/phone-number/verify", { phoneNumber: NUMBER, code });
    expect(verify.status).toBe(200);
    const cookie = verify.headers.getSetCookie().find((c) => c.startsWith("__Host-vc_session="));
    expect(cookie).toMatch(/HttpOnly/i);

    const user = ctx.db.users?.[0];
    expect(user?.phone_number).toBe(NUMBER);
    expect(user?.phone_number_verified).toBe(true);
    // D-020: no real email, a placeholder the application treats as none.
    expect(isPlaceholderEmail(String(user?.email))).toBe(true);
    expect(user?.name).toBe("Patient");
    expect(String(user?.email)).not.toContain("9876543210");
    expect(ctx.verified).toEqual([user?.id]);
  });

  it("signs the same patient in again without creating a second user", async () => {
    const ctx = setup();
    for (let i = 0; i < 2; i++) {
      await ctx.post("/phone-number/send-otp", { phoneNumber: NUMBER });
      const res = await ctx.post("/phone-number/verify", {
        phoneNumber: NUMBER,
        code: ctx.lastCode(),
      });
      expect(res.status).toBe(200);
    }
    expect(ctx.db.users).toHaveLength(1);
    expect(ctx.db.auth_sessions).toHaveLength(2);
  });

  it("rejects a wrong code, and locks the code after the allowed attempts", async () => {
    const ctx = setup();
    await ctx.post("/phone-number/send-otp", { phoneNumber: NUMBER });
    const real = ctx.lastCode();
    const wrong = real === "000000" ? "111111" : "000000";
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      const res = await ctx.post("/phone-number/verify", { phoneNumber: NUMBER, code: wrong });
      expect(res.status).toBe(400);
    }
    // The right code no longer works once the attempts are used up.
    const late = await ctx.post("/phone-number/verify", { phoneNumber: NUMBER, code: real });
    expect(late.status).toBeGreaterThanOrEqual(400);
    expect(ctx.db.users).toHaveLength(0);
  });

  it("a code works once", async () => {
    const ctx = setup();
    await ctx.post("/phone-number/send-otp", { phoneNumber: NUMBER });
    const code = ctx.lastCode();
    expect((await ctx.post("/phone-number/verify", { phoneNumber: NUMBER, code })).status).toBe(
      200,
    );
    const again = await ctx.post("/phone-number/verify", { phoneNumber: NUMBER, code });
    expect(again.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects an expired code", async () => {
    vi.useFakeTimers();
    try {
      const ctx = setup();
      await ctx.post("/phone-number/send-otp", { phoneNumber: NUMBER });
      const code = ctx.lastCode();
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
      const res = await ctx.post("/phone-number/verify", { phoneNumber: NUMBER, code });
      expect(res.status).toBe(400);
      expect(ctx.db.users).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a code for one number does not verify another", async () => {
    const ctx = setup();
    await ctx.post("/phone-number/send-otp", { phoneNumber: NUMBER });
    const code = ctx.lastCode();
    const res = await ctx.post("/phone-number/verify", { phoneNumber: "+919876543211", code });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(ctx.db.users).toHaveLength(0);
  });

  it("refuses numbers that are not E.164 or not allow-listed, before any SMS is sent", async () => {
    const ctx = setup();
    for (const phoneNumber of ["9876543210", "+14155552671", "+91123", "+91987654321;--"]) {
      const res = await ctx.post("/phone-number/send-otp", { phoneNumber });
      expect(res.status, phoneNumber).toBe(400);
    }
    expect(ctx.sms.sent).toHaveLength(0);
  });

  it("closes the password doors of the phone plugin", async () => {
    const ctx = setup();
    for (const path of [
      "/sign-in/phone-number",
      "/phone-number/request-password-reset",
      "/phone-number/reset-password",
    ]) {
      const res = await ctx.post(path, {
        phoneNumber: NUMBER,
        password: "a-long-test-password-123",
        otp: "123456",
        newPassword: "a-long-test-password-123",
      });
      expect(res.status, path).toBe(404);
    }
    expect(ctx.sms.sent).toHaveLength(0);
  });

  it("refuses a foreign Origin", async () => {
    const ctx = setup();
    const res = await ctx.post(
      "/phone-number/send-otp",
      { phoneNumber: NUMBER },
      { origin: "https://evil.example" },
    );
    expect(res.status).toBe(403);
    expect(ctx.sms.sent).toHaveLength(0);
  });
});

describe("OTP never appears in logs or errors", () => {
  it("does not write the code or the number to the console on success or failure", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    try {
      const ctx = setup();
      await ctx.post("/phone-number/send-otp", { phoneNumber: NUMBER });
      const code = ctx.lastCode();
      await ctx.post("/phone-number/verify", { phoneNumber: NUMBER, code: "000000" });
      await ctx.post("/phone-number/verify", { phoneNumber: NUMBER, code });
      const written = spies.flatMap((s) => s.mock.calls.flat().map(String)).join("\n");
      expect(written).not.toContain(code);
      expect(written).not.toContain("9876543210");
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });

  it("an SMS failure returns a generic 503 with no number, code or provider text", async () => {
    const ctx = setup();
    ctx.sms.failures.failNext();
    const res = await ctx.post("/phone-number/send-otp", { phoneNumber: NUMBER });
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toContain("9876543210");
    expect(text).not.toContain("fake");
    expect(ctx.failures).toEqual(["unavailable"]);
  });
});
