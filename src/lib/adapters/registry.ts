import { getConfig } from "../config/config";
import { globalSingleton } from "../singleton";
import { FakeEmailProvider, FakeSmsProvider } from "./fakes";
import type { EmailProvider, SmsProvider } from "./types";

// Picks the adapter implementation for this process. Only fakes exist until the real providers
// are built (MSG91 and SES in P8). A fake is never used in production: the process refuses to send.

const holder = globalSingleton("adapters", () => ({
  sms: undefined as SmsProvider | undefined,
  email: undefined as EmailProvider | undefined,
}));

function refuseFakeInProduction(what: string): void {
  if (getConfig().NODE_ENV === "production") {
    throw new Error(`No real ${what} provider is configured (arrives in P8)`);
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

/** Replaces the providers (tests). Pass undefined to reset. */
export function setSmsProviderForTest(provider: SmsProvider | undefined): void {
  holder.sms = provider;
}
export function setEmailProviderForTest(provider: EmailProvider | undefined): void {
  holder.email = provider;
}
