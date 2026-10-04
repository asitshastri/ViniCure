// Browser calls for paying (P5-04): start an order, then confirm what the checkout widget returned.
// The amount is never sent: the server uses the fee it holds for the appointment.

type Json = Record<string, unknown>;

async function call(path: string, body: unknown, key?: string) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) },
    body: JSON.stringify(body),
  });
  let json: Json = {};
  try {
    json = (await response.json()) as Json;
  } catch {
    // No body or not JSON.
  }
  return { status: response.status, json };
}

export type Order = { paymentId: string; orderId: string; amountPaise: number; keyId: string };

export type StartOutcome =
  | { status: "ok"; order: Order }
  | { status: "held_ended" }
  | { status: "unavailable"; message: string }
  | { status: "signin" }
  | { status: "error"; message: string };

/** One key per click of "Pay", so a double click opens one order and a new attempt gets a new one. */
export async function startPayment(
  appointmentId: string,
  attemptKey: string,
): Promise<StartOutcome> {
  const { status, json } = await call("/api/v1/payments/orders", { appointmentId }, attemptKey);
  if (status === 201) {
    return {
      status: "ok",
      order: {
        paymentId: String(json.paymentId),
        orderId: String(json.orderId),
        amountPaise: Number(json.amountPaise),
        keyId: String(json.keyId),
      },
    };
  }
  if (status === 409) return { status: "held_ended" };
  if (status === 503) {
    return {
      status: "unavailable",
      message: String(
        json.detail ?? "Payments are not available right now. Try again in a moment.",
      ),
    };
  }
  if (status === 401 || status === 403) return { status: "signin" };
  return {
    status: "error",
    message: "We could not start the payment. Nothing was charged. Try again.",
  };
}

export type ConfirmOutcome =
  | { status: "paid" | "refunded" | "pending" | "problem" }
  | { status: "unavailable" }
  | { status: "error" };

export async function confirmPayment(input: {
  paymentId: string;
  gatewayPaymentId: string;
  signature: string;
}): Promise<ConfirmOutcome> {
  const { status, json } = await call("/api/v1/payments/verify", input);
  if (status === 200 && typeof json.status === "string") {
    return { status: json.status as "paid" | "refunded" | "pending" | "problem" };
  }
  if (status === 503) return { status: "unavailable" };
  return { status: "error" };
}
