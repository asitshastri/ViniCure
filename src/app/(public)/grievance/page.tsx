import type { Metadata } from "next";
import { EnvelopeSimple, Clock, User } from "@phosphor-icons/react/ssr";
import { PageShell } from "@/components/content/page-shell";
import { ButtonLink } from "@/components/ui/button";
import { getGrievanceSteps } from "@/lib/data/content";

export const metadata: Metadata = { title: "Grievance officer (draft) | ViniCure" };

export default function GrievancePage() {
  const steps = getGrievanceSteps();
  return (
    <PageShell
      title="Grievance officer"
      intro="If something went wrong with your care, your data or a payment, tell us here."
      draft
    >
      <section
        aria-labelledby="contact-h"
        className="border-line bg-surface max-w-3xl rounded-xl border p-6"
      >
        <h2 id="contact-h" className="text-xl font-semibold">
          How to reach us
        </h2>
        <dl className="mt-4 grid gap-3">
          <div className="flex items-start gap-3">
            <User aria-hidden className="text-primary mt-0.5 size-5 shrink-0" />
            <dt className="sr-only">Name</dt>
            <dd>[Name of grievance officer to be added]</dd>
          </div>
          <div className="flex items-start gap-3">
            <EnvelopeSimple aria-hidden className="text-primary mt-0.5 size-5 shrink-0" />
            <dt className="sr-only">Email</dt>
            <dd>[Grievance email address to be added]</dd>
          </div>
          <div className="flex items-start gap-3">
            <Clock aria-hidden className="text-primary mt-0.5 size-5 shrink-0" />
            <dt className="sr-only">Hours</dt>
            <dd>[Office hours and postal address to be added]</dd>
          </div>
        </dl>
        <ButtonLink href="/support" className="mt-5">
          Send a message through support
        </ButtonLink>
      </section>

      <section aria-labelledby="process-h" className="mt-12 max-w-3xl">
        <h2 id="process-h" className="text-2xl font-semibold">
          What happens to your complaint
        </h2>
        <ol className="mt-6 grid gap-6">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span
                aria-hidden
                className="font-display bg-primary flex size-10 shrink-0 items-center justify-center rounded-full font-bold text-white"
              >
                {i + 1}
              </span>
              <div>
                <h3 className="text-lg font-semibold">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </h3>
                <p className="text-ink-muted mt-1">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </PageShell>
  );
}
