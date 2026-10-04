// Turns a Razorpay webhook body into the few facts we keep (P5-05). The body also carries the
// payer's contact details, VPA, card and bank data; none of that is stored. Everything kept is
// checked against a strict pattern, so nothing odd can reach the database or a log.

export type GatewayEvent = {
  event: string;
  paymentId?: string;
  orderId?: string;
  amountPaise?: number;
  status?: string;
  method?: string;
  errorCode?: string;
  refundId?: string;
  refundStatus?: string;
  /** The payment a refund belongs to. */
  refundPaymentId?: string;
  refundAmountPaise?: number;
};

const ID = /^[A-Za-z0-9_-]{4,64}$/;
const WORD = /^[a-z_]{2,40}$/;
const EVENT = /^[a-z_]{2,40}(\.[a-z_]{2,40}){1,2}$/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const pick = (v: unknown, pattern: RegExp): string | undefined =>
  typeof v === "string" && pattern.test(v) ? v : undefined;

const amount = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100_000_000 ? v : undefined;

/** Parses the raw text and keeps the whitelisted facts. Null when it is not a usable event. */
export function sanitizeWebhook(rawBody: string): GatewayEvent | null {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!isRecord(body)) return null;
  const event = pick(body.event, EVENT);
  if (!event) return null;
  const payload = isRecord(body.payload) ? body.payload : {};
  const entity = (name: string): Record<string, unknown> => {
    const holder = payload[name];
    return isRecord(holder) && isRecord(holder.entity) ? holder.entity : {};
  };
  const payment = entity("payment");
  const order = entity("order");
  const refund = entity("refund");

  const out: GatewayEvent = { event };
  const set = <K extends keyof GatewayEvent>(key: K, value: GatewayEvent[K] | undefined) => {
    if (value !== undefined) out[key] = value;
  };
  set("paymentId", pick(payment.id, ID));
  set("orderId", pick(payment.order_id, ID) ?? pick(order.id, ID));
  set("amountPaise", amount(payment.amount) ?? amount(order.amount_paid));
  set("status", pick(payment.status, WORD) ?? pick(order.status, WORD));
  set("method", pick(payment.method, WORD));
  set("errorCode", pick(payment.error_code, /^[A-Za-z0-9_]{2,60}$/));
  set("refundId", pick(refund.id, ID));
  set("refundStatus", pick(refund.status, WORD));
  set("refundPaymentId", pick(refund.payment_id, ID));
  set("refundAmountPaise", amount(refund.amount));
  return out;
}

/** The event names the processor acts on. Anything else is kept and marked handled. */
export const CAPTURE_EVENTS = new Set(["payment.captured", "order.paid"]);
export const FAILURE_EVENTS = new Set(["payment.failed"]);
export const REFUND_EVENTS = new Set(["refund.processed", "refund.failed", "refund.created"]);
