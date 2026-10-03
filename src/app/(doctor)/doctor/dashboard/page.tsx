import type { Metadata } from "next";
import Link from "next/link";
import { ArrowsClockwise, CalendarBlank, Coins, VideoCamera } from "@phosphor-icons/react/ssr";
import { PrototypeHint } from "@/components/auth/notice";
import { AvailabilityCard } from "@/components/doctor/availability-card";
import { ConsultList } from "@/components/doctor/consult-row";
import { NextConsult } from "@/components/doctor/next-consult";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { getDoctorConsults, getEarningLines, getTodayDate } from "@/lib/data/doctor";
import { getSession } from "@/lib/data/session";
import { parseDoctorState } from "@/lib/schemas/doctor";
import { formatRupees } from "@/lib/format";

export const metadata: Metadata = { title: "Doctor dashboard" };

export default async function DoctorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const scenario = parseDoctorState((await searchParams).state);
  const all = getDoctorConsults(scenario);
  const today = getTodayDate();
  const todays = all.filter((c) => c.date === today && c.status !== "cancelled");
  const remaining = todays
    .filter((c) => c.status === "upcoming")
    .sort((a, b) => a.minutesUntil - b.minutesUntil);
  const next = remaining[0];
  const queue = remaining.slice(1);
  const followUps = all.filter((c) => c.kind === "followup" && c.status === "upcoming").length;
  const processing = getEarningLines()
    .filter((l) => l.status === "processing")
    .reduce((s, l) => s + l.netPaise, 0);
  const lastName = getSession("doctor").user.name.replace("Dr. ", "").split(" ").slice(-1)[0];

  return (
    <>
      <PageHeader title={`Hello, Dr. ${lastName}`} description="Your day at a glance." />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:gap-8">
        <div className="grid min-w-0 content-start gap-6">
          <AvailabilityCard key={scenario} initial={scenario !== "away"} until="2:00 pm" />
          <section aria-label="Today in numbers" className="grid grid-cols-2 gap-3">
            <StatTile
              icon={<VideoCamera />}
              label="Today’s consultations"
              value={String(todays.length)}
              note={`${remaining.length} to go`}
            />
            <StatTile
              icon={<ArrowsClockwise />}
              label="Follow-ups waiting"
              value={String(followUps)}
            />
          </section>
          {next ? (
            <NextConsult c={next} />
          ) : (
            <EmptyState
              as="h2"
              icon={<CalendarBlank />}
              title={scenario === "empty" ? "No consultations today" : "All done for today"}
              description={
                scenario === "empty"
                  ? "When patients book you, they appear here."
                  : "Your remaining consultations are finished. Well done."
              }
              action={
                <ButtonLink href="/doctor/calendar" variant="secondary">
                  Check your schedule
                </ButtonLink>
              }
            />
          )}
          <section aria-labelledby="queue-h">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="queue-h" className="text-xl font-semibold">
                Today’s queue
              </h2>
              <span className="text-primary text-sm font-semibold">
                {remaining.length} remaining
              </span>
            </div>
            {queue.length ? (
              <ConsultList items={queue} label="Rest of today’s consultations" />
            ) : (
              <p className="text-ink-muted border-line-strong rounded-xl border border-dashed p-5">
                {next ? "Nobody else is waiting after this one." : "Nothing in the queue."}
              </p>
            )}
          </section>
        </div>

        <aside aria-label="Shortcuts" className="grid content-start gap-4">
          <div className="border-line bg-surface shadow-card rounded-xl border p-5">
            <p className="text-ink-muted flex items-center gap-2 text-sm">
              <Coins aria-hidden className="size-5" /> Earned, not yet paid out
            </p>
            <p className="font-display mt-1 text-3xl font-semibold tabular-nums">
              {formatRupees(processing)}
            </p>
            <Link
              href="/doctor/earnings"
              className="text-primary mt-1 inline-block min-h-11 content-center font-semibold underline"
            >
              See earnings
            </Link>
          </div>
          <ul className="border-line bg-surface divide-line divide-y overflow-hidden rounded-xl border">
            {[
              { href: "/doctor/calendar", label: "Set your hours" },
              { href: "/doctor/patients", label: "Your patients" },
              { href: "/doctor/consultations", label: "All consultations" },
            ].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="hover:bg-primary-tint flex min-h-14 items-center px-4 font-semibold"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      <PrototypeHint>
        <p>
          States:{" "}
          <Link className="underline" href="/doctor/dashboard?state=joinable">
            start button open
          </Link>
          ,{" "}
          <Link className="underline" href="/doctor/dashboard?state=away">
            away
          </Link>
          ,{" "}
          <Link className="underline" href="/doctor/dashboard?state=empty">
            no consultations
          </Link>
          ,{" "}
          <Link className="underline" href="/doctor/dashboard">
            normal
          </Link>
          .
        </p>
      </PrototypeHint>
    </>
  );
}
