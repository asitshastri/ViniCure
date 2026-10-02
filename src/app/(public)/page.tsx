import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Baby,
  Bone,
  Brain,
  CalendarCheck,
  Heart,
  LockKey,
  MagnifyingGlass,
  MapPin,
  Quotes,
  SealCheck,
  Star,
  Stethoscope,
  Tooth,
  VideoCamera,
  Wind,
  Drop,
  Translate,
  FileText,
  Bell,
} from "@phosphor-icons/react/ssr";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { getHomeContent } from "@/lib/data/home";
import type { Specialty } from "@/lib/types";

export const metadata: Metadata = {
  title: "ViniCure: talk to a registered doctor online",
  description:
    "Video consultations with registered Indian doctors. Private records, clear fees, prescriptions in minutes.",
};

const specialtyIcons: Record<Specialty["icon"], typeof Stethoscope> = {
  stethoscope: Stethoscope,
  baby: Baby,
  heart: Heart,
  brain: Brain,
  bone: Bone,
  skin: Drop,
  lungs: Wind,
  tooth: Tooth,
  eye: Stethoscope,
};

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

const steps = [
  {
    icon: MagnifyingGlass,
    title: "Find a doctor",
    text: "Search by problem or specialty. Fees and next slots are shown up front.",
  },
  {
    icon: CalendarCheck,
    title: "Book and pay",
    text: "Pick a time in IST and pay securely. You get a reminder before the call.",
  },
  {
    icon: VideoCamera,
    title: "Talk and get your prescription",
    text: "Join from your phone. Your prescription and notes appear in your records.",
  },
];

const trust = [
  {
    icon: SealCheck,
    title: "Registration verified",
    text: "Every doctor's council registration is checked.",
  },
  {
    icon: LockKey,
    title: "Encrypted records",
    text: "Your health data is encrypted and only you and your doctor can open it.",
  },
  {
    icon: MapPin,
    title: "Data stays in India",
    text: "Stored in Indian data centres under Indian law.",
  },
];

const benefits = [
  {
    icon: Translate,
    title: "In your language",
    text: "Choose doctors who speak Hindi, Gujarati, Tamil and more.",
  },
  {
    icon: FileText,
    title: "All records in one place",
    text: "Prescriptions, reports and photos, ready for your next visit.",
  },
  {
    icon: Bell,
    title: "Reminders that help",
    text: "SMS and WhatsApp reminders so you never miss a consultation.",
  },
];

