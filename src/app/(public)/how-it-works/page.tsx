import type { Metadata } from "next";
import { CheckCircle, Warning } from "@phosphor-icons/react/ssr";
import { PageShell } from "@/components/content/page-shell";
import { ButtonLink } from "@/components/ui/button";
import { getHowItWorks } from "@/lib/data/content";

export const metadata: Metadata = {
  title: "How it works | ViniCure",
  description: "From finding a doctor to getting your prescription, step by step.",
};

export default function HowItWorksPage() {
  const { steps, fitsOnline, needsInPerson } = getHowItWorks();
  return (
    <PageShell
      title="How ViniCure works"
      intro="Five steps from “I am not well” to a prescription in your records."
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

      <div className="mt-16 grid gap-6 md:grid-cols-2">
        <section aria-labelledby="fits-h" className="bg-success-soft rounded-2xl p-6">
          <h2 id="fits-h" className="text-xl font-semibold">
            Online care works well for
          </h2>
          <ul className="mt-4 grid gap-2">
            {fitsOnline.map((f) => (
              <li key={f} className="flex gap-2">
                <CheckCircle
                  aria-hidden
                  weight="fill"
                  className="text-success mt-1 size-5 shrink-0"
                />
                {f}
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="not-h" className="bg-danger-soft rounded-2xl p-6">
          <h2 id="not-h" className="text-xl font-semibold">
            Go in person, or call 112, for
          </h2>
          <ul className="mt-4 grid gap-2">
            {needsInPerson.map((f) => (
              <li key={f} className="flex gap-2">
                <Warning aria-hidden weight="fill" className="text-danger mt-1 size-5 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-12 flex flex-wrap gap-3">
        <ButtonLink href="/doctors" size="lg">
          Find a doctor
        </ButtonLink>
        <ButtonLink href="/doctor-verification" variant="secondary" size="lg">
          How we check doctors
        </ButtonLink>
      </div>
    </PageShell>
  );
}
