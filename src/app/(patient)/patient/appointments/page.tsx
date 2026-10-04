import type { Metadata } from "next";
import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react/ssr";
import { PrototypeHint } from "@/components/auth/notice";
import { AppointmentsView, type TabId } from "@/components/appointments/appointments-view";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getAppointments } from "@/lib/data/appointments";
import { loadRealAppointments } from "@/lib/data/appointments-real";
import { isRealDirectory } from "@/lib/data/directory-real";
import { getDoctor } from "@/lib/data/doctors";
import type { DoctorSlot } from "@/lib/types";

export const metadata: Metadata = { title: "Appointments" };

const TAB_IDS: TabId[] = ["upcoming", "past", "cancelled"];

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; state?: string }>;
}) {
  const { tab: rawTab, state } = await searchParams;
  const tab = TAB_IDS.find((t) => t === rawTab) ?? "upcoming";

  if (state === "error") {
    return (
      <>
        <PageHeader title="Appointments" description="Your upcoming and past consultations." />
        <EmptyState
          as="h2"
          icon={<WarningCircle />}
          title="We could not load your appointments"
          description="Your data is safe. Check your connection and try again."
          action={<ButtonLink href="/patient/appointments">Try again</ButtonLink>}
        />
      </>
    );
  }

  // Real bookings from the database when it is configured; the sample data otherwise.
  const real = isRealDirectory();
  const loaded = real ? await loadRealAppointments() : null;
  const sample = real ? null : getAppointments(state === "empty" ? "empty" : "default");
  const all = loaded?.all ?? sample?.all ?? [];
  const slotsByDoctor: Record<string, DoctorSlot[]> = loaded?.slotsByDoctor ?? {};
  if (!real) {
    for (const a of all) {
      if (a.status === "upcoming" && !slotsByDoctor[a.doctorId]) {
        slotsByDoctor[a.doctorId] = (getDoctor(a.doctorId)?.slots ?? []).slice(0, 40);
      }
    }
  }

  return (
    <>
      <PageHeader
        title="Appointments"
        description="Your upcoming and past consultations."
        actions={<ButtonLink href="/doctors">Book a consultation</ButtonLink>}
      />
      <AppointmentsView initial={all} tab={tab} slotsByDoctor={slotsByDoctor} real={real} />
      {real ? null : (
        <PrototypeHint>
          <p>
            Other states:{" "}
            <Link className="underline" href="/patient/appointments?state=empty">
              nothing booked
            </Link>
            ,{" "}
            <Link className="underline" href="/patient/appointments?state=error">
              load error
            </Link>
            . Pick the last time in the reschedule list to see “time taken”. The first appointment
            starts in 90 minutes, so it shows the late-change rules.
          </p>
        </PrototypeHint>
      )}
    </>
  );
}
