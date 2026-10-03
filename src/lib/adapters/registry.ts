import { getConfig } from "../config/config";
import { globalSingleton } from "../singleton";
import { FakeSmsProvider } from "./fakes";
import type { SmsProvider } from "./types";

// Picks the adapter implementation for this process. Only fakes exist until the real providers
// are built (MSG91 in P8). A fake is never used in production: the process refuses to send.

const holder = globalSingleton("adapters", () => ({ sms: undefined as SmsProvider | undefined }));

export function getSmsProvider(): SmsProvider {
  if (holder.sms) return holder.sms;
  if (getConfig().NODE_ENV === "production") {
    throw new Error("No real SMS provider is configured (MSG91 adapter arrives in P8)");
  }
  holder.sms = new FakeSmsProvider();
  return holder.sms;
}

/** Replaces the SMS provider (tests). Pass undefined to reset. */
export function setSmsProviderForTest(provider: SmsProvider | undefined): void {
  holder.sms = provider;
}
