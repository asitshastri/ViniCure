import Link from "next/link";
import { Phone, ShieldCheck } from "@phosphor-icons/react/ssr";
import { Logo } from "@/components/ui/logo";

const columns: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
  {
    title: "For patients",
    links: [
      { label: "Find doctors", href: "/doctors" },
      { label: "Specialties", href: "/specialties" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Patient rights", href: "/patient-rights" },
    ],
  },
  {
    title: "For doctors",
    links: [
      { label: "Join ViniCure", href: "/for-doctors" },
      { label: "Doctor sign in", href: "/login/staff" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Health blog", href: "/blog" },
      { label: "FAQs", href: "/faq" },
      { label: "Contact and support", href: "/support" },
      { label: "Grievance officer", href: "/support#grievance" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy policy", href: "/privacy-policy" },
      { label: "Terms of use", href: "/terms" },
      { label: "Cookie policy", href: "/cookie-policy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-line bg-surface border-t">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 xl:grid-cols-[1fr_3fr]">
          <div className="flex max-w-xs flex-col gap-4">
            <Logo className="h-10 self-start" />
            <p className="text-ink-muted text-sm">
              Talk to verified doctors by video from home. Private by design and built for India.
            </p>
            <p className="text-ink-muted flex items-start gap-2 text-sm">
              <ShieldCheck
                aria-hidden
                weight="fill"
                className="text-primary mt-0.5 size-5 shrink-0"
              />
              Your records are encrypted and only you and your doctor can see them.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            {columns.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h2 className="font-display text-ink text-base font-semibold">{column.title}</h2>
                <ul className="mt-3 flex flex-col">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-ink-muted hover:text-primary inline-flex min-h-11 items-center text-base hover:underline"
                      >
                        {link.label}
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
            <span>
              ViniCure is not for emergencies. In an emergency call <strong>112</strong> or go to
              the nearest hospital.
            </span>
          </p>
          <p>© {new Date().getFullYear()} ViniCure. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
