import { describe, expect, it } from "vitest";
import {
  AdapterError,
  type AiProvider,
  type CaptchaVerifier,
  type EmailProvider,
  type FileScanner,
  type PaymentProvider,
  type SmsProvider,
  type VideoProvider,
  type WhatsAppProvider,
} from "./types";

// Shared contract suites. The fake and, later, the real implementation of each
// adapter must pass the same tests. A real implementation runs these against the
// provider's sandbox through a factory that returns it plus the helpers listed.

async function rejectsWith(promise: Promise<unknown>, kind: AdapterError["kind"]) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AdapterError);
  expect((error as AdapterError).kind).toBe(kind);
}

export function videoContract(make: () => VideoProvider) {
  describe("VideoProvider contract", () => {
    it("creates distinct rooms", async () => {
      const video = make();
      const a = await video.createRoom();
      const b = await video.createRoom();
      expect(a.roomRef).not.toBe(b.roomRef);
    });

    it("issues a token that expires after the requested time", async () => {
      const video = make();
      const { roomRef } = await video.createRoom();
      const before = Date.now();
      const { token, expiresAt } = await video.issueToken({
        roomRef,
        uid: 1,
        role: "host",
        ttlSeconds: 3600,
      });
      expect(token.length).toBeGreaterThan(10);
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3_599_000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 3_601_000);
    });

    it("issues different tokens to different users", async () => {
      const video = make();
      const { roomRef } = await video.createRoom();
      const a = await video.issueToken({ roomRef, uid: 1, role: "host", ttlSeconds: 600 });
      const b = await video.issueToken({ roomRef, uid: 2, role: "audience", ttlSeconds: 600 });
      expect(a.token).not.toBe(b.token);
    });

    it("refuses an unknown room, a bad uid and a ttl outside 60 to 7200 seconds", async () => {
      const video = make();
      const { roomRef } = await video.createRoom();
      await rejectsWith(
        video.issueToken({ roomRef: "nope", uid: 1, role: "host", ttlSeconds: 600 }),
        "rejected",
      );
      await rejectsWith(
        video.issueToken({ roomRef, uid: 0, role: "host", ttlSeconds: 600 }),
        "invalid_input",
      );
      await rejectsWith(
        video.issueToken({ roomRef, uid: 1, role: "host", ttlSeconds: 59 }),
        "invalid_input",
      );
      await rejectsWith(
        video.issueToken({ roomRef, uid: 1, role: "host", ttlSeconds: 7201 }),
        "invalid_input",
      );
    });

    it("starts and stops a recording only for a known room", async () => {
      const video = make();
      if (!video.startRecording || !video.stopRecording) return;
      const { roomRef } = await video.createRoom();
      const { recordingRef } = await video.startRecording(roomRef);
      await expect(video.stopRecording(recordingRef)).resolves.toBeUndefined();
      await rejectsWith(video.startRecording("nope"), "rejected");
    });
  });
}

export type PaymentTestKit = {
  provider: PaymentProvider;
  /** A valid signature as the checkout widget would produce it. */
  signCheckout(orderId: string, paymentId: string): string;
  /** A valid signature as the provider's webhook would produce it. */
  signWebhook(rawBody: string): string;
  /** Marks an order as paid and returns nothing; sandbox implementations pay with a test card. */
  capture(paymentId: string, orderId: string): void | Promise<void>;
};

