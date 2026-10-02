import type { FamilyMember } from "@/lib/types";

// FAKE DATA for the UI-first phase (D-007).
export const mockFamily: FamilyMember[] = [
  { id: "fm-1", name: "Ramesh Verma", relation: "Father", age: 72 },
  { id: "fm-2", name: "Ira Verma", relation: "Daughter", age: 8 },
];

/** UPI ids that trigger each payment outcome in the prototype. */
export const MOCK_UPI = {
  declined: "fail@upi",
  pending: "pending@upi",
  taken: "taken@upi",
  bankDown: "bank@upi",
} as const;
