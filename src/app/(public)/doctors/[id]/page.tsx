import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle, GraduationCap, SealCheck, Star, Translate } from "@phosphor-icons/react/ssr";
import { BookingCard } from "@/components/doctors/booking-card";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { getDoctor, getDoctorIds } from "@/lib/data/doctors";

export function generateStaticParams() {
  return getDoctorIds().map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const doctor = getDoctor((await params).id);
  return {
    title: doctor
      ? `${doctor.name}, ${doctor.specialty} | ViniCure`
      : "Doctor not found | ViniCure",
  };
}

export default async function DoctorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const doctor = getDoctor((await params).id);
  if (!doctor) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Breadcrumbs
        items={[{ label: "Find a doctor", href: "/doctors" }, { label: doctor.name }]}
        className="mb-6"
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:gap-10">
        <div className="grid min-w-0 content-start gap-10">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <Avatar name={doctor.name} size="xl" />
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold sm:text-4xl">{doctor.name}</h1>
              <p className="text-ink-muted mt-1 text-lg">
                {doctor.specialty}. {doctor.qualifications}.
              </p>
              <p className="mt-3">
                <Badge tone="success" icon={<SealCheck weight="fill" className="size-3.5" />}>
                  Reg. {doctor.registrationNumber}, {doctor.council}
                </Badge>
              </p>
              <dl className="text-ink-muted mt-4 flex flex-wrap gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <dt className="sr-only">Rating</dt>
                  <Star aria-hidden weight="fill" className="text-warning size-5" />
                  <dd>
                    <span className="text-ink font-semibold">{doctor.rating.toFixed(1)}</span> (
                    {doctor.reviewCount} reviews)
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="sr-only">Experience</dt>
                  <GraduationCap aria-hidden className="size-5" />
                  <dd>{doctor.experienceYears} years of experience</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="sr-only">Languages</dt>
                  <Translate aria-hidden className="size-5" />
                  <dd>{doctor.languages.join(", ")}</dd>
                </div>
              </dl>
              <ButtonLink href="#book-heading" className="mt-5 lg:hidden">
                See free times
              </ButtonLink>
            </div>
          </header>

          <section aria-labelledby="about-heading">
            <h2 id="about-heading" className="text-2xl font-semibold">
              About
            </h2>
            <p className="text-ink-muted mt-3 max-w-prose text-lg">{doctor.about}</p>
          </section>

          <section aria-labelledby="treats-heading">
            <h2 id="treats-heading" className="text-2xl font-semibold">
              Can help with
            </h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {doctor.treats.map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <CheckCircle aria-hidden weight="fill" className="text-success size-5 shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
            <p className="text-ink-muted mt-4 text-sm">
              Online consultations are not for emergencies. Call 112 or go to the nearest hospital.
            </p>
          </section>

          <section aria-labelledby="edu-heading">
            <h2 id="edu-heading" className="text-2xl font-semibold">
              Education and registration
            </h2>
            <ul className="text-ink-muted mt-3 grid gap-2">
              {doctor.education.map((e) => (
                <li key={e}>{e}</li>
              ))}
              <li>
                Registered with the {doctor.council}, number {doctor.registrationNumber}. We checked
                this before the profile went live (sample data for now).
              </li>
            </ul>
          </section>

          <section aria-labelledby="reviews-heading">
            <h2 id="reviews-heading" className="text-2xl font-semibold">
              Patient reviews
            </h2>
            <p className="text-ink-muted mt-1 text-sm">
              Sample reviews. Only patients who had a consultation can review.
            </p>
            <ul className="divide-line border-line mt-4 divide-y border-y">
              {doctor.reviews.map((r) => (
                <li key={r.id} className="py-4">
                  <p className="flex items-center gap-2">
                    <span className="font-semibold">{r.author}</span>
                    <span className="text-ink-muted text-sm">{r.when}</span>
                  </p>
                  <p
                    className="text-warning flex items-center gap-1 text-sm"
                    role="img"
                    aria-label={`${r.rating} out of 5 stars`}
                  >
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star
                        key={i}
                        aria-hidden
                        weight={i < r.rating ? "fill" : "regular"}
                        className="size-4"
                      />
                    ))}
                  </p>
                  <p className="text-ink mt-2 max-w-prose">{r.text}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside aria-label="Booking">
          <BookingCard doctor={doctor} />
        </aside>
      </div>
    </div>
  );
}
