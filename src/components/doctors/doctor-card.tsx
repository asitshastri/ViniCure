import Link from "next/link";
import { CalendarCheck, Clock, SealCheck, Star, Translate } from "@phosphor-icons/react/ssr";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatRupees } from "@/lib/format";
import type { DoctorSummary } from "@/lib/types";

/** One row in the directory. The whole name is a link; the buttons repeat it with the slot purpose. */
export function DoctorCard({ doctor: d }: { doctor: DoctorSummary }) {
  return (
    <article
      aria-labelledby={`${d.id}-name`}
      className="border-line bg-surface shadow-card grid gap-4 rounded-xl border p-5 sm:grid-cols-[auto_1fr_auto] sm:gap-6"
    >
      <Avatar name={d.name} size="xl" className="hidden sm:flex" />
      <div className="min-w-0">
        <div className="flex items-start gap-3 sm:block">
          <Avatar name={d.name} size="lg" className="sm:hidden" />
          <div>
            <h2 id={`${d.id}-name`} className="text-xl font-semibold">
              <Link href={`/doctors/${d.id}`} className="hover:text-primary hover:underline">
                {d.name}
              </Link>
            </h2>
            <p className="text-ink-muted">
              {d.specialty}. {d.qualifications}.
              {d.experienceYears !== undefined ? ` ${d.experienceYears} years.` : null}
            </p>
          </div>
        </div>
        <p className="mt-2">
          <Badge tone="success" icon={<SealCheck weight="fill" className="size-3.5" />}>
            Reg. {d.registrationNumber}
          </Badge>
        </p>
        <dl className="text-ink-muted mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Rating</dt>
            <Star aria-hidden weight="fill" className="text-warning size-4" />
            <dd>
              {d.reviewCount > 0 ? (
                <>
                  <span className="text-ink font-semibold">{d.rating.toFixed(1)}</span> (
                  {d.reviewCount} {d.reviewCount === 1 ? "review" : "reviews"})
                </>
              ) : (
                "New on ViniCure, no reviews yet"
              )}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Languages</dt>
            <Translate aria-hidden className="size-4" />
            <dd>{d.languages.join(", ")}</dd>
          </div>
        </dl>
      </div>
      <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-4 sm:w-52 sm:flex-col sm:items-stretch sm:justify-center sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
        <div>
          <p className="font-display text-ink text-2xl font-semibold tabular-nums">
            {formatRupees(d.feePaise)}
          </p>
          <p className="text-ink-muted flex items-center gap-1.5 text-sm">
            {d.availableToday ? (
              <CalendarCheck aria-hidden className="text-success size-4 shrink-0" />
            ) : (
              <Clock aria-hidden className="size-4 shrink-0" />
            )}
            <span>
              <span className="sr-only">Next available: </span>
              {d.nextSlot ?? (d.availableToday ? "Has times today" : "See free times")}
            </span>
          </p>
        </div>
        <ButtonLink href={`/doctors/${d.id}`} aria-label={`Book or view ${d.name}`}>
          View and book
        </ButtonLink>
      </div>
    </article>
  );
}
