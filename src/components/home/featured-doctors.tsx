import Link from "next/link";
import { ArrowRight, Clock, SealCheck, Star, Translate } from "@phosphor-icons/react/ssr";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonStyles } from "@/components/ui/button";
import { formatRupees } from "@/lib/format";
import type { DoctorSummary } from "@/lib/types";
import { Section } from "./section";

export function FeaturedDoctors({ doctors }: { doctors: DoctorSummary[] }) {
  return (
    <Section
      id="doctors"
      title="Doctors available soon"
      intro="Sample profiles. Real doctors appear here after verification."
      action={
        <Link href="/doctors" className={buttonStyles({ variant: "secondary" })}>
          See all doctors
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      }
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {doctors.map((d) => (
          <li
            key={d.id}
            className="border-line bg-surface shadow-card flex flex-col rounded-xl border p-5"
          >
            <div className="flex items-start gap-3">
              <Avatar name={d.name} size="lg" />
              <div className="min-w-0">
                <h3 className="text-ink text-lg leading-snug font-semibold">{d.name}</h3>
                <p className="text-ink-muted text-sm">{d.specialty}</p>
              </div>
            </div>
            <p className="text-ink-muted mt-3 text-sm">
              {d.qualifications}, {d.experienceYears} years
            </p>
            <p className="mt-1">
              <Badge tone="success" icon={<SealCheck weight="fill" className="size-3.5" />}>
                Reg. {d.registrationNumber}
              </Badge>
            </p>
            <dl className="text-ink-muted mt-4 grid gap-2 text-sm">
              <div className="flex items-center gap-2">
                <dt className="sr-only">Rating</dt>
                <Star aria-hidden weight="fill" className="text-warning size-4 shrink-0" />
                <dd>
                  <span className="text-ink font-semibold">{d.rating.toFixed(1)}</span> (
                  {d.reviewCount} reviews)
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="sr-only">Languages</dt>
                <Translate aria-hidden className="size-4 shrink-0" />
                <dd>{d.languages.join(", ")}</dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="sr-only">Next available</dt>
                <Clock aria-hidden className="size-4 shrink-0" />
                <dd>{d.nextSlot}</dd>
              </div>
            </dl>
            <div className="mt-5 flex items-center justify-between gap-3 pt-1">
              <p className="font-display text-ink text-xl font-semibold tabular-nums">
                {formatRupees(d.feePaise)}
              </p>
              <ButtonLink
                href={`/doctors/${d.id}`}
                variant="secondary"
                aria-label={`View profile of ${d.name}`}
              >
                View profile
              </ButtonLink>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
