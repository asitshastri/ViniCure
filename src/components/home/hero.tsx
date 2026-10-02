import Link from "next/link";
import {
  CalendarCheck,
  FileText,
  MagnifyingGlass,
  SealCheck,
  VideoCamera,
} from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Input, Select } from "@/components/ui/field";
import type { Specialty } from "@/lib/types";

type HeroProps = { specialties: Specialty[]; popular: Specialty[] };

export function Hero({ specialties, popular }: HeroProps) {
  return (
    <section aria-labelledby="hero-heading" className="px-4 pt-6 sm:px-6 sm:pt-10">
      <div className="from-primary-soft to-primary-tint mx-auto grid max-w-6xl gap-10 rounded-[20px] bg-gradient-to-br px-5 py-10 sm:px-10 sm:py-14 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-12 lg:px-14">
        <div>
          <h1
            id="hero-heading"
            className="text-ink max-w-xl text-[2.5rem] leading-[1.1] font-bold sm:text-5xl lg:text-[3.5rem]"
          >
            A registered doctor, from your phone, today
          </h1>
          <p className="text-ink-muted mt-5 max-w-lg text-lg">
            Talk to a doctor in Hindi, Tamil, Bengali or English. Your records stay private and your
            prescription arrives when the call ends.
          </p>

          <form action="/doctors" method="get" role="search" className="mt-8 max-w-xl">
            <div className="border-line bg-surface shadow-card grid gap-3 rounded-2xl border p-3 sm:p-4">
              <div>
                <label htmlFor="hero-q" className="text-ink mb-1 block text-sm font-medium">
                  Doctor or symptom
                </label>
                <Input
                  id="hero-q"
                  name="q"
                  type="search"
                  autoComplete="off"
                  placeholder="Fever, skin rash, Dr. Rao"
                  leading={<MagnifyingGlass className="size-5" />}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <label
                    htmlFor="hero-specialty"
                    className="text-ink mb-1 block text-sm font-medium"
                  >
                    Specialty
                  </label>
                  <Select id="hero-specialty" name="specialty" defaultValue="">
                    <option value="">All specialties</option>
                    {specialties.map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button type="submit" size="lg">
                  Find doctors
                </Button>
              </div>
            </div>
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-ink-muted text-sm">Popular:</span>
            {popular.map((s) => (
              <Link
                key={s.slug}
                href={`/doctors?specialty=${s.slug}`}
                className="border-line-strong bg-surface text-ink hover:bg-primary-soft inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors"
              >
                {s.name}
              </Link>
            ))}
          </div>
        </div>

        <ConsultationPreview />
      </div>
    </section>
  );
}

/** Static picture of what a consultation looks like. Not a live widget: all values are invented. */
function ConsultationPreview() {
  return (
    <figure
      className="mx-auto w-full max-w-md lg:max-w-none"
      aria-label="Example of a consultation"
    >
      <div className="border-line bg-surface shadow-pop rounded-2xl border p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Avatar name="Dr. Maya Rao" size="lg" />
          <div className="min-w-0">
            <p className="font-display text-ink text-lg font-semibold">Dr. Maya Rao</p>
            <p className="text-ink-muted text-sm">General physician, 14 years</p>
          </div>
          <Badge
            tone="success"
            icon={<SealCheck weight="fill" className="size-3.5" />}
            className="ml-auto shrink-0"
          >
            Verified
          </Badge>
        </div>
        <p className="text-ink-muted mt-3 text-sm">Medical council registration KA/45678/2011</p>

        <div className="bg-dock mt-4 flex items-center gap-3 rounded-xl px-4 py-4 text-white">
          <VideoCamera aria-hidden weight="fill" className="size-6 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Video consultation, 6:30 pm</p>
            <p className="text-sm text-white/80">Joins from your phone. No app to install.</p>
          </div>
        </div>

        <ul className="mt-4 grid gap-3 text-sm">
          <li className="flex items-center gap-3">
            <CalendarCheck aria-hidden className="text-primary size-5 shrink-0" />
            <span className="text-ink">Fee ₹499, paid before the call</span>
          </li>
          <li className="flex items-center gap-3">
            <FileText aria-hidden className="text-primary size-5 shrink-0" />
            <span className="text-ink">Prescription with her registration number</span>
          </li>
        </ul>
      </div>
      <figcaption className="text-ink-muted mt-3 text-center text-sm">
        Example only. Doctor and times shown are sample data.
      </figcaption>
    </figure>
  );
}
