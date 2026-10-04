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