export function paymentContract(make: () => PaymentTestKit) {
  describe("PaymentProvider contract", () => {
    it("creates an order for a whole number of paise", async () => {
      const { provider } = make();
      const { orderId } = await provider.createOrder({
        amountPaise: 49900,
        currency: "INR",
        receipt: "appt-1",
      });
      expect(orderId).toBeTruthy();
    });

    it("refuses a zero, negative or fractional amount and a missing receipt", async () => {
      const { provider } = make();
      for (const amountPaise of [0, -5, 10.5]) {
        await rejectsWith(
          provider.createOrder({ amountPaise, currency: "INR", receipt: "r" }),
          "invalid_input",
        );
      }
      await rejectsWith(
        provider.createOrder({ amountPaise: 100, currency: "INR", receipt: " " }),
        "invalid_input",
      );
    });

    it("accepts a correct checkout signature and rejects a tampered one", async () => {
      const kit = make();
      const { orderId } = await kit.provider.createOrder({
        amountPaise: 100,
        currency: "INR",
        receipt: "r",
      });
      const signature = kit.signCheckout(orderId, "pay_1");
      expect(kit.provider.verifyCheckoutSignature({ orderId, paymentId: "pay_1", signature })).toBe(
        true,
      );
      expect(kit.provider.verifyCheckoutSignature({ orderId, paymentId: "pay_2", signature })).toBe(
        false,
      );
      expect(
        kit.provider.verifyCheckoutSignature({ orderId: "order_x", paymentId: "pay_1", signature }),
      ).toBe(false);
      expect(
        kit.provider.verifyCheckoutSignature({ orderId, paymentId: "pay_1", signature: "" }),
      ).toBe(false);
      expect(
        kit.provider.verifyCheckoutSignature({
          orderId,
          paymentId: "pay_1",
          signature: signature + "00",
        }),
      ).toBe(false);
    });

    it("verifies a webhook over the raw body only", async () => {
      const kit = make();
      const body = '{"event":"payment.captured","amount":100}';
      const signature = kit.signWebhook(body);
      expect(kit.provider.verifyWebhook({ rawBody: body, signature })).toBe(true);
      expect(kit.provider.verifyWebhook({ rawBody: body.replace("100", "1"), signature })).toBe(
        false,
      );
      expect(kit.provider.verifyWebhook({ rawBody: body, signature: "bad" })).toBe(false);
    });

    it("reports the amount the provider holds, not the amount a client claims", async () => {
      const kit = make();
      const { orderId } = await kit.provider.createOrder({
        amountPaise: 49900,
        currency: "INR",
        receipt: "r",
      });
      await kit.capture("pay_9", orderId);
      expect(await kit.provider.fetchPayment("pay_9")).toEqual({
        status: "captured",
        amountPaise: 49900,
        orderId,
      });
      await rejectsWith(kit.provider.fetchPayment("pay_missing"), "rejected");
    });

    it("refunds up to the paid amount and no more", async () => {
      const kit = make();
      const { orderId } = await kit.provider.createOrder({
        amountPaise: 1000,
        currency: "INR",
        receipt: "r",
      });
      await kit.capture("pay_r", orderId);
      const first = await kit.provider.refund({
        paymentId: "pay_r",
        amountPaise: 400,
        reason: "cancelled",
      });
      expect(first.refundId).toBeTruthy();
      await rejectsWith(
        kit.provider.refund({ paymentId: "pay_r", amountPaise: 700, reason: "cancelled" }),
        "rejected",
      );
      await rejectsWith(
        kit.provider.refund({ paymentId: "pay_r", amountPaise: 0, reason: "x" }),
        "invalid_input",
      );
      await rejectsWith(
        kit.provider.refund({ paymentId: "pay_r", amountPaise: 100, reason: "" }),
        "invalid_input",
      );
      await expect(
        kit.provider.refund({ paymentId: "pay_r", amountPaise: 600, reason: "cancelled" }),
      ).resolves.toBeTruthy();
    });
  });
}

export function smsContract(make: () => SmsProvider) {
  describe("SmsProvider contract", () => {
    it("sends a template and returns a provider id", async () => {
      const { providerId } = await make().sendTemplate({
        to: "+919812345678",
        templateKey: "otp",
        variables: { code: "1" },
      });
      expect(providerId).toBeTruthy();
    });
    it("refuses a number that is not E.164 and a blank template", async () => {
      const sms = make();
      for (const to of ["9812345678", "+0123", "abc", ""]) {
        await rejectsWith(
          sms.sendTemplate({ to, templateKey: "otp", variables: {} }),
          "invalid_input",
        );
      }
      await rejectsWith(
        sms.sendTemplate({ to: "+919812345678", templateKey: "", variables: {} }),
        "invalid_input",
      );
    });
  });
}