export default function HomePage() {
  const { specialties, doctors, stories, faqs } = getHomeContent();

  return (
    <>
      {/* Hero */}
      <section className="from-primary-tint to-canvas bg-gradient-to-b">
        <div className="mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6 lg:pt-20 lg:pb-24">
          <div className="max-w-3xl">
            <Badge tone="primary" icon={<SealCheck weight="fill" className="size-4" />}>
              Registered doctors only
            </Badge>
            <h1 className="font-display text-ink mt-4 text-[2.5rem] leading-tight font-bold lg:text-[3.5rem]">
              See a doctor from home, without the wait.
            </h1>
            <p className="text-ink-muted mt-4 max-w-2xl text-lg">
              Video consultations with registered Indian doctors. Clear fees, private records and a
              prescription you can use the same day.
            </p>
            <form
              action="/doctors"
              method="get"
              role="search"
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              <label htmlFor="home-search" className="sr-only">
                Search by doctor, symptom or specialty
              </label>
              <div className="relative flex-1">
                <MagnifyingGlass
                  aria-hidden
                  className="text-ink-faint pointer-events-none absolute inset-y-0 left-3 my-auto size-5"
                />
                <input
                  id="home-search"
                  name="q"
                  type="search"
                  maxLength={80}
                  autoComplete="off"
                  placeholder="Search a doctor, symptom or specialty"
                  className="border-line-strong bg-surface text-ink placeholder:text-ink-faint h-12 w-full rounded-lg border pr-3 pl-11 text-base"
                />
              </div>
              <button
                type="submit"
                className="bg-primary hover:bg-primary-hover inline-flex h-12 items-center justify-center rounded-lg px-6 font-semibold text-white transition-colors"
              >
                Find a doctor
              </button>
            </form>
            <p className="text-ink-muted mt-3 text-sm">
              Not an emergency service. In an emergency call 112 or go to the nearest hospital.
            </p>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section aria-label="Why patients trust ViniCure" className="border-line bg-surface border-y">
        <ul className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 md:grid-cols-3">
          {trust.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-3">
              <span
                aria-hidden
                className="bg-primary-soft text-primary flex size-10 shrink-0 items-center justify-center rounded-full"
              >
                <Icon className="size-5" />
              </span>
              <div>
                <p className="font-display text-ink font-semibold">{title}</p>
                <p className="text-ink-muted text-sm">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="how-heading">
        <h2 id="how-heading" className="font-display text-ink text-3xl font-semibold">
          How it works
        </h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <li key={title}>
              <Card className="h-full">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="bg-primary flex size-10 items-center justify-center rounded-full text-white"
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="text-ink-muted text-sm font-semibold">Step {i + 1}</span>
                </div>
                <CardTitle className="mt-4">{title}</CardTitle>
                <p className="text-ink-muted mt-1">{text}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* Specialties */}
      <section className="bg-primary-tint" aria-labelledby="spec-heading">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="spec-heading" className="font-display text-ink text-3xl font-semibold">
              Find a doctor by specialty
            </h2>
            <Link
              href="/specialties"
              className="text-primary inline-flex min-h-11 items-center gap-1 font-semibold hover:underline"
            >
              All specialties <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {specialties.map((s) => {
              const Icon = specialtyIcons[s.icon];
              return (
                <li key={s.slug}>
                  <Link
                    href={`/doctors?specialty=${s.slug}`}
                    className="border-line bg-surface hover:border-primary flex h-full flex-col gap-2 rounded-xl border p-4 transition-colors"
                  >
                    <span
                      aria-hidden
                      className="bg-primary-soft text-primary flex size-10 items-center justify-center rounded-full"
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="font-display text-ink font-semibold">{s.name}</span>
                    <span className="text-ink-muted text-sm">{s.blurb}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Featured doctors */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="doc-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="doc-heading" className="font-display text-ink text-3xl font-semibold">
            Doctors available soon
          </h2>
          <Link
            href="/doctors"
            className="text-primary inline-flex min-h-11 items-center gap-1 font-semibold hover:underline"
          >
            See all doctors <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        <p className="text-ink-muted mt-1 text-sm">
          Sample doctors shown for design review. Not real people.
        </p>
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {doctors.map((d) => (
            <li key={d.id}>
              <Card className="flex h-full flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={d.name} size="lg" />
                  <div>
                    <p className="font-display text-ink font-semibold">{d.name}</p>
                    <p className="text-ink-muted text-sm">{d.specialty}</p>
                  </div>
                </div>
                <Badge
                  tone="success"
                  icon={<SealCheck weight="fill" className="size-3.5" />}
                  className="self-start"
                >
                  Reg. {d.registrationNumber}
                </Badge>
                <p className="text-ink-muted text-sm">
                  {d.experienceYears} years · {d.languages.join(", ")}
                </p>
                <p className="text-ink flex items-center gap-1 text-sm">
                  <Star aria-hidden weight="fill" className="text-warning size-4" />
                  <span className="font-semibold">{d.rating}</span>
                  <span className="text-ink-muted">({d.reviewCount} reviews)</span>
                </p>
                <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                  <div>
                    <p className="text-ink font-semibold tabular-nums">{rupees(d.feePaise)}</p>
                    <p className="text-ink-muted text-xs">Next: {d.nextSlot}</p>
                  </div>
                  <ButtonLink href={`/doctors/${d.id}`} size="sm" variant="secondary">
                    View<span className="sr-only"> {d.name}</span>
                  </ButtonLink>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/* Consultation types and benefits on dark band */}
      <section className="bg-dock on-dark text-white" aria-labelledby="ben-heading">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 id="ben-heading" className="font-display text-3xl font-semibold">
              Care that fits your day
            </h2>
            <p className="mt-3 text-white/80">
              Choose a video call now, or book a time that suits you. Follow-ups stay with the same
              doctor, so you never repeat your story.
            </p>
            <ButtonLink
              href="/doctors"
              size="lg"
              className="!text-dock hover:bg-primary-soft mt-6 bg-white"
            >
              Book a consultation
            </ButtonLink>
          </div>
          <ul className="grid gap-5">
            {benefits.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10"
                >
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="font-display font-semibold">{title}</p>
                  <p className="text-sm text-white/80">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Patient stories */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="story-heading">
        <h2 id="story-heading" className="font-display text-ink text-3xl font-semibold">
          What patients say
        </h2>
        <p className="text-ink-muted mt-1 text-sm">
          Sample stories for design review. Real stories need patient consent.
        </p>
        <ul className="mt-6 grid gap-5 md:grid-cols-3">
          {stories.map((s) => (
            <li key={s.id}>
              <Card className="flex h-full flex-col gap-3">
                <Quotes aria-hidden weight="fill" className="text-primary size-6" />
                <blockquote className="text-ink">{s.quote}</blockquote>
                <p className="text-ink-muted mt-auto text-sm">
                  {s.name}, {s.place}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ teaser */}
      <section className="bg-primary-tint" aria-labelledby="faq-heading">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 id="faq-heading" className="font-display text-ink text-3xl font-semibold">
            Common questions
          </h2>
          <Accordion className="mt-6">
            {faqs.map((f) => (
              <AccordionItem key={f.id} question={f.question} group="home-faq">
                {f.answer}
              </AccordionItem>
            ))}
          </Accordion>
          <Link
            href="/faq"
            className="text-primary mt-4 inline-flex min-h-11 items-center gap-1 font-semibold hover:underline"
          >
            More questions <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section
        className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6"
        aria-labelledby="cta-heading"
      >
        <h2 id="cta-heading" className="font-display text-ink text-3xl font-semibold">
          Ready to talk to a doctor?
        </h2>
        <p className="text-ink-muted mx-auto mt-2 max-w-xl">
          Sign in with your phone number. No password to remember.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/doctors" size="lg">
            Find a doctor
          </ButtonLink>
          <ButtonLink href="/login" size="lg" variant="secondary">
            Sign in
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
