import type { Metadata } from "next";
import Link from "next/link";
import { Phone, Scales, Warning } from "@phosphor-icons/react/ssr";
import { PageShell } from "@/components/content/page-shell";
import { SupportForm } from "@/components/support/support-form";

export const metadata: Metadata = { title: "Contact and support | ViniCure" };

export default function SupportPage() {
  return (
    <PageShell
      title="Contact and support"
      intro="Tell us what went wrong or what you need. A person reads every message."
    >
      <div className="grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-14">
        <section
          aria-labelledby="form-h"
          className="border-line bg-surface shadow-card rounded-xl border p-6 sm:p-8"
        >
          <h2 id="form-h" className="mb-5 text-2xl font-semibold">
            Send us a message
          </h2>
          <SupportForm />
        </section>
        <aside aria-label="Other ways to get help" className="grid content-start gap-5">
          <div className="bg-danger-soft rounded-xl p-5">
            <p className="text-danger flex items-center gap-2 font-semibold">
              <Warning aria-hidden weight="fill" className="size-5" />
              In an emergency
            </p>
            <p className="mt-1">
              Call <strong>112</strong> or go to the nearest hospital. Do not wait for a reply from
              us.
            </p>
          </div>
          <div className="border-line bg-surface rounded-xl border p-5">
            <p className="flex items-center gap-2 font-semibold">
              <Phone aria-hidden className="text-primary size-5" />
              Helpline
            </p>
            <p className="text-ink-muted mt-1">[Phone number and hours to be added]</p>
          </div>
          <div id="grievance" className="border-line bg-surface rounded-xl border p-5">
            <p className="flex items-center gap-2 font-semibold">
              <Scales aria-hidden className="text-primary size-5" />
              Not happy with our answer?
            </p>
            <p className="text-ink-muted mt-1">Write to the grievance officer.</p>
            <Link
              href="/grievance"
              className="text-primary mt-2 inline-block min-h-11 content-center font-semibold underline"
            >
              Grievance officer
            </Link>
          </div>
          <p className="text-ink-muted text-sm">
            Many answers are on the{" "}
            <Link href="/faq" className="text-primary underline">
              FAQ page
            </Link>
            .
          </p>
        </aside>
      </div>
    </PageShell>
  );
}
