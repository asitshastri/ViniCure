import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/content/page-shell";
import { SpecialtyGlyph } from "@/components/home/specialty-icon";
import { getSpecialtiesWithCounts } from "@/lib/data/content";

export const metadata: Metadata = {
  title: "Specialties | ViniCure",
  description: "All the kinds of doctors you can see online on ViniCure.",
};

export default function SpecialtiesPage() {
  const specialties = getSpecialtiesWithCounts();
  return (
    <PageShell
      title="Specialties"
      intro="Not sure where to start? A general physician can look at your problem and refer you on."
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {specialties.map((s) => (
          <li key={s.slug}>
            <Link
              href={`/doctors?specialty=${s.slug}`}
              className="border-line bg-surface hover:border-primary hover:bg-primary-tint flex h-full flex-col gap-3 rounded-xl border p-5 transition-colors"
            >
              <span className="bg-primary-soft text-primary flex size-12 items-center justify-center rounded-full">
                <SpecialtyGlyph icon={s.icon} className="size-6" />
              </span>
              <span className="font-display text-xl font-semibold">{s.name}</span>
              <span className="text-ink-muted">{s.blurb}</span>
              <span className="text-primary mt-auto font-semibold">
                {s.doctorCount} {s.doctorCount === 1 ? "doctor" : "doctors"} (sample)
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
