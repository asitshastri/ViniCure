// Third-party adapter interfaces (backend-architecture.md section 9).
// Services depend on these interfaces only. Each has a fake (tests and local
// development) and, later, a real implementation that passes the same contract
// suite in contract.ts.
//
// Rules for every implementation:
// - Timeouts on every outbound call; retries only where the call is idempotent.
// - Never log request bodies, phone numbers, tokens or message variables.
// - Failures surface as AdapterError, never as a raw provider error.

export type AdapterErrorKind = "invalid_input" | "rejected" | "unavailable";

export class AdapterError extends Error {
  constructor(
    readonly kind: AdapterErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AdapterError";
  }
}

export interface VideoProvider {
  createRoom(): Promise<{ roomRef: string }>;
  issueToken(input: {
    roomRef: string;
    uid: number;
    role: "host" | "audience";
    ttlSeconds: number;
  }): Promise<{ token: string; expiresAt: Date }>;
  /**
   * Starts recording the room into our own private bucket, as the one object `objectKey`. The
   * provider writes to the bucket and key we name; it never chooses where the file goes. Optional:
   * a provider that cannot record is simply not offered recording (P6-08).
   */
  startRecording?(
    roomRef: string,
    target: { bucket: string; objectKey: string },
  ): Promise<{ recordingRef: string }>;
  stopRecording?(recordingRef: string): Promise<void>;
}

export interface PaymentProvider {
  createOrder(input: {
    amountPaise: number;
    currency: "INR";
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<{ orderId: string }>;
  verifyCheckoutSignature(input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean;
  verifyWebhook(input: { rawBody: string; signature: string }): boolean;
  fetchPayment(
    paymentId: string,
  ): Promise<{ status: string; amountPaise: number; orderId: string }>;
  refund(input: {
    paymentId: string;
    amountPaise: number;
    reason: string;
  }): Promise<{ refundId: string }>;
}

export interface SmsProvider {
  sendTemplate(input: {
    to: string;
    templateKey: string;
    variables: Record<string, string>;
  }): Promise<{ providerId: string }>;
}

export interface WhatsAppProvider {
  sendTemplate(input: {
    to: string;
    templateName: string;
    language: string;
    variables: Record<string, string>;
  }): Promise<{ providerId: string }>;
}

export interface EmailProvider {
  send(input: {
    to: string;
    templateKey: string;
    variables: Record<string, string>;
  }): Promise<{ providerId: string }>;
}

/** Bot check (hCaptcha). `success` is false for a bad, expired or reused token. */
export interface CaptchaVerifier {
  verify(input: { token: string; ip?: string }): Promise<{ success: boolean }>;
}

export interface FileScanner {
  scan(input: { storageKey: string }): Promise<{ status: "clean" | "infected" | "error" }>;
}

export interface AiProvider {
  triage(input: {
    redactedText: string;
    locale: string;
  }): Promise<{ suggestedSpecialties: string[]; disclaimer: string }>;
}

/** E.164 with a country code, 8 to 15 digits. Country allow-listing is a config rule applied by callers. */
export const E164 = /^\+[1-9]\d{7,14}$/;
