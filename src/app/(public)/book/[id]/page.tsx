import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingFlow } from "@/components/booking/booking-flow";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { getDoctor } from "@/lib/data/doctors";
import { getSession } from "@/lib/data/session";

export const metadata: Metadata = {
  title: "Book a consultation | ViniCure",
  robots: { index: false },
};

// The signed-in patient comes from the mock session. P2 replaces it, and booking will require a real session.
export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ slot?: string | string[]; type?: string | string[] }>;
}) {
  const doctor = getDoctor((await params).id);
  if (!doctor) notFound();
  const sp = await searchParams;
  const rawSlot = sp.slot;
  // The follow-up price is offered only from a completed visit. The server checks this in P4.
  const followUp = (Array.isArray(sp.type) ? sp.type[0] : sp.type) === "followup";
  const slotParam = Array.isArray(rawSlot) ? rawSlot[0] : rawSlot;
  // Only a slot that belongs to this doctor is accepted from the URL.
  const initialSlotId = doctor.slots.some((s) => s.id === slotParam) ? slotParam : undefined;
  const selfName = getSession("patient").user.name;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Breadcrumbs
        items={[
          { label: "Find a doctor", href: "/doctors" },
          { label: doctor.name, href: `/doctors/${doctor.id}` },
          { label: "Book" },
        ]}
        className="mb-6"
      />
      <BookingFlow
        doctor={doctor}
        initialSlotId={initialSlotId}
        selfName={selfName}
        followUp={followUp}
      />
    </div>
  );
}
