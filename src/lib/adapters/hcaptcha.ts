import { AdapterError, type CaptchaVerifier } from "./types";

// hCaptcha server-side check (https://docs.hcaptcha.com/#verify-the-user-response-server-side).
//
// Failure behavior (CLAUDE.md "every third-party failure has a defined behavior"):
//   - hCaptcha says the token is bad, expired or reused -> { success: false }.
//   - hCaptcha is unreachable, slow (3 seconds) or answers with an error -> AdapterError
//     "unavailable". The caller fails closed: no SMS is sent while the bot check is down.
// No retries: a token can be checked only once. The token, secret and address are never logged.

const VERIFY_URL = "https://api.hcaptcha.com/siteverify";
const TIMEOUT_MS = 3000;

export type HCaptchaOptions = {
  secret: string;
  siteKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export class HCaptchaVerifier implements CaptchaVerifier {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HCaptchaOptions) {
    if (!options.secret) throw new Error("hCaptcha secret is required");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async verify(input: { token: string; ip?: string }): Promise<{ success: boolean }> {
    if (typeof input.token !== "string" || input.token.length === 0 || input.token.length > 4096) {
      throw new AdapterError("invalid_input", "token is required");
    }
    const form = new URLSearchParams({ secret: this.options.secret, response: input.token });
    if (this.options.siteKey) form.set("sitekey", this.options.siteKey);
    if (input.ip && input.ip !== "unknown") form.set("remoteip", input.ip);

    let response: Response;
    try {
      response = await this.fetchImpl(VERIFY_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form,
        signal: AbortSignal.timeout(this.options.timeoutMs ?? TIMEOUT_MS),
      });
    } catch (cause) {
      throw new AdapterError("unavailable", "hCaptcha could not be reached", { cause });
    }
    if (!response.ok) throw new AdapterError("unavailable", `hCaptcha answered ${response.status}`);

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new AdapterError("unavailable", "hCaptcha sent an unreadable answer", { cause });
    }
    return {
      success:
        typeof body === "object" &&
        body !== null &&
        (body as { success?: unknown }).success === true,
    };
  }
}
