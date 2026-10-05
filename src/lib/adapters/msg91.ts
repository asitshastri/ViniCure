import { AdapterError, type SmsProvider } from "./types";

// MSG91 SMS through its Flow API (ported from ViniCare's `sms.js`), behind SmsProvider.
//
// India requires every SMS to use a template registered on a DLT portal (TRAI). The template is
// made in the MSG91 dashboard, which gives a template id; here a template key such as "otp" is
// mapped to that id. The text is fixed in the dashboard and only the variables travel in the call.
//
// Failure behaviour (CLAUDE.md "every third-party failure has a defined behavior"):
//   - the number is not E.164, or the key has no template -> invalid_input, nothing is sent;
//   - MSG91 is unreachable, slow (8 seconds) or answers 5xx -> unavailable (the caller shows
//     "could not send the code"; the wrapper never repeats a send, because a repeat is a second SMS);
//   - MSG91 refuses (bad key, bad template, no balance, number blocked) -> rejected.
// The phone number, the code and the auth key are never logged and never put in an error message.

const SEND_URL = "https://control.msg91.com/api/v5/flow";
const TIMEOUT_MS = 8000;
const E164 = /^\+[1-9][0-9]{7,14}$/;

/** MSG91 variable names are set in the template; ours differ for the OTP (`code` here, `otp` there). */
const VARIABLE_NAMES: Record<string, Record<string, string>> = { otp: { code: "otp" } };

export type Msg91Config = {
  authKey: string;
  /** Template key (such as "otp") to the template id made in the MSG91 dashboard. */
  templates: Readonly<Record<string, string>>;
  /** Only when the flow in the dashboard does not already fix the sender. */
  senderId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** For tests. */
  url?: string;
};

export class Msg91SmsProvider implements SmsProvider {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: Msg91Config) {
    if (!config.authKey) throw new Error("MSG91 needs an auth key");
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async sendTemplate(input: {
    to: string;
    templateKey: string;
    variables: Record<string, string>;
  }): Promise<{ providerId: string }> {
    if (typeof input.to !== "string" || !E164.test(input.to)) {
      throw new AdapterError("invalid_input", "to must be an E.164 phone number");
    }
    if (typeof input.templateKey !== "string" || input.templateKey.trim() === "") {
      throw new AdapterError("invalid_input", "templateKey is required");
    }
    const templateId = this.config.templates[input.templateKey];
    if (!templateId) throw new AdapterError("invalid_input", "no MSG91 template for this key");

    const names = VARIABLE_NAMES[input.templateKey] ?? {};
    const variables: Record<string, string> = {};
    for (const [name, value] of Object.entries(input.variables)) {
      variables[names[name] ?? name] = String(value);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.config.url ?? SEND_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authkey: this.config.authKey,
        },
        body: JSON.stringify({
          template_id: templateId,
          ...(this.config.senderId ? { sender: this.config.senderId } : {}),
          short_url: "0",
          // MSG91 wants the country code and no plus sign.
          recipients: [{ mobiles: input.to.slice(1), ...variables }],
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? TIMEOUT_MS),
      });
    } catch (cause) {
      throw new AdapterError("unavailable", "MSG91 could not be reached", { cause });
    }

    if (response.status >= 500)
      throw new AdapterError("unavailable", `MSG91 answered ${response.status}`);
    let body: { type?: unknown; message?: unknown } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      // An unreadable answer is treated by its status below.
    }
    if (!response.ok || body.type !== "success") {
      // Safe words only: MSG91's message can name the number.
      throw new AdapterError("rejected", `MSG91 refused the message (${response.status})`);
    }
    // On success `message` is MSG91's request id.
    const providerId = typeof body.message === "string" && body.message ? body.message : "msg91";
    return { providerId };
  }
}
