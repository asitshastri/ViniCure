import Link from "next/link";
import { Clock, PhoneCall, VideoCamera, ArrowsClockwise } from "@phosphor-icons/react/ssr";
import { ButtonLink } from "@/components/ui/button";
import { formatRupees } from "@/lib/format";
import type { DoctorProfile } from "@/lib/types";
import { formatSlotDay, formatSlotTime } from "@/mocks/doctors";

const DAYS_SHOWN = 3;
const TIMES_PER_DAY = 6;

export function BookingCard({ doctor: d }: { doctor: DoctorProfile }) {
  const byDay = new Map<string, typeof d.slots>();
  for (const slot of d.slots) byDay.set(slot.date, [...(byDay.get(slot.date) ?? []), slot]);
  const days = [...byDay.entries()].slice(0, DAYS_SHOWN);

  return (
    <section
      aria-labelledby="book-heading"
      className="border-line bg-surface shadow-card rounded-xl border p-5 lg:sticky lg:top-24"
    >
      <h2 id="book-heading" className="text-xl font-semibold">
        Book a consultation
      </h2>

      <dl className="border-line mt-4 grid gap-3 border-b pb-4">
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2">
            <VideoCamera aria-hidden className="text-primary size-5" />
            Video
          </dt>
          <dd className="font-semibold tabular-nums">{formatRupees(d.feePaise)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2">
            <PhoneCall aria-hidden className="text-primary size-5" />
            Audio
          </dt>
          <dd className="font-semibold tabular-nums">{formatRupees(d.audioFeePaise)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2">
            <ArrowsClockwise aria-hidden className="text-primary size-5" />
            Follow-up within 7 days
          </dt>
          <dd className="font-semibold tabular-nums">{formatRupees(d.followUpFeePaise)}</dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-4">
        <p className="text-ink-muted flex items-center gap-2 text-sm">
          <Clock aria-hidden className="size-4" />
          Times are in Indian Standard Time (IST)
        </p>
        {days.length ? (
          days.map(([date, slots]) => (
            <div key={date}>
              <h3 className="text-ink mb-2 text-base font-semibold">{formatSlotDay(date)}</h3>
              <ul className="flex flex-wrap gap-2">
                {slots.slice(0, TIMES_PER_DAY).map((slot) => (
                  <li key={slot.id}>
                    <Link
                      href={`/book/${d.id}?slot=${slot.id}`}
                      className="border-line-strong text-ink hover:bg-primary-soft inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-medium tabular-nums transition-colors"
                    >
                      {formatSlotTime(slot.time)}
                      <span className="sr-only">, {formatSlotDay(date)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <p className="text-ink-muted">No free times this week. Check again tomorrow.</p>
        )}
      </div>

      <ButtonLink href={`/book/${d.id}`} size="lg" className="mt-5 w-full">
        See all times and book
      </ButtonLink>
    </section>
  );
}
