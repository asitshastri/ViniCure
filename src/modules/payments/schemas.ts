import { z } from "zod";

// Payments (P5-03). Inputs are strict: the amount is never accepted from the client, it is read
// from the appointment the server holds. Outputs are allow-lists.

export const createOrderBody = z.object({ appointmentId: z.uuid() }).strict();
export type CreateOrderBody = z.infer<typeof createOrderBody>;

/** Orders created for one appointment, so nobody can run up unlimited orders at the gateway. */
export const MAX_ORDERS_PER_APPOINTMENT = 3;

export type OrderView = {
  paymentId: string;
  /** The gateway's order id, for the checkout widget. */
  orderId: string;
  amountPaise: number;
  currency: "INR";
  /** The public key id the checkout widget needs. Never the secret. */
  keyId: string;
  /** The order is for this appointment until the hold ends. */
  holdExpiresAt: string;
};

/** What the checkout widget hands back to the browser after a payment. */
export const verifyBody = z
  .object({
    paymentId: z.uuid(),
    gatewayPaymentId: z.string().regex(/^[A-Za-z0-9_]{4,64}$/),
    signature: z.string().regex(/^[0-9a-f]{64}$/, "Not a valid signature."),
  })
  .strict();
export type VerifyBody = z.infer<typeof verifyBody>;

/** paid: confirmed. refunded: paid but the time was gone, money is on its way back. pending: not captured yet. */
export type VerifyView = {
  status: "paid" | "refunded" | "pending" | "problem";
  appointmentId: string;
};
