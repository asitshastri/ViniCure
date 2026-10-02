import type { Metadata } from "next";
import { PageShell } from "@/components/content/page-shell";
import { ButtonLink } from "@/components/ui/button";
import { getVerificationSteps } from "@/lib/data/content";

export const metadata: Metadata = { title: "How we check doctors (draft) | ViniCure" };

export default function DoctorVerificationPage() {
  const steps = getVerificationSteps();
  return (
    <PageShell
      title="How we check our doctors"
      intro="Every doctor is checked by a person before they can see patients."
      draft
    >
      <ol className="grid max-w-3xl gap-8">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span
              aria-hidden
              className="font-display bg-primary flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
            >
              {i + 1}
            </span>
            <div>
              <h2 className="text-xl font-semibold">
                <span className="sr-only">Step {i + 1}: </span>
                {s.title}
              </h2>
              <p className="text-ink-muted mt-1">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <section aria-labelledby="see-h" className="bg-primary-tint mt-12 max-w-3xl rounded-2xl p-6">
        <h2 id="see-h" className="text-xl font-semibold">
          What you can see on a doctor’s profile
        </h2>
        <p className="text-ink-muted mt-2">
          The registration number and the council that issued it, qualifications, years of
          experience and languages. The same registration number appears on every prescription you
          receive.
        </p>
        <p className="text-ink-muted mt-2">
          If something does not look right, tell us on the grievance page and we will look into it.
        </p>
        <ButtonLink href="/grievance" variant="secondary" className="mt-4">
          Report a concern
        </ButtonLink>
      </section>
    </PageShell>
  );
}
