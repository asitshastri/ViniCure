import type { LegalDoc } from "@/lib/types";
import { PageShell } from "./page-shell";

/** Long legal text: contents list on the side from 1024px, a short list on top before that. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <PageShell title={doc.title} intro={doc.summary} draft>
      <div className="grid gap-10 lg:grid-cols-[16rem_1fr] lg:gap-16">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-ink-muted mb-2 text-base font-semibold">On this page</h2>
          <ol className="grid gap-1">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-primary hover:bg-primary-soft block min-h-11 content-center rounded-lg px-2 underline-offset-2 hover:underline"
                >
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="max-w-prose">
          <p className="text-ink-muted mb-8 text-sm">Draft of {doc.draftDate}. Not yet in force.</p>
          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="mb-10">
              <h2 id={`${s.id}-h`} className="text-2xl font-semibold">
                {s.heading}
              </h2>
              {s.paragraphs.map((p) => (
                <p key={p} className="text-ink mt-3">
                  {p}
                </p>
              ))}
              {s.items ? (
                <ul className="text-ink mt-3 grid list-disc gap-2 pl-5">
                  {s.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </article>
      </div>
    </PageShell>
  );
}
