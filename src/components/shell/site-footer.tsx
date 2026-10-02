import Link from "next/link";
import { Phone, ShieldCheck } from "@phosphor-icons/react/ssr";
import { Logo } from "@/components/ui/logo";
import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translate";

const columns: Array<{ title: MessageKey; links: Array<{ label: MessageKey; href: string }> }> = [
  {
    title: "footer.forPatients",
    links: [
      { label: "nav.findDoctors", href: "/doctors" },
      { label: "nav.specialties", href: "/specialties" },
      { label: "nav.howItWorks", href: "/how-it-works" },
      { label: "footer.patientRights", href: "/patient-rights" },
    ],
  },
  {
    title: "footer.forDoctors",
    links: [
      { label: "footer.joinViniCure", href: "/for-doctors" },
      { label: "footer.doctorSignIn", href: "/login/staff" },
    ],
  },
  {
    title: "footer.company",
    links: [
      { label: "footer.about", href: "/about" },
      { label: "footer.blog", href: "/blog" },
      { label: "footer.stories", href: "/stories" },
      { label: "footer.faqs", href: "/faq" },
      { label: "footer.support", href: "/support" },
      { label: "footer.grievance", href: "/grievance" },
    ],
  },
  {
    title: "footer.legal",
    links: [
      { label: "footer.privacyPolicy", href: "/privacy-policy" },
      { label: "footer.terms", href: "/terms" },
      { label: "footer.cookies", href: "/cookie-policy" },
    ],
  },
];

export async function SiteFooter() {
  const { t } = await getT();
  return (
    <footer className="border-line bg-surface border-t">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 xl:grid-cols-[1fr_3fr]">
          <div className="flex max-w-xs flex-col gap-4">
            <Logo className="h-10 self-start" />
            <p className="text-ink-muted text-sm">{t("footer.tagline")}</p>
            <p className="text-ink-muted flex items-start gap-2 text-sm">
              <ShieldCheck
                aria-hidden
                weight="fill"
                className="text-primary mt-0.5 size-5 shrink-0"
              />
              {t("footer.privacy")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            {columns.map((column) => (
              <nav key={column.title} aria-label={t(column.title)}>
                <h2 className="font-display text-ink text-base font-semibold">{t(column.title)}</h2>
                <ul className="mt-3 flex flex-col">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-ink-muted hover:text-primary inline-flex min-h-11 items-center text-base hover:underline"
                      >
                        {t(link.label)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
        <div className="border-line text-ink-muted mt-10 flex flex-col gap-3 border-t pt-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <Phone aria-hidden className="size-4 shrink-0" />
            <span>{t("footer.emergency", { number: "112" })}</span>
          </p>
          <p>{t("footer.rights", { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}