export function whatsAppContract(make: () => WhatsAppProvider) {
  describe("WhatsAppProvider contract", () => {
    it("sends a template and returns a provider id", async () => {
      const { providerId } = await make().sendTemplate({
        to: "+919812345678",
        templateName: "reminder",
        language: "en",
        variables: {},
      });
      expect(providerId).toBeTruthy();
    });
    it("refuses a bad number, template or language", async () => {
      const wa = make();
      const ok = { to: "+919812345678", templateName: "reminder", language: "en", variables: {} };
      await rejectsWith(wa.sendTemplate({ ...ok, to: "98123" }), "invalid_input");
      await rejectsWith(wa.sendTemplate({ ...ok, templateName: "" }), "invalid_input");
      await rejectsWith(wa.sendTemplate({ ...ok, language: "" }), "invalid_input");
    });
  });
}

export function emailContract(make: () => EmailProvider) {
  describe("EmailProvider contract", () => {
    it("sends a template and returns a provider id", async () => {
      const { providerId } = await make().send({
        to: "doc@example.com",
        templateKey: "invite",
        variables: {},
      });
      expect(providerId).toBeTruthy();
    });
    it("refuses a bad address or blank template", async () => {
      const mail = make();
      await rejectsWith(
        mail.send({ to: "not-an-email", templateKey: "invite", variables: {} }),
        "invalid_input",
      );
      await rejectsWith(
        mail.send({ to: "doc@example.com", templateKey: " ", variables: {} }),
        "invalid_input",
      );
    });
  });
}

export type ScannerTestKit = {
  scanner: FileScanner;
  /** Makes the next scan of this key report infected (the sandbox uses the EICAR test file). */
  markInfected(storageKey: string): void | Promise<void>;
};

export function scannerContract(make: () => ScannerTestKit) {
  describe("FileScanner contract", () => {
    it("reports a normal file as clean", async () => {
      expect(await make().scanner.scan({ storageKey: "files/clean" })).toEqual({ status: "clean" });
    });
    it("reports an infected file as infected", async () => {
      const kit = make();
      await kit.markInfected("files/bad");
      expect(await kit.scanner.scan({ storageKey: "files/bad" })).toEqual({ status: "infected" });
    });
    it("refuses an empty key", async () => {
      await rejectsWith(make().scanner.scan({ storageKey: "" }), "invalid_input");
    });
  });
}

export function aiContract(make: () => AiProvider) {
  describe("AiProvider contract", () => {
    it("returns specialties and a disclaimer", async () => {
      const result = await make().triage({ redactedText: "cough for three days", locale: "en" });
      expect(Array.isArray(result.suggestedSpecialties)).toBe(true);
      expect(result.disclaimer.length).toBeGreaterThan(10);
    });
    it("refuses empty text or locale", async () => {
      const ai = make();
      await rejectsWith(ai.triage({ redactedText: "", locale: "en" }), "invalid_input");
      await rejectsWith(ai.triage({ redactedText: "cough", locale: "" }), "invalid_input");
    });
  });
}

export type CaptchaTestKit = {
  captcha: CaptchaVerifier;
  /** A token the provider will accept once. */
  issue: () => string;
};

export function captchaContract(make: () => CaptchaTestKit) {
  describe("CaptchaVerifier contract", () => {
    it("accepts a good token once and then refuses the same token", async () => {
      const { captcha, issue } = make();
      const token = issue();
      expect(await captcha.verify({ token, ip: "203.0.113.5" })).toEqual({ success: true });
      expect(await captcha.verify({ token, ip: "203.0.113.5" })).toEqual({ success: false });
    });
    it("refuses an unknown token", async () => {
      expect(await make().captcha.verify({ token: "not-a-real-token" })).toEqual({
        success: false,
      });
    });
    it("rejects a blank token as invalid input", async () => {
      await rejectsWith(make().captcha.verify({ token: "" }), "invalid_input");
    });
  });
}
