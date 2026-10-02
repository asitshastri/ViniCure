import type { SupportTopic } from "@/lib/types";

const delay = (ms = 700) => new Promise((resolve) => setTimeout(resolve, ms));

export const SUPPORT_TOPICS: Array<{ id: SupportTopic; label: string }> = [
  { id: "booking", label: "A booking or appointment" },
  { id: "payment", label: "A payment or refund" },
  { id: "technical", label: "Sign-in or video problems" },
  { id: "records", label: "My records or privacy" },
  { id: "doctor", label: "A doctor or prescription" },
  { id: "other", label: "Something else" },
];

export type SupportResult = { status: "sent"; ticket: string } | { status: "error" };

// In P8 this creates a ticket through the API. The server rate-limits and checks the request.
export async function submitSupportRequest(input: { contact: string }): Promise<SupportResult> {
  await delay();
  if (input.contact.toLowerCase().startsWith("error@")) return { status: "error" };
  return { status: "sent", ticket: "SUP-48213" };
}
