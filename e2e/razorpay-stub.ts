import http from "node:http";
import { createHmac } from "node:crypto";

// A stand-in for Razorpay's REST API, run next to the app during e2e tests (not a mock of our code:
// the app's real adapter talks to it over HTTP). Tests steer it through /__ endpoints.

export const STUB_PORT = 3199;
export const STUB = {
  keyId: "rzp_test_e2e_stub",
  keySecret: "e2e-key-secret-for-the-stub",
  webhookSecret: "e2e-webhook-secret-for-the-stub",
  baseUrl: `http://127.0.0.1:${STUB_PORT}`,
};

type Order = { amount: number; receipt: string };
// Ids must not repeat across runs: earlier runs leave their rows in the dev database.
const RUN = Date.now().toString(36);
type Pay = { order_id: string; amount: number; status: string; refunded: number };
const orders = new Map<string, Order>();
const payments = new Map<string, Pay>();
const refunds: { paymentId: string; amount: number }[] = [];
let counter = 0;

const send = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

export function startStub(): Promise<() => Promise<void>> {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = req.url ?? "";
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      // Control endpoints for the tests.
      if (url === "/__capture") {
        const paymentId = `pay_e2e${RUN}${String(++counter).padStart(8, "0")}`;
        const order = orders.get(String(body.orderId));
        if (!order) return send(res, 404, { error: "unknown order" });
        const amount = typeof body.amount === "number" ? body.amount : order.amount;
        payments.set(paymentId, {
          order_id: String(body.orderId),
          amount,
          status: String(body.status ?? "captured"),
          refunded: 0,
        });
        const signature = createHmac("sha256", STUB.keySecret)
          .update(`${body.orderId}|${paymentId}`)
          .digest("hex");
        return send(res, 200, { paymentId, signature });
      }
      if (url === "/__state") return send(res, 200, { orders: [...orders.entries()], refunds });
      if (url === "/__reset") {
        orders.clear();
        payments.clear();
        refunds.length = 0;
        return send(res, 200, {});
      }
      // Razorpay's own endpoints.
      const expected = `Basic ${Buffer.from(`${STUB.keyId}:${STUB.keySecret}`).toString("base64")}`;
      if (req.headers.authorization !== expected)
        return send(res, 401, { error: { description: "Authentication failed" } });
      if (req.method === "POST" && url === "/v1/orders") {
        const id = `order_E2E${RUN}${String(++counter).padStart(8, "0")}`;
        orders.set(id, { amount: Number(body.amount), receipt: String(body.receipt) });
        return send(res, 200, { id, amount: body.amount, currency: "INR", status: "created" });
      }
      const pay = /^\/v1\/payments\/([A-Za-z0-9_]+)(\/refund)?$/.exec(url);
      if (pay) {
        const p = payments.get(pay[1] as string);
        if (!p) return send(res, 400, { error: { description: "The id provided does not exist" } });
        if (req.method === "GET")
          return send(res, 200, {
            id: pay[1],
            status: p.status,
            amount: p.amount,
            order_id: p.order_id,
          });
        if (req.method === "POST" && pay[2]) {
          const amount = Number(body.amount);
          if (amount + p.refunded > p.amount)
            return send(res, 400, { error: { description: "refund greater than amount" } });
          p.refunded += amount;
          refunds.push({ paymentId: String(pay[1]), amount });
          return send(res, 200, {
            id: `rfnd_E2E${RUN}${String(++counter).padStart(8, "0")}`,
            amount,
          });
        }
      }
      send(res, 404, { error: { description: "not found" } });
    });
  });
  return new Promise((resolve) =>
    server.listen(STUB_PORT, "127.0.0.1", () =>
      resolve(() => new Promise<void>((r) => server.close(() => r()))),
    ),
  );
}
