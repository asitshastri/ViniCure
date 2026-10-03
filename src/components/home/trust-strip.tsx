import { Database, Lock, SealCheck, ShieldCheck } from "@phosphor-icons/react/ssr";
import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translate";

const items: Array<{ icon: typeof Lock; title: MessageKey; text: MessageKey }> = [
  { icon: SealCheck, title: "home.trust.registrationTitle", text: "home.trust.registrationText" },
  { icon: Lock, title: "home.trust.encryptedTitle", text: "home.trust.encryptedText" },
  { icon: Database, title: "home.trust.indiaTitle", text: "home.trust.indiaText" },
  { icon: ShieldCheck, title: "home.trust.controlTitle", text: "home.trust.controlText" },
];

export async function TrustStrip() {
  const { t } = await getT();
  return (
    <section aria-label={t("home.trust.label")} className="px-4 pt-8 sm:px-6">
      <ul className="border-line mx-auto grid max-w-6xl gap-x-8 gap-y-6 border-b pb-8 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start gap-3">
            <Icon aria-hidden className="text-primary mt-0.5 size-7 shrink-0" />
            <div>
              <p className="text-ink font-semibold">{t(title)}</p>
              <p className="text-ink-muted text-sm">{t(text)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
