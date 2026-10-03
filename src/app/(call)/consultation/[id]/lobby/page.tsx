import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CallFlow } from "@/components/call/call-flow";
import { getAppointment } from "@/lib/data/appointments";

export const metadata: Metadata = { title: "Consultation", robots: { index: false } };

// Only the patient who owns the booking may open this. The Phase F page trusts the URL; P6 checks the session,
// the booking, payment and time window on the server before issuing a call token.
export default async function ConsultationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const appt = getAppointment((await params).id);
  if (!appt) notFound();
  const state = (await searchParams).state;
  return <CallFlow appt={appt} weakNetwork={state === "lowbw"} />;
}
