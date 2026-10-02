import { Bell, FileText, FirstAid, UsersThree } from "@phosphor-icons/react/ssr";
import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translate";
import { Section } from "./section";

const benefits: Array<{ icon: typeof Bell; title: MessageKey; text: MessageKey }> = [
  { icon: FileText, title: "home.benefits.b1Title", text: "home.benefits.b1Text" },
  { icon: UsersThree, title: "home.benefits.b2Title", text: "home.benefits.b2Text" },
  { icon: Bell, title: "home.benefits.b3Title", text: "home.benefits.b3Text" },
  { icon: FirstAid, title: "home.benefits.b4Title", text: "home.benefits.b4Text" },
];

export async function Benefits() {
  const { t } = await getT();
  return (
    <Section id="benefits" title={t("home.benefits.title")} intro={t("home.benefits.intro")}>
      <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {benefits.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-4">
            <span className="bg-primary-soft text-primary flex size-12 shrink-0 items-center justify-center rounded-full">
              <Icon aria-hidden className="size-6" />
            </span>
            <div>
              <h3 className="text-ink text-lg font-semibold">{t(title)}</h3>
              <p className="text-ink-muted mt-1 max-w-md">{t(text)}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
