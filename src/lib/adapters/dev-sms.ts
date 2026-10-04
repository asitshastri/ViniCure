import { logger } from "../logging/logger";
import type { SmsProvider } from "./types";

// Local development only (see registry.ts): passes the message to the fake provider and also
// writes it to the server terminal, so a person signing in by hand can read the one-time code.
// It is only ever built when APP_ENV is "local" and NODE_ENV is not "production".
export class DevConsoleSms implements SmsProvider {
  constructor(private readonly inner: SmsProvider) {}

  async sendTemplate(input: Parameters<SmsProvider["sendTemplate"]>[0]) {
    const out = await this.inner.sendTemplate(input);
    // The standard redaction hides keys named like secrets, so print as one plain line.
    const code = input.variables.code ? ` code ${input.variables.code}` : "";
    logger.warn(`[dev sms] to ${input.to} ${input.templateKey}${code}`);
    return out;
  }
}
