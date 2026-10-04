import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingFlow } from "@/components/booking/booking-flow";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { getDoctor } from "@/lib/data/doctors";
import { realDoctor, isRealDirectory } from "@/lib/data/directory-real";
import { loadBookingProfiles } from "@/lib/data/booking-profiles";
import { getSession } from "@/lib/data/session";
import type { RealProfile } from "@/components/booking/booking-flow";
import { requireRole } from "@/modules/identity/page-guard-next";

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
  const id = (await params).id;
  const real = isRealDirectory();
  const doctor = real ? await realDoctor(id) : getDoctor(id);
  if (!doctor) notFound();
  // Real bookings need a signed-in patient (the server checks again on every request).
  let profiles: RealProfile[] | undefined;
  let accountName: string | null = null;
  if (real) {
    const who = await requireRole(["patient"]);
    accountName = who.displayName;
    profiles = await loadBookingProfiles();
  }
  const sp = await searchParams;
  const rawSlot = sp.slot;
  // The follow-up price is offered only from a completed visit. The server checks this in P4.
  const followUp = (Array.isArray(sp.type) ? sp.type[0] : sp.type) === "followup";
  const slotParam = Array.isArray(rawSlot) ? rawSlot[0] : rawSlot;
  // Only a slot that belongs to this doctor is accepted from the URL.
  const initialSlotId = doctor.slots.some((s) => s.id === slotParam) ? slotParam : undefined;
  const selfName = accountName ?? getSession("patient").user.name;

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
        {...(profiles ? { real: { profiles } } : {})}
      />
    </div>
  );
}
