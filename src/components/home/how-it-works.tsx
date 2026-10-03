import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translate";
import { Section } from "./section";

const steps: Array<{ title: MessageKey; text: MessageKey }> = [
  { title: "home.how.s1Title", text: "home.how.s1Text" },
  { title: "home.how.s2Title", text: "home.how.s2Text" },
  { title: "home.how.s3Title", text: "home.how.s3Text" },
];

export async function HowItWorks() {
  const { t } = await getT();
  return (
    <Section id="how-it-works" title={t("home.how.title")} intro={t("home.how.intro")} tone="tint">
      <ol className="grid gap-8 lg:grid-cols-3 lg:gap-10">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-4 lg:flex-col">
            <span
              aria-hidden
              className="font-display bg-primary flex size-12 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
            >
              {i + 1}
            </span>
            <div>
              <h3 className="text-ink text-xl font-semibold">
                <span className="sr-only">{t("home.how.step", { n: i + 1 })}</span>
                {t(step.title)}
              </h3>
              <p className="text-ink-muted mt-2 max-w-sm">{t(step.text)}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
