import { describe, expect, it } from "vitest";
import {
  aiContract,
  emailContract,
  paymentContract,
  scannerContract,
  smsContract,
  videoContract,
  whatsAppContract,
} from "./contract";
import {
  FakeAiProvider,
  FakeEmailProvider,
  FakeFileScanner,
  FakePaymentProvider,
  FakeSmsProvider,
  FakeVideoProvider,
  FakeWhatsAppProvider,
} from "./fakes";
import { AdapterError } from "./types";

videoContract(() => new FakeVideoProvider());
paymentContract(() => {
  const fake = new FakePaymentProvider();
  return {
    provider: fake,
    signCheckout: (o, p) => fake.signCheckout(o, p),
    signWebhook: (b) => fake.signWebhook(b),
    capture: (p, o) => fake.capture(p, o),
  };
});
smsContract(() => new FakeSmsProvider());
whatsAppContract(() => new FakeWhatsAppProvider());
emailContract(() => new FakeEmailProvider());
scannerContract(() => {
  const scanner = new FakeFileScanner();
  return { scanner, markInfected: (key) => void scanner.infected.add(key) };
});
aiContract(() => new FakeAiProvider());

describe("fake failure switch", () => {
  it("fails the next call as an outage, then recovers", async () => {
    const sms = new FakeSmsProvider();
    sms.failures.failNext(2);
    const send = () => sms.sendTemplate({ to: "+919812345678", templateKey: "otp", variables: {} });
    await expect(send()).rejects.toMatchObject({ kind: "unavailable" });
    await expect(send()).rejects.toBeInstanceOf(AdapterError);
    await expect(send()).resolves.toHaveProperty("providerId");
  });

  it("reports a scanner error distinctly from clean", async () => {
    const scanner = new FakeFileScanner();
    scanner.broken.add("files/x");
    expect(await scanner.scan({ storageKey: "files/x" })).toEqual({ status: "error" });
  });
});
