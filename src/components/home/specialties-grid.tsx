import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { buttonStyles } from "@/components/ui/button";
import type { Specialty } from "@/lib/types";
import { Section } from "./section";
import { SpecialtyGlyph } from "./specialty-icon";

export function SpecialtiesGrid({ specialties }: { specialties: Specialty[] }) {
  return (
    <Section
      id="specialties"
      title="Find a doctor by what you need help with"
      intro="Not sure which one? A general physician can start and refer you on."
      action={
        <Link href="/specialties" className={buttonStyles({ variant: "secondary" })}>
          All specialties
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      }
    >
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {specialties.map((s) => (
          <li key={s.slug}>
            <Link
              href={`/doctors?specialty=${s.slug}`}
              className="border-line bg-surface hover:border-primary hover:bg-primary-tint flex min-h-20 items-center gap-4 rounded-xl border p-4 transition-colors"
            >
              <span className="bg-primary-soft text-primary flex size-12 shrink-0 items-center justify-center rounded-full">
                <SpecialtyGlyph icon={s.icon} className="size-6" />
              </span>
              <span>
                <span className="font-display text-ink block text-lg font-semibold">{s.name}</span>
                <span className="text-ink-muted block text-sm">{s.blurb}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
