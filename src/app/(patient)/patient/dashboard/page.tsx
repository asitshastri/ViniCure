import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowsClockwise,
  CalendarPlus,
  FolderOpen,
  Prescription,
  UsersThree,
  CalendarBlank,
} from "@phosphor-icons/react/ssr";
import { PrototypeHint } from "@/components/auth/notice";
import { MiniList } from "@/components/appointments/mini-list";
import { NextConsultCard } from "@/components/appointments/next-consult-card";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getAppointments, type AppointmentScenario } from "@/lib/data/appointments";
import { formatSlotDay } from "@/lib/data/doctors";
import { formatRupees } from "@/lib/format";
import { getSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Dashboard" };

const actions = [
  { href: "/doctors", label: "Book a consultation", icon: CalendarPlus },
  { href: "/patient/records", label: "Add a record", icon: FolderOpen },
  { href: "/patient/records?type=prescriptions", label: "My prescriptions", icon: Prescription },
  { href: "/patient/profile", label: "Family and profile", icon: UsersThree },
];

export default async function PatientDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  const scenario: AppointmentScenario =
    state === "empty" ? "empty" : state === "joinable" ? "joinable" : "default";
  const { all, nextUp } = getAppointments(scenario);
  const firstName = getSession("patient").user.name.split(" ")[0];

  const upcoming = all.filter((a) => a.status === "upcoming" && a.id !== nextUp?.id).slice(0, 3);
  const recent = all.filter((a) => a.status === "completed").slice(0, 2);
  const followUps = all.filter((a) => a.status === "completed" && a.followUpUntil);

  return (
    <>
      <PageHeader title={`Hello, ${firstName}`} description="Your care at a glance." />
      <div className="grid gap-8">
        {nextUp ? (
          <NextConsultCard appt={nextUp} />
        ) : (
          <EmptyState
            as="h2"
            icon={<CalendarBlank />}
            title="No consultation booked"
            description="When you book a doctor, your next appointment appears here with a join button."
            action={<ButtonLink href="/doctors">Find a doctor</ButtonLink>}
          />
        )}

        <section aria-labelledby="actions-h">
          <h2 id="actions-h" className="sr-only">
            Quick actions
          </h2>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {actions.map(({ href, label, icon: Icon }) => (
              <li key={label}>
                <Link
                  href={href}
                  className="border-line bg-surface hover:border-primary hover:bg-primary-tint flex min-h-24 flex-col justify-center gap-2 rounded-xl border p-4 transition-colors"
                >
                  <Icon aria-hidden className="text-primary size-7" />
                  <span className="font-semibold">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {followUps.length ? (
          <section aria-labelledby="fu-h">
            <h2 id="fu-h" className="mb-3 text-xl font-semibold">
              Follow-ups you can book
            </h2>
            <ul className="grid gap-3">
              {followUps.map((a) => (
                <li
                  key={a.id}
                  className="bg-success-soft flex flex-wrap items-center justify-between gap-3 rounded-xl p-4"
                >
                  <p>
                    <span className="font-semibold">{a.doctorName}</span> offers a follow-up for{" "}
                    <span className="font-semibold tabular-nums">
                      {formatRupees(a.followUpFeePaise ?? 0)}
                    </span>{" "}
                    until {formatSlotDay(a.followUpUntil ?? a.date)}.
                  </p>
                  <ButtonLink
                    href={`/book/${a.doctorId}?type=followup`}
                    variant="secondary"
                    size="sm"
                  >
                    <ArrowsClockwise aria-hidden className="size-4" />
                    Book follow-up
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="up-h">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="up-h" className="text-xl font-semibold">
                Also coming up
              </h2>
              <Link
                href="/patient/appointments"
                className="text-primary min-h-11 content-center font-semibold underline"
              >
                See all
              </Link>
            </div>
            {upcoming.length ? (
              <MiniList items={upcoming} label="Upcoming appointments" />
            ) : (
              <p className="text-ink-muted border-line-strong rounded-xl border border-dashed p-5">
                Nothing else is booked.
              </p>
            )}
          </section>
          <section aria-labelledby="rec-h">
            <h2 id="rec-h" className="mb-3 text-xl font-semibold">
              Recent visits
            </h2>
            {recent.length ? (
              <MiniList items={recent} label="Recent appointments" />
            ) : (
              <p className="text-ink-muted border-line-strong rounded-xl border border-dashed p-5">
                Your finished consultations and prescriptions appear here.
              </p>
            )}
          </section>
        </div>

        <PrototypeHint>
          <p>
            See the other states:{" "}
            <Link className="underline" href="/patient/dashboard?state=joinable">
              join open
            </Link>
            ,{" "}
            <Link className="underline" href="/patient/dashboard?state=empty">
              nothing booked
            </Link>
            ,{" "}
            <Link className="underline" href="/patient/dashboard">
              normal
            </Link>
            .
          </p>
        </PrototypeHint>
      </div>
    </>
  );
}
