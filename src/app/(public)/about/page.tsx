import type { Metadata } from "next";
import { Lock, SealCheck, Translate, Heartbeat } from "@phosphor-icons/react/ssr";
import { PageShell } from "@/components/content/page-shell";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "About ViniCure" };

const principles = [
  {
    icon: SealCheck,
    title: "Only registered doctors",
    text: "Every doctor’s registration is checked by a person before they see a patient, and the number is on every prescription.",
  },
  {
    icon: Lock,
    title: "Your records are yours",
    text: "Encrypted, stored in India, visible to you and your doctor. We log every access and we do not sell your data.",
  },
  {
    icon: Translate,
    title: "Care in your language",
    text: "Find doctors who speak Hindi, Tamil, Bengali, Marathi and more, so nothing gets lost in translation.",
  },
  {
    icon: Heartbeat,
    title: "Honest about limits",
    text: "Online care cannot do everything. We tell you when you need to be seen in person, and what to do in an emergency.",
  },
];

export default function AboutPage() {
  return (
    <PageShell
      title="About ViniCure"
      intro="We help people in India reach a registered doctor quickly, without losing privacy or trust."
    >
      <div className="max-w-3xl">
        <p className="text-lg">
          Good care should not depend on how far you live from a clinic or how long you can wait.
          ViniCure brings registered doctors to your phone, keeps your health records safe, and
          makes the next step clear after every consultation.
        </p>
        <p className="text-ink-muted mt-4">
          [Company story, founders and registered entity details to be added by the team.]
        </p>
      </div>
      <section aria-labelledby="principles-h" className="mt-14">
        <h2 id="principles-h" className="text-2xl font-semibold sm:text-3xl">
          What we promise
        </h2>
        <ul className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {principles.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-4">
              <span className="bg-primary-soft text-primary flex size-12 shrink-0 items-center justify-center rounded-full">
                <Icon aria-hidden className="size-6" />
              </span>
              <div>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-ink-muted mt-1 max-w-md">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-12 flex flex-wrap gap-3">
        <ButtonLink href="/doctors" size="lg">
          Find a doctor
        </ButtonLink>
        <ButtonLink href="/support" variant="secondary" size="lg">
          Contact us
        </ButtonLink>
      </div>
    </PageShell>
  );
}
