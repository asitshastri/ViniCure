import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  AdapterError,
  E164,
  type AiProvider,
  type EmailProvider,
  type FileScanner,
  type PaymentProvider,
  type SmsProvider,
  type VideoProvider,
  type WhatsAppProvider,
} from "./types";

// Fakes for tests and local development. They keep what they were asked to do
// in memory so tests can look at it, and they can be told to fail so the
// resilience code (P1-21) has something to exercise.

/** Lets a test make the next call fail the way a provider outage would. */
export class FailureSwitch {
  private remaining = 0;
  failNext(times = 1): void {
    this.remaining = times;
  }
  check(): void {
    if (this.remaining > 0) {
      this.remaining -= 1;
      throw new AdapterError("unavailable", "provider unavailable (fake)");
    }
  }
}

function requireText(name: string, value: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AdapterError("invalid_input", `${name} is required`);
  }
}

function requirePhone(to: string): void {
  if (!E164.test(to)) throw new AdapterError("invalid_input", "to must be an E.164 phone number");
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export class FakeVideoProvider implements VideoProvider {
  readonly failures = new FailureSwitch();
  readonly rooms = new Set<string>();
  readonly recordings = new Map<string, { roomRef: string; stopped: boolean }>();

  async createRoom() {
    this.failures.check();
    const roomRef = `room_${randomUUID()}`;
    this.rooms.add(roomRef);
    return { roomRef };
  }

  async issueToken(input: {
    roomRef: string;
    uid: number;
    role: "host" | "audience";
    ttlSeconds: number;
  }) {
    this.failures.check();
    if (!this.rooms.has(input.roomRef)) throw new AdapterError("rejected", "unknown room");
    if (!Number.isInteger(input.uid) || input.uid <= 0) {
      throw new AdapterError("invalid_input", "uid must be a positive integer");
    }
    if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 60 || input.ttlSeconds > 7200) {
      throw new AdapterError("invalid_input", "ttlSeconds must be between 60 and 7200");
    }
    const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
    // One token is for one room, one user and one role. Not a real credential.
    const token = Buffer.from(
      JSON.stringify({ room: input.roomRef, uid: input.uid, role: input.role, exp: expiresAt }),
    ).toString("base64url");
    return { token, expiresAt };
  }

  async startRecording(roomRef: string) {
    this.failures.check();
    if (!this.rooms.has(roomRef)) throw new AdapterError("rejected", "unknown room");
    const recordingRef = `rec_${randomUUID()}`;
    this.recordings.set(recordingRef, { roomRef, stopped: false });
    return { recordingRef };
  }

  async stopRecording(recordingRef: string) {
    this.failures.check();
    const recording = this.recordings.get(recordingRef);
    if (!recording) throw new AdapterError("rejected", "unknown recording");
    recording.stopped = true;
  }
}

type FakePayment = { orderId: string; amountPaise: number; status: string; refundedPaise: number };

export class FakePaymentProvider implements PaymentProvider {
  readonly failures = new FailureSwitch();
  readonly orders = new Map<string, { amountPaise: number; receipt: string }>();
  readonly payments = new Map<string, FakePayment>();
  readonly refunds = new Map<string, { paymentId: string; amountPaise: number; reason: string }>();

  constructor(
    private readonly keySecret = "fake-key-secret",
    private readonly webhookSecret = "fake-webhook-secret",
  ) {}

