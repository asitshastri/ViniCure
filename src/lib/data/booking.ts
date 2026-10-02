import { MOCK_UPI, mockFamily } from "@/mocks/booking";
import type { FamilyMember, PaymentMethod, PaymentResult } from "@/lib/types";

// Components call these only. In P4 and P5 they call the booking and payment APIs.
// The server sets the amount; the client never sends one.

const delay = (ms = 600) => new Promise((resolve) => setTimeout(resolve, ms));

export const HOLD_SECONDS = 10 * 60;

export function getFamilyMembers(): FamilyMember[] {
  return mockFamily;
}

export async function holdSlot(slotId: string): Promise<{ holdId: string; expiresAt: number }> {
  await delay(350);
  return { holdId: `hold-${slotId}`, expiresAt: Date.now() + HOLD_SECONDS * 1000 };
}

export async function payForBooking(input: {
  method: PaymentMethod;
  upiId?: string;
}): Promise<PaymentResult> {
  await delay(1200);
  const upi = (input.upiId ?? "").toLowerCase();
  if (upi === MOCK_UPI.declined) return { status: "failed", reason: "declined" };
  if (upi === MOCK_UPI.bankDown) return { status: "failed", reason: "bank_down" };
  if (upi === MOCK_UPI.pending) return { status: "pending" };
  if (upi === MOCK_UPI.taken) return { status: "slot_taken" };
  return { status: "paid", reference: "VC-2026-004217" };
}
