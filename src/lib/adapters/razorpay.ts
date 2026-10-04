import { AdapterError, type PaymentProvider } from "./types";
import { hmacSha256Hex, safeEqualHex } from "./signature";

// Razorpay adapter (P5-02): orders, payment lookup, refunds, and the two signature checks. It
// calls Razorpay's REST API directly (no SDK), with a timeout on every call.
//
// Defined behaviour when Razorpay is unreachable or slow:
//   - network error, timeout, 5xx, 429 or a failed login (401): AdapterError "unavailable". The
//     caller keeps the appointment held and shows "try again"; nothing is charged or refunded.
//   - 4xx for a bad request (unknown payment, refund larger than the payment): "rejected".
// Keys never appear in logs or errors. Request bodies are never logged. Money is whole paise.

const BASE_URL = "https://api.razorpay.com/v1";
const DEFAULT_TIMEOUT_MS = 8000;
/** Razorpay allows a receipt of up to 40 characters. */
const MAX_RECEIPT = 40;

export type RazorpayOptions = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** For tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
};

export class RazorpayProvider implements PaymentProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly http: typeof fetch;
  private readonly authorization: string;

  constructor(private readonly options: RazorpayOptions) {
    if (!options.keyId || !options.keySecret || !options.webhookSecret) {
      throw new Error("Razorpay needs a key id, a key secret and a webhook secret");
    }
    this.baseUrl = options.baseUrl ?? BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.http = options.fetch ?? fetch;
    this.authorization = `Basic ${Buffer.from(`${options.keyId}:${options.keySecret}`).toString("base64")}`;
  }

  private async call(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.http(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: this.authorization,
          "content-type": "application/json",
          accept: "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "error",
      });
    } catch (cause) {
      throw new AdapterError("unavailable", "Razorpay could not be reached", { cause });
    }
    let json: Record<string, unknown> = {};
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      // An empty or non-JSON answer is handled by the status below.
    }
    if (response.ok) return json;
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 429 ||
      response.status >= 500
    ) {
      throw new AdapterError("unavailable", `Razorpay answered ${response.status}`);
    }
    // The description is Razorpay's own words about the request; it holds no secrets.
    const description = (json.error as { description?: unknown } | undefined)?.description;
    throw new AdapterError(
      "rejected",
      typeof description === "string"
        ? description.slice(0, 200)
        : `Razorpay refused the request (${response.status})`,
    );
  }

  async createOrder(input: {
    amountPaise: number;
    currency: "INR";
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<{ orderId: string }> {
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new AdapterError("invalid_input", "amountPaise must be a positive integer");
    }
    if (input.currency !== "INR") throw new AdapterError("invalid_input", "currency must be INR");
    const receipt = input.receipt.trim();
    if (!receipt || receipt.length > MAX_RECEIPT) {
      throw new AdapterError("invalid_input", `receipt must be 1 to ${MAX_RECEIPT} characters`);
    }
    const json = await this.call("POST", "/orders", {
      amount: input.amountPaise,
      currency: input.currency,
      receipt,
      ...(input.notes ? { notes: input.notes } : {}),
    });
    if (typeof json.id !== "string" || !json.id) {
      throw new AdapterError("unavailable", "Razorpay answered without an order id");
    }
    return { orderId: json.id };
  }

  /** HMAC-SHA256 of "order_id|payment_id" with the key secret, as Razorpay Checkout returns it. */
  verifyCheckoutSignature(input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean {
    if (!input.orderId || !input.paymentId || !input.signature) return false;
    return safeEqualHex(
      hmacSha256Hex(this.options.keySecret, `${input.orderId}|${input.paymentId}`),
      input.signature,
    );
  }

  /** HMAC-SHA256 of the raw request body with the webhook secret (header X-Razorpay-Signature). */
  verifyWebhook(input: { rawBody: string; signature: string }): boolean {
    if (!input.signature) return false;
    return safeEqualHex(hmacSha256Hex(this.options.webhookSecret, input.rawBody), input.signature);
  }

  async fetchPayment(
    paymentId: string,
  ): Promise<{ status: string; amountPaise: number; orderId: string }> {
    if (!/^pay_[A-Za-z0-9_]{1,40}$/.test(paymentId)) {
      throw new AdapterError("rejected", "unknown payment");
    }
    const json = await this.call("GET", `/payments/${paymentId}`);
    const { status, amount, order_id: orderId } = json;
    if (typeof status !== "string" || typeof amount !== "number" || typeof orderId !== "string") {
      throw new AdapterError("unavailable", "Razorpay answered with an unexpected payment");
    }
    return { status, amountPaise: amount, orderId };
  }

  async refund(input: {
    paymentId: string;
    amountPaise: number;
    reason: string;
  }): Promise<{ refundId: string }> {
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new AdapterError("invalid_input", "amountPaise must be a positive integer");
    }
    if (!input.reason.trim()) throw new AdapterError("invalid_input", "reason is required");
    if (!/^pay_[A-Za-z0-9_]{1,40}$/.test(input.paymentId)) {
      throw new AdapterError("rejected", "unknown payment");
    }
    const json = await this.call("POST", `/payments/${input.paymentId}/refund`, {
      amount: input.amountPaise,
      speed: "normal",
      notes: { reason: input.reason.trim().slice(0, 200) },
    });
    if (typeof json.id !== "string" || !json.id) {
      throw new AdapterError("unavailable", "Razorpay answered without a refund id");
    }
    return { refundId: json.id };
  }
}
