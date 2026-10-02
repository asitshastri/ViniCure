import type { Metadata } from "next";
import { PageShell } from "@/components/content/page-shell";
import { ButtonLink } from "@/components/ui/button";
import { getAllStories } from "@/lib/data/articles";

export const metadata: Metadata = { title: "Patient stories | ViniCure" };

export default function StoriesPage() {
  const stories = getAllStories();
  return (
    <PageShell
      title="Patient stories"
      intro="Sample stories for design review. Real stories are shared only with the patient’s written consent."
    >
      <ul className="grid max-w-4xl gap-8">
        {stories.map((s) => (
          <li key={s.id}>
            <figure className="border-line border-l-4 pl-6">
              <blockquote className="font-display text-ink text-xl leading-snug font-medium sm:text-2xl">
                “{s.quote}”
              </blockquote>
              <figcaption className="text-ink-muted mt-3">
                <span className="text-ink font-semibold">{s.name}</span>, {s.place}. {s.context}.
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <ButtonLink href="/doctors" size="lg" className="mt-12">
        Find a doctor
      </ButtonLink>
    </PageShell>
  );
}
