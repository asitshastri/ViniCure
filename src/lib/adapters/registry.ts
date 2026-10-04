import { getConfig } from "../config/config";
import { globalSingleton } from "../singleton";
import { getStorage } from "../storage";
import { ClamAvScanner } from "./clamav";
import { FakeEmailProvider, FakeFileScanner, FakeSmsProvider } from "./fakes";
import type { EmailProvider, FileScanner, SmsProvider } from "./types";

// Picks the adapter implementation for this process. Only fakes exist for SMS and email until the real providers
// are built (MSG91 and SES in P8); the scanner is real ClamAV when CLAMAV_HOST is set. A fake is never used in production: the process refuses to send.

const holder = globalSingleton("adapters", () => ({
  sms: undefined as SmsProvider | undefined,
  email: undefined as EmailProvider | undefined,
  scanner: undefined as FileScanner | undefined,
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
