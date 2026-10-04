import { getConfig } from "../config/config";
import { globalSingleton } from "../singleton";
import { getStorage } from "../storage";
import { ClamAvScanner } from "./clamav";
import { AgoraProvider } from "./agora";
import {
  FakeEmailProvider,
  FakeFileScanner,
  FakePaymentProvider,
  FakeSmsProvider,
  FakeVideoProvider,
} from "./fakes";
import { RazorpayProvider } from "./razorpay";
import { protect } from "./resilience";
import type {
  EmailProvider,
  FileScanner,
  PaymentProvider,
  SmsProvider,
  VideoProvider,
} from "./types";

// Picks the adapter implementation for this process. Only fakes exist for SMS and email until the real providers
// are built (MSG91 and SES in P8); the scanner is real ClamAV when CLAMAV_HOST is set. A fake is never used in production: the process refuses to send.

const holder = globalSingleton("adapters", () => ({
  sms: undefined as SmsProvider | undefined,
  email: undefined as EmailProvider | undefined,
  scanner: undefined as FileScanner | undefined,
  payments: undefined as PaymentProvider | undefined,
  video: undefined as VideoProvider | undefined,
}));

function refuseFakeInProduction(what: string): void {
  if (getConfig().NODE_ENV === "production") {
    throw new Error(`No real ${what} provider is configured (arrives in P8 or is not set up)`);
  }
}

export function getSmsProvider(): SmsProvider {
  if (holder.sms) return holder.sms;
  refuseFakeInProduction("SMS");
  holder.sms = new FakeSmsProvider();
  return holder.sms;
}

export function getEmailProvider(): EmailProvider {
  if (holder.email) return holder.email;
  refuseFakeInProduction("email");
  holder.email = new FakeEmailProvider();
  return holder.email;
}

/** ClamAV when CLAMAV_HOST is set; a fake only outside production (production refuses to run without a scanner). */
export function getFileScanner(): FileScanner {
  if (holder.scanner) return holder.scanner;
  const config = getConfig();
  if (config.CLAMAV_HOST) {
    holder.scanner = new ClamAvScanner({
      host: config.CLAMAV_HOST,
      port: config.CLAMAV_PORT ?? 3310,
      open: (storageKey) => getStorage().openForScan(storageKey),
    });
    return holder.scanner;
  }
  refuseFakeInProduction("file scanner (set CLAMAV_HOST)");
  holder.scanner = new FakeFileScanner();
  return holder.scanner;
}

/**
 * Razorpay when its keys are set; a fake only outside production. Every call has a timeout and a
 * circuit breaker. Only reads are retried: creating an order and refunding are never repeated by
 * the wrapper (a repeat could charge or refund twice), so the caller decides what to do.
 */
export function getPaymentProvider(): PaymentProvider {
  if (holder.payments) return holder.payments;
  const config = getConfig();
  if (config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET && config.RAZORPAY_WEBHOOK_SECRET) {
    holder.payments = protect(
      new RazorpayProvider({
        keyId: config.RAZORPAY_KEY_ID,
        keySecret: config.RAZORPAY_KEY_SECRET,
        webhookSecret: config.RAZORPAY_WEBHOOK_SECRET,
        ...(config.RAZORPAY_API_BASE ? { baseUrl: config.RAZORPAY_API_BASE } : {}),
      }),
      { provider: "razorpay" },
      {
        createOrder: { timeoutMs: 10_000 },
        fetchPayment: { timeoutMs: 10_000, idempotent: true },
        refund: { timeoutMs: 15_000 },
      },
    );
    return holder.payments;
  }
  refuseFakeInProduction("payment (set the Razorpay keys)");
  holder.payments = new FakePaymentProvider();
  return holder.payments;
}

/** Replaces the providers (tests). Pass undefined to reset. */
export function setSmsProviderForTest(provider: SmsProvider | undefined): void {
  holder.sms = provider;
}
export function setEmailProviderForTest(provider: EmailProvider | undefined): void {
  holder.email = provider;
}
export function setFileScannerForTest(scanner: FileScanner | undefined): void {
  holder.scanner = scanner;
}
export function setPaymentProviderForTest(provider: PaymentProvider | undefined): void {
  holder.payments = provider;
}

/**
 * Agora when its app id and certificate are set; a fake only outside production. Tokens are built
 * on our server, so there is no outside call to protect.
 */
export function getVideoProvider(): VideoProvider {
  if (holder.video) return holder.video;
  const config = getConfig();
  if (config.AGORA_APP_ID && config.AGORA_APP_CERTIFICATE) {
    holder.video = new AgoraProvider({
      appId: config.AGORA_APP_ID,
      appCertificate: config.AGORA_APP_CERTIFICATE,
    });
    return holder.video;
  }
  refuseFakeInProduction("video (set AGORA_APP_ID and AGORA_APP_CERTIFICATE)");
  holder.video = new FakeVideoProvider();
  return holder.video;
}

/** Replaces the video provider (tests). Pass undefined to reset. */
export function setVideoProviderForTest(provider: VideoProvider | undefined): void {
  holder.video = provider;
}
