import type { Metadata } from "next";
import { PageShell } from "@/components/content/page-shell";
import { ButtonLink } from "@/components/ui/button";
import { getPatientRights } from "@/lib/data/content";

export const metadata: Metadata = { title: "Your rights as a patient (draft) | ViniCure" };

export default function PatientRightsPage() {
  const rights = getPatientRights();
  return (
    <PageShell
      title="Your rights as a patient"
      intro="Your health information belongs to you. Here is what you can do with it."
      draft
    >
      <ul className="grid max-w-3xl gap-4">
        {rights.map((r) => (
          <li key={r.id} className="border-line bg-surface rounded-xl border p-5">
            <h2 className="text-xl font-semibold">{r.title}</h2>
            <p className="text-ink-muted mt-1">{r.text}</p>
          </li>
        ))}
      </ul>
      <section aria-labelledby="use-h" className="mt-10 max-w-3xl">
        <h2 id="use-h" className="text-2xl font-semibold">
          How to use these rights
        </h2>
        <p className="text-ink-muted mt-2">
          Signed-in patients find these controls in settings: consents, downloads and deletion
          requests. If you cannot sign in, write to the grievance officer.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <ButtonLink href="/patient/settings">Open my settings</ButtonLink>
          <ButtonLink href="/grievance" variant="secondary">
            Contact the grievance officer
          </ButtonLink>
        </div>
      </section>
    </PageShell>
  );
}
