import { afterEach, describe, expect, it, vi } from "vitest";

// Which payment provider the process gets, for different configurations. The configuration is
// replaced with a stand-in so each case is exact, and the module is loaded fresh each time.
afterEach(() => {
  vi.doUnmock("../config/config");
  vi.resetModules();
  (globalThis as Record<symbol, unknown>)[Symbol.for("vinicure.adapters")] = undefined;
});

async function registryWith(config: Record<string, unknown>) {
  vi.resetModules();
  (globalThis as Record<symbol, unknown>)[Symbol.for("vinicure.adapters")] = undefined;
  vi.doMock("../config/config", () => ({ getConfig: () => config }));
  return import("./registry");
}

describe("getPaymentProvider", () => {
  it("is a fake in development and test", async () => {
    const { getPaymentProvider } = await registryWith({ NODE_ENV: "development" });
    expect(getPaymentProvider().constructor.name).toBe("FakePaymentProvider");
  });

  it("refuses to run on a fake in production when the keys are missing", async () => {
    const { getPaymentProvider } = await registryWith({ NODE_ENV: "production" });
    expect(() => getPaymentProvider()).toThrow(/No real payment/);
    const partial = await registryWith({
      NODE_ENV: "production",
      RAZORPAY_KEY_ID: "k",
      RAZORPAY_KEY_SECRET: "s",
    });
    expect(() => partial.getPaymentProvider()).toThrow(/No real payment/);
  });

  it("uses Razorpay, wrapped, when all three keys are set (also in development)", async () => {
    const { getPaymentProvider } = await registryWith({
      NODE_ENV: "development",
      RAZORPAY_KEY_ID: "rzp_test_x",
      RAZORPAY_KEY_SECRET: "secret-one",
      RAZORPAY_WEBHOOK_SECRET: "secret-two",
    });
    const provider = getPaymentProvider();
    // The wrapper is a proxy around the real adapter: signatures work with the configured secrets.
    expect(provider.verifyWebhook({ rawBody: "{}", signature: "bad" })).toBe(false);
    expect(provider.constructor.name).toBe("RazorpayProvider");
  });
});

describe("getVideoProvider", () => {
  it("is a fake in development and test, and refuses to be one in production", async () => {
    const dev = await registryWith({ NODE_ENV: "development" });
    expect(dev.getVideoProvider().constructor.name).toBe("FakeVideoProvider");
    const prod = await registryWith({ NODE_ENV: "production" });
    expect(() => prod.getVideoProvider()).toThrow(/No real video/);
    const partial = await registryWith({
      NODE_ENV: "production",
      AGORA_APP_ID: "0123456789abcdef0123456789abcdef",
    });
    expect(() => partial.getVideoProvider()).toThrow(/No real video/);
  });

  it("uses Agora when the app id and certificate are set", async () => {
    const { getVideoProvider } = await registryWith({
      NODE_ENV: "production",
      AGORA_APP_ID: "0123456789abcdef0123456789abcdef",
      AGORA_APP_CERTIFICATE: "fedcba9876543210fedcba9876543210",
    });
    expect(getVideoProvider().constructor.name).toBe("AgoraProvider");
  });
});

describe("getSmsProvider and getEmailProvider", () => {
  it("use MSG91 and SMTP when they are configured, in development and in production", async () => {
    for (const NODE_ENV of ["development", "production"]) {
      const real = await registryWith({
        NODE_ENV,
        MSG91_AUTH_KEY: "key",
        MSG91_TEMPLATE_OTP: "tpl",
        SMTP_HOST: "smtp.test",
        SMTP_PORT: 465,
        SMTP_SECURE: true,
        SMTP_USER: "u",
        SMTP_PASSWORD: "p",
        EMAIL_FROM: "ViniCure <no-reply@vinicure.example>",
      });
      expect(real.getSmsProvider().constructor.name, NODE_ENV).toBe("Msg91SmsProvider");
      expect(real.getEmailProvider().constructor.name, NODE_ENV).toBe("SmtpEmailProvider");
    }
  });

  it("need the OTP template as well as the key, and the from address as well as the host; production refuses the fakes", async () => {
    const half = await registryWith({
      NODE_ENV: "production",
      MSG91_AUTH_KEY: "key",
      SMTP_HOST: "smtp.test",
    });
    expect(() => half.getSmsProvider()).toThrow(/No real SMS/);
    expect(() => half.getEmailProvider()).toThrow(/No real email/);
    const dev = await registryWith({
      NODE_ENV: "development",
      APP_ENV: "staging",
      MSG91_AUTH_KEY: "key",
    });
    expect(dev.getSmsProvider().constructor.name).toBe("FakeSmsProvider");
  });

  it("show the code in the terminal only on a local computer without MSG91", async () => {
    const local = await registryWith({ NODE_ENV: "development", APP_ENV: "local" });
    expect(local.getSmsProvider().constructor.name).toBe("DevConsoleSms");
    const real = await registryWith({
      NODE_ENV: "development",
      APP_ENV: "local",
      MSG91_AUTH_KEY: "key",
      MSG91_TEMPLATE_OTP: "tpl",
    });
    expect(real.getSmsProvider().constructor.name).toBe("Msg91SmsProvider");
  });
});
