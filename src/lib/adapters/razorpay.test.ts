import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paymentContract } from "./contract";
import { RazorpayProvider } from "./razorpay";
import { hmacSha256Hex } from "./signature";
import { AdapterError } from "./types";

// The real adapter against a stand-in for Razorpay's REST API (same paths, basic auth, JSON and
// error shapes), so every line of the adapter runs without a network or account. The live check
// against Razorpay's sandbox needs test keys and is listed in TODO.md.

const KEY_ID = "rzp_test_standin";
const KEY_SECRET = "standin-key-secret-value";
const WEBHOOK_SECRET = "standin-webhook-secret-value";

type Order = { amount: number; receipt: string };
type Pay = { order_id: string; amount: number; status: string; refunded: number };
const orders = new Map<string, Order>();
const payments = new Map<string, Pay>();
const seen: { method: string; url: string; auth: string | undefined; body: string }[] = [];
let mode: "normal" | "unauthorised" | "down" | "slow" | "redirect" | "garbage" = "normal";
let server: http.Server;
let baseUrl = "";
let n = 0;

function reply(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seen.push({
        method: req.method ?? "",
        url: req.url ?? "",
        auth: req.headers.authorization,
        body: raw,
      });
      if (mode === "unauthorised")
        return reply(res, 401, { error: { description: "Authentication failed" } });
      if (mode === "down") return reply(res, 503, {});
      if (mode === "slow") return void setTimeout(() => reply(res, 200, {}), 1500);
      if (mode === "redirect") {
        res.writeHead(302, { location: "http://127.0.0.1:1/elsewhere" });
        return res.end();
      }
      if (mode === "garbage") {
        res.writeHead(200);
        return res.end("<html>not json</html>");
      }
      const expected = `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64")}`;
      if (req.headers.authorization !== expected)
        return reply(res, 401, { error: { description: "bad key" } });
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const url = req.url ?? "";
      if (req.method === "POST" && url === "/v1/orders") {
        if (typeof body.amount !== "number" || body.amount < 100) {
          return reply(res, 400, {
            error: { description: "Order amount less than minimum amount allowed" },
          });
        }
        const id = `order_${++n}A${"x".repeat(8)}`;
        orders.set(id, { amount: body.amount, receipt: String(body.receipt) });
        return reply(res, 200, { id, amount: body.amount, currency: "INR", status: "created" });
      }
      const pay = /^\/v1\/payments\/([A-Za-z0-9_]+)(\/refund)?$/.exec(url);
      if (pay) {
        const p = payments.get(pay[1] as string);
        if (!p)
          return reply(res, 400, { error: { description: "The id provided does not exist" } });
        if (req.method === "GET")
          return reply(res, 200, {
            id: pay[1],
            status: p.status,
            amount: p.amount,
            order_id: p.order_id,
          });
        if (req.method === "POST" && pay[2]) {
          const amount = Number(body.amount);
          if (amount + p.refunded > p.amount) {
            return reply(res, 400, {
              error: { description: "The refund amount provided is greater than amount captured" },
            });
          }
          p.refunded += amount;
          return reply(res, 200, {
            id: `rfnd_${++n}Z${"y".repeat(6)}`,
            amount,
            payment_id: pay[1],
          });
        }
      }
      reply(res, 404, { error: { description: "not found" } });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(() => server.close());

const make = (over: Partial<ConstructorParameters<typeof RazorpayProvider>[0]> = {}) =>
  new RazorpayProvider({
    keyId: KEY_ID,
    keySecret: KEY_SECRET,
    webhookSecret: WEBHOOK_SECRET,
    baseUrl,
    ...over,
  });

paymentContract(() => {
  mode = "normal";
  return {
    provider: make(),
    signCheckout: (orderId, paymentId) => hmacSha256Hex(KEY_SECRET, `${orderId}|${paymentId}`),
    signWebhook: (body) => hmacSha256Hex(WEBHOOK_SECRET, body),
    capture: (paymentId, orderId) => {
      const order = orders.get(orderId);
      if (!order) throw new Error("unknown order in the stand-in");
      payments.set(paymentId, {
        order_id: orderId,
        amount: order.amount,
        status: "captured",
        refunded: 0,
      });
    },
  };
});

describe("RazorpayProvider specifics", () => {
  it("sends the amount, currency and receipt, signed in with the key, and nothing else of ours", async () => {
    mode = "normal";
    seen.length = 0;
    await make().createOrder({
      amountPaise: 49900,
      currency: "INR",
      receipt: "appt-123",
      notes: { appointment: "a1" },
    });
    const call = seen[0];
    expect(call).toMatchObject({ method: "POST", url: "/v1/orders" });
    expect(call?.auth).toBe(`Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64")}`);
    expect(JSON.parse(call?.body ?? "{}")).toEqual({
      amount: 49900,
      currency: "INR",
      receipt: "appt-123",
      notes: { appointment: "a1" },
    });
  });

  it("refuses a receipt that is too long before calling out", async () => {
    seen.length = 0;
    await expect(
      make().createOrder({ amountPaise: 100, currency: "INR", receipt: "x".repeat(41) }),
    ).rejects.toMatchObject({ kind: "invalid_input" });
    expect(seen).toHaveLength(0);
  });

  it("a refund carries the amount and a short note, never more than asked", async () => {
    mode = "normal";
    const provider = make();
    const { orderId } = await provider.createOrder({
      amountPaise: 1000,
      currency: "INR",
      receipt: "r",
    });
    payments.set("pay_specific1", {
      order_id: orderId,
      amount: 1000,
      status: "captured",
      refunded: 0,
    });
    seen.length = 0;
    await provider.refund({
      paymentId: "pay_specific1",
      amountPaise: 400,
      reason: "doctor cancelled",
    });
    expect(JSON.parse(seen[0]?.body ?? "{}")).toEqual({
      amount: 400,
      speed: "normal",
      notes: { reason: "doctor cancelled" },
    });
  });

  it("Razorpay's refusal is 'rejected' with its own words; an unknown id never reaches the network", async () => {
    mode = "normal";
    const provider = make();
    const error = (await provider
      .fetchPayment("pay_nothere")
      .catch((e: unknown) => e)) as AdapterError;
    expect(error).toBeInstanceOf(AdapterError);
    expect(error).toMatchObject({ kind: "rejected" });
    expect(String(error.message)).toContain("does not exist");
    seen.length = 0;
    for (const bad of ["../orders", "pay_1/refund", "order_1", "pay_a b", ""]) {
      await expect(provider.fetchPayment(bad), bad).rejects.toMatchObject({ kind: "rejected" });
    }
    expect(seen).toHaveLength(0);
  });

  it("failed login, outage, rate limit, slow answer, redirect and garbage are all 'unavailable', never 'rejected'", async () => {
    const attempt = async (m: typeof mode, opts = {}) => {
      mode = m;
      const error = await make(opts)
        .createOrder({ amountPaise: 1000, currency: "INR", receipt: "r" })
        .catch((e) => e);
      mode = "normal";
      return error;
    };
    for (const m of ["unauthorised", "down", "redirect", "garbage"] as const) {
      expect(await attempt(m), m).toMatchObject({ name: "AdapterError", kind: "unavailable" });
    }
    expect(await attempt("slow", { timeoutMs: 200 })).toMatchObject({ kind: "unavailable" });
    // Nothing listening at all.
    const dead = await make({ baseUrl: "http://127.0.0.1:1/v1" })
      .createOrder({ amountPaise: 1000, currency: "INR", receipt: "r" })
      .catch((e) => e);
    expect(dead).toMatchObject({ kind: "unavailable" });
  });

  it("no error text carries the key, the secret or the request body", async () => {
    for (const m of ["unauthorised", "down", "garbage"] as const) {
      mode = m;
      const error = (await make()
        .createOrder({ amountPaise: 123456, currency: "INR", receipt: "secret-receipt" })
        .catch((e: unknown) => e)) as Error;
      const text = `${error.message} ${JSON.stringify(error)} ${String((error as { cause?: unknown }).cause ?? "")}`;
      for (const secret of [KEY_ID, KEY_SECRET, WEBHOOK_SECRET, "secret-receipt", "123456"]) {
        expect(text, `${m} leaks ${secret}`).not.toContain(secret);
      }
    }
    mode = "normal";
  });

  it("needs all three secrets to start", () => {
    for (const bad of [{ keyId: "" }, { keySecret: "" }, { webhookSecret: "" }]) {
      expect(() => make(bad)).toThrow(/needs a key id/);
    }
  });

  it("signatures: the checkout one uses the key secret and the webhook one the webhook secret, never each other's", () => {
    const provider = make();
    const checkout = hmacSha256Hex(KEY_SECRET, "order_1|pay_1");
    expect(
      provider.verifyCheckoutSignature({
        orderId: "order_1",
        paymentId: "pay_1",
        signature: checkout,
      }),
    ).toBe(true);
    expect(provider.verifyWebhook({ rawBody: "order_1|pay_1", signature: checkout })).toBe(false);
    const hook = hmacSha256Hex(WEBHOOK_SECRET, "{}");
    expect(provider.verifyWebhook({ rawBody: "{}", signature: hook })).toBe(true);
    expect(
      provider.verifyCheckoutSignature({ orderId: "{}", paymentId: "", signature: hook }),
    ).toBe(false);
    expect(provider.verifyWebhook({ rawBody: "{}", signature: "" })).toBe(false);
    // A re-serialised body (different spacing) no longer matches: the raw bytes are what is signed.
    expect(provider.verifyWebhook({ rawBody: "{ }", signature: hook })).toBe(false);
  });
});