  /** Test helper: what the checkout widget would return to the browser. */
  signCheckout(orderId: string, paymentId: string): string {
    return createHmac("sha256", this.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  }

  /** Test helper: what the provider would send in the webhook header. */
  signWebhook(rawBody: string): string {
    return createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
  }

  /** Test helper: the customer paid. */
  capture(paymentId: string, orderId: string): void {
    const order = this.orders.get(orderId);
    if (!order) throw new AdapterError("rejected", "unknown order");
    this.payments.set(paymentId, {
      orderId,
      amountPaise: order.amountPaise,
      status: "captured",
      refundedPaise: 0,
    });
  }

  async createOrder(input: {
    amountPaise: number;
    currency: "INR";
    receipt: string;
    notes?: Record<string, string>;
  }) {
    this.failures.check();
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new AdapterError("invalid_input", "amountPaise must be a positive integer");
    }
    if (input.currency !== "INR") throw new AdapterError("invalid_input", "currency must be INR");
    requireText("receipt", input.receipt);
    const orderId = `order_${randomUUID()}`;
    this.orders.set(orderId, { amountPaise: input.amountPaise, receipt: input.receipt });
    return { orderId };
  }

  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }) {
    return safeEqualHex(this.signCheckout(input.orderId, input.paymentId), input.signature);
  }

  verifyWebhook(input: { rawBody: string; signature: string }) {
    return safeEqualHex(this.signWebhook(input.rawBody), input.signature);
  }

  async fetchPayment(paymentId: string) {
    this.failures.check();
    const payment = this.payments.get(paymentId);
    if (!payment) throw new AdapterError("rejected", "unknown payment");
    return {
      status: payment.status,
      amountPaise: payment.amountPaise,
      orderId: payment.orderId,
    };
  }

  async refund(input: { paymentId: string; amountPaise: number; reason: string }) {
    this.failures.check();
    const payment = this.payments.get(input.paymentId);
    if (!payment) throw new AdapterError("rejected", "unknown payment");
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new AdapterError("invalid_input", "amountPaise must be a positive integer");
    }
    requireText("reason", input.reason);
    if (payment.refundedPaise + input.amountPaise > payment.amountPaise) {
      throw new AdapterError("rejected", "refund is larger than the payment");
    }
    payment.refundedPaise += input.amountPaise;
    payment.status =
      payment.refundedPaise === payment.amountPaise ? "refunded" : "partially_refunded";
    const refundId = `rfnd_${randomUUID()}`;
    this.refunds.set(refundId, { ...input });
    return { refundId };
  }
}

export class FakeSmsProvider implements SmsProvider {
  readonly failures = new FailureSwitch();
  readonly sent: { to: string; templateKey: string; variables: Record<string, string> }[] = [];

  async sendTemplate(input: {
    to: string;
    templateKey: string;
    variables: Record<string, string>;
  }) {
    this.failures.check();
    requirePhone(input.to);
    requireText("templateKey", input.templateKey);
    this.sent.push(input);
    return { providerId: `sms_${randomUUID()}` };
  }
}

export class FakeWhatsAppProvider implements WhatsAppProvider {
  readonly failures = new FailureSwitch();
  readonly sent: {
    to: string;
    templateName: string;
    language: string;
    variables: Record<string, string>;
  }[] = [];

  async sendTemplate(input: {
    to: string;
    templateName: string;
    language: string;
    variables: Record<string, string>;
  }) {
    this.failures.check();
    requirePhone(input.to);
    requireText("templateName", input.templateName);
    requireText("language", input.language);
    this.sent.push(input);
    return { providerId: `wa_${randomUUID()}` };
  }
}

export class FakeEmailProvider implements EmailProvider {
  readonly failures = new FailureSwitch();
  readonly sent: { to: string; templateKey: string; variables: Record<string, string> }[] = [];

  async send(input: { to: string; templateKey: string; variables: Record<string, string> }) {
    this.failures.check();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.to)) {
      throw new AdapterError("invalid_input", "to must be an email address");
    }
    requireText("templateKey", input.templateKey);
    this.sent.push(input);
    return { providerId: `mail_${randomUUID()}` };
  }
}

export class FakeFileScanner implements FileScanner {
  readonly failures = new FailureSwitch();
  /** Storage keys that should report as infected. */
  readonly infected = new Set<string>();
  /** Storage keys that should report a scanner error. */
  readonly broken = new Set<string>();

  async scan(input: { storageKey: string }) {
    this.failures.check();
    requireText("storageKey", input.storageKey);
    if (this.broken.has(input.storageKey)) return { status: "error" as const };
    if (this.infected.has(input.storageKey)) return { status: "infected" as const };
    return { status: "clean" as const };
  }
}

export class FakeAiProvider implements AiProvider {
  readonly failures = new FailureSwitch();
  readonly received: string[] = [];

  async triage(input: { redactedText: string; locale: string }) {
    this.failures.check();
    requireText("redactedText", input.redactedText);
    requireText("locale", input.locale);
    this.received.push(input.redactedText);
    return {
      suggestedSpecialties: ["general_physician"],
      disclaimer: "This is a suggestion, not a diagnosis. A doctor will decide.",
    };
  }
}
